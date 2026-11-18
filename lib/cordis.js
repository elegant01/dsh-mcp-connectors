const DSH_MCP_PLUGIN = "@deepseek-ai/dsh-mcp-client";
function indentOf(line) {
  const m = line.match(/^[\t ]*/);
  return m ? m[0].length : 0;
}
function splitTopLevel(input, sep) {
  const out = [];
  let buf = "";
  let depth = 0;
  let quote = null;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      buf += ch;
      if (quote === "'" && ch === "'" && input[i + 1] === "'") {
        buf += input[++i];
        continue;
      }
      if (quote === '"' && ch === "\\") {
        buf += input[++i] ?? "";
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === "{" || ch === "[") {
      depth++;
      buf += ch;
      continue;
    }
    if (ch === "}" || ch === "]") {
      depth--;
      buf += ch;
      continue;
    }
    if (ch === sep && depth === 0) {
      out.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim() !== "" || out.length) out.push(buf);
  return out;
}
function splitKeyValue(text) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (quote === "'" && ch === "'" && text[i + 1] === "'") {
        i++;
        continue;
      }
      if (quote === '"' && ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === "{" || ch === "[") {
      depth++;
      continue;
    }
    if (ch === "}" || ch === "]") {
      depth--;
      continue;
    }
    if (ch === ":" && depth === 0) {
      return [text.slice(0, i).trim(), text.slice(i + 1).trim()];
    }
  }
  return null;
}
function unquote(text) {
  const t = text.trim();
  if (t.length >= 2 && t[0] === "'" && t[t.length - 1] === "'") {
    return t.slice(1, -1).replace(/''/g, "'");
  }
  if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"') {
    return t.slice(1, -1).replace(/\\(["\\/nrt])/g, (_, c) => c === "n" ? "\n" : c === "r" ? "\r" : c === "t" ? "	" : c);
  }
  return t;
}
function stripComment(text) {
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (quote === "'" && ch === "'" && text[i + 1] === "'") {
        i++;
        continue;
      }
      if (quote === '"' && ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === "#" && (i === 0 || /\s/.test(text[i - 1]))) return text.slice(0, i).trim();
  }
  return text.trim();
}
function isBalanced(text) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (quote === "'" && ch === "'" && text[i + 1] === "'") {
        i++;
        continue;
      }
      if (quote === '"' && ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") depth--;
  }
  return depth <= 0;
}
function parseFlow(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("[")) {
    const inner = trimmed.slice(1, trimmed.lastIndexOf("]"));
    if (!inner.trim()) return [];
    return splitTopLevel(inner, ",").map((part) => part.trim()).filter(Boolean).map((part) => parseScalar(part));
  }
  if (trimmed.startsWith("{")) {
    const inner = trimmed.slice(1, trimmed.lastIndexOf("}"));
    const out = {};
    if (!inner.trim()) return out;
    for (const part of splitTopLevel(inner, ",")) {
      if (!part.trim()) continue;
      const kv = splitKeyValue(part);
      if (!kv) continue;
      out[unquote(kv[0])] = parseScalar(kv[1]);
    }
    return out;
  }
  return parseScalar(trimmed);
}
function parseScalar(raw) {
  const text = raw.trim();
  if (!text) return null;
  if (text.startsWith("!!js")) return stripComment(text);
  if (text.startsWith("[") || text.startsWith("{")) return parseFlow(text);
  if (text.startsWith("'") || text.startsWith('"')) return unquote(text);
  const plain = stripComment(text);
  if (plain === "true") return true;
  if (plain === "false") return false;
  if (plain === "null" || plain === "~") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(plain)) return Number(plain);
  return plain;
}
function parseBlock(block) {
  const meaningful = block.filter((line) => line.trim() && !line.trim().startsWith("#"));
  if (!meaningful.length) return null;
  const first = meaningful[0].trim();
  if (first.startsWith("- ") || first === "-") {
    const out2 = [];
    for (const line of meaningful) {
      const m = line.trim().match(/^-\s*(.*)$/);
      if (!m) continue;
      out2.push(parseScalar(m[1]));
    }
    return out2;
  }
  if (first.startsWith("{") || first.startsWith("[")) {
    return parseFlow(meaningful.map((line) => line.trim()).join(" "));
  }
  const out = {};
  for (const line of meaningful) {
    const kv = splitKeyValue(line.trim());
    if (!kv) continue;
    out[unquote(kv[0])] = parseScalar(kv[1]);
  }
  return out;
}
function parseConfigChildren(lines, start, end, configIndent) {
  const out = {};
  let childIndent = -1;
  for (let i = start + 1; i < end; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const ind = indentOf(line);
    if (ind > configIndent) childIndent = ind;
    break;
  }
  if (childIndent < 0) return out;
  for (let i = start + 1; i < end; ) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) {
      i++;
      continue;
    }
    const ind = indentOf(line);
    if (ind !== childIndent) {
      i++;
      continue;
    }
    const kv = splitKeyValue(line.trim());
    if (!kv) {
      i++;
      continue;
    }
    const key = unquote(kv[0]);
    const rest = kv[1].trim();
    if (rest && !rest.startsWith("#")) {
      let text = rest;
      let j2 = i;
      if ((rest.startsWith("{") || rest.startsWith("[")) && !isBalanced(rest)) {
        while (++j2 < end) {
          text += " " + lines[j2].trim();
          if (isBalanced(text)) break;
        }
      }
      out[key] = parseScalar(text);
      i = j2 + 1;
      continue;
    }
    let j = i + 1;
    const block = [];
    while (j < end) {
      const t = lines[j];
      if (t.trim() && indentOf(t) <= childIndent) break;
      block.push(t);
      j++;
    }
    out[key] = parseBlock(block);
    i = j;
  }
  return out;
}
function stringMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, String(v ?? "")]));
}
function scanCordisEntries(text) {
  const lines = text.split(/\r?\n/);
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([\t ]*)config\s*:\s*(?:#.*)?$/);
    if (!m) continue;
    const configIndent = m[1].length;
    const dashIndent = configIndent - 2;
    if (dashIndent < 0) continue;
    let start = -1;
    for (let j = i - 1; j >= 0; j--) {
      if (!lines[j].trim()) continue;
      const ind = indentOf(lines[j]);
      if (ind > dashIndent) continue;
      if (ind < dashIndent) break;
      if (/^[\t ]*-\s+/.test(lines[j])) start = j;
      break;
    }
    if (start < 0) continue;
    let end = lines.length;
    for (let j = start + 1; j < lines.length; j++) {
      if (!lines[j].trim()) continue;
      if (indentOf(lines[j]) <= dashIndent) {
        end = j;
        break;
      }
    }
    if (end <= i) continue;
    let configEnd = end;
    for (let j = i + 1; j < end; j++) {
      if (!lines[j].trim()) continue;
      if (indentOf(lines[j]) <= configIndent) {
        configEnd = j;
        break;
      }
    }
    const config = parseConfigChildren(lines, i, configEnd, configIndent);
    const serverName = config.serverName;
    if (typeof serverName !== "string" || !serverName.trim()) continue;
    let id;
    let disabled = false;
    for (let j = start; j < end; j++) {
      let line = lines[j];
      let ind = indentOf(line);
      if (j === start) {
        line = line.replace(/^[\t ]*-\s+/, "");
        ind = configIndent;
      }
      if (ind !== configIndent) continue;
      const kv = splitKeyValue(line.trim());
      if (!kv) continue;
      const key = unquote(kv[0]);
      if (key === "id") id = String(parseScalar(kv[1]) ?? "");
      else if (key === "disabled") disabled = parseScalar(kv[1]) === true;
    }
    const spec = {};
    if (typeof config.command === "string") spec.command = config.command;
    if (Array.isArray(config.args)) spec.args = config.args.map((arg) => String(arg));
    const env = stringMap(config.env);
    if (env && Object.keys(env).length) spec.env = env;
    if (typeof config.url === "string") spec.url = config.url;
    const headers = stringMap(config.headers);
    if (headers && Object.keys(headers).length) spec.headers = headers;
    const extra = {};
    for (const [key, value] of Object.entries(config)) {
      if (["serverName", "transport", "command", "args", "env", "url", "headers"].includes(key)) continue;
      extra[key] = value;
    }
    if (Object.keys(extra).length) spec.extra = extra;
    if (disabled) spec.disabled = true;
    entries.push({
      start,
      end,
      dashIndent,
      keyIndent: configIndent,
      id,
      disabled,
      configStart: i,
      configEnd,
      configIndent,
      serverName: serverName.trim(),
      spec
    });
  }
  return entries;
}
function parseCordisServers(text) {
  const out = {};
  for (const entry of scanCordisEntries(text)) out[entry.serverName] = entry.spec;
  return out;
}
function hasCordisMcpServers(text) {
  return scanCordisEntries(text).length > 0;
}
function yamlString(value) {
  if (value.startsWith("!!js")) return value;
  return `'${value.replace(/'/g, "''")}'`;
}
function yamlInline(value) {
  if (value === null || value === void 0) return "null";
  if (typeof value === "string") return yamlString(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[ ${value.map(yamlInline).join(", ")} ]`;
  if (typeof value === "object") {
    const pairs = Object.entries(value).map(([k, v]) => `${k}: ${yamlInline(v)}`);
    return `{ ${pairs.join(", ")} }`;
  }
  return yamlString(String(value));
}
function safeKey(key) {
  return /^[A-Za-z0-9_.-]+$/.test(key) ? key : yamlString(key);
}
function serializeConfig(name, spec, indent) {
  const pad = " ".repeat(indent);
  const child = " ".repeat(indent + 2);
  const out = [
    `${pad}config:`,
    `${child}serverName: ${yamlString(name)}`,
    `${child}transport: ${spec.url ? "streamable-http" : "stdio"}`
  ];
  if (spec.command !== void 0) out.push(`${child}command: ${yamlString(spec.command)}`);
  if (spec.args && spec.args.length) {
    out.push(`${child}args:`);
    for (const arg of spec.args) out.push(`${child}  - ${yamlString(arg)}`);
  }
  if (spec.env && Object.keys(spec.env).length) {
    out.push(`${child}env:`);
    for (const [key, value] of Object.entries(spec.env)) out.push(`${child}  ${safeKey(key)}: ${yamlString(value)}`);
  }
  if (spec.url !== void 0) out.push(`${child}url: ${yamlString(spec.url)}`);
  if (spec.headers && Object.keys(spec.headers).length) {
    out.push(`${child}headers:`);
    for (const [key, value] of Object.entries(spec.headers)) out.push(`${child}  ${safeKey(key)}: ${yamlString(value)}`);
  }
  for (const [key, value] of Object.entries(spec.extra ?? {})) {
    if (value === void 0) continue;
    out.push(`${child}${safeKey(key)}: ${yamlInline(value)}`);
  }
  return out;
}
function findDisabledLine(lines, entry) {
  for (let j = entry.start; j < entry.end; j++) {
    let line = lines[j];
    let ind = indentOf(line);
    if (j === entry.start) {
      line = line.replace(/^[\t ]*-\s+/, "");
      ind = entry.keyIndent;
    }
    if (ind !== entry.keyIndent) continue;
    const kv = splitKeyValue(line.trim());
    if (kv && unquote(kv[0]) === "disabled") return j;
  }
  return -1;
}
function pruneEmptyInsert(lines) {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([\t ]*)-\s+insert\s*:\s*(?:#.*)?$/);
    if (!m) continue;
    const childIndent = m[1].length + 2;
    let hasChild = false;
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j].trim() || lines[j].trim().startsWith("#")) continue;
      hasChild = indentOf(lines[j]) > childIndent;
      break;
    }
    if (hasChild) continue;
    lines.splice(i, 1);
    if (i > 0 && i < lines.length && !lines[i - 1].trim() && !lines[i].trim()) lines.splice(i, 1);
    i--;
  }
  return lines;
}
function removeEntry(lines, entry) {
  const before = lines.slice(0, entry.start);
  const after = lines.slice(entry.end);
  while (before.length && before[before.length - 1].trim() === "") before.pop();
  while (after.length && after[0].trim() === "") after.shift();
  const out = [...before];
  if (before.length && after.length) out.push("");
  out.push(...after);
  return pruneEmptyInsert(out);
}
function insertEntry(text, name, spec) {
  const existing = /* @__PURE__ */ new Set();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^[\t ]*-\s+id\s*:\s*(.+)$/);
    if (m) existing.add(String(parseScalar(m[1]) ?? ""));
  }
  const base = `mcp-${name.replace(/[^A-Za-z0-9_-]/g, "-")}`;
  let id = base;
  for (let n = 2; existing.has(id); n++) id = `${base}-${n}`;
  const block = [
    "- insert:",
    `    - id: ${id}`,
    `      name: '${DSH_MCP_PLUGIN}'`,
    ...serializeConfig(name, spec, 6)
  ];
  const trimmed = text.replace(/\s*$/, "");
  return `${trimmed ? trimmed + "\n\n" : ""}${block.join("\n")}
`;
}
function writeCordisServer(text, name, spec) {
  let lines = text.split(/\r?\n/);
  let entries = scanCordisEntries(lines.join("\n"));
  const target = entries.find((entry) => entry.serverName === name);
  if (!target) {
    if (!spec) return text;
    return insertEntry(text, name, spec);
  }
  if (!spec) return removeEntry(lines, target).join("\n");
  const disabledLine = findDisabledLine(lines, target);
  const disabledText = `${" ".repeat(target.keyIndent)}disabled: true`;
  if (spec.disabled) {
    if (disabledLine >= 0) lines[disabledLine] = disabledText;
    else lines.splice(target.start + 1, 0, disabledText);
  } else if (disabledLine >= 0) {
    lines.splice(disabledLine, 1);
  }
  entries = scanCordisEntries(lines.join("\n"));
  const current = entries.find((entry) => entry.serverName === name);
  if (!current) return lines.join("\n");
  const block = serializeConfig(name, spec, current.configIndent);
  lines.splice(current.configStart, current.configEnd - current.configStart, ...block);
  return lines.join("\n");
}
export {
  hasCordisMcpServers,
  parseCordisServers,
  scanCordisEntries,
  writeCordisServer
};
