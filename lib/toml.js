const SERVER_HEADER = /^\s*\[\s*mcp_servers\.([^\]]+?)\s*\]\s*$/;
const ANY_HEADER = /^\s*\[[^\]]+\]\s*$/;
function unquoteName(raw) {
  const first = raw.trim();
  if (first.startsWith('"') && first.endsWith('"') && first.length >= 2) {
    return first.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return first;
}
function quoteName(name) {
  return /^[A-Za-z0-9_-]+$/.test(name) ? name : `"${name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function escapeTomlString(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function collectServerRanges(lines) {
  const ranges = [];
  let current = null;
  const headerServerName = (line) => {
    const m = line.match(SERVER_HEADER);
    if (m) {
      const inner = m[1];
      const parts = [];
      let buf = "";
      let inQuote = false;
      for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        if (ch === '"') inQuote = !inQuote;
        if (ch === "." && !inQuote) {
          parts.push(buf);
          buf = "";
        } else {
          buf += ch;
        }
      }
      parts.push(buf);
      return unquoteName(parts[0]);
    }
    if (ANY_HEADER.test(line)) return null;
    return void 0;
  };
  for (let i = 0; i < lines.length; i++) {
    const serverOf = headerServerName(lines[i]);
    if (serverOf === void 0) continue;
    if (serverOf !== null && current && serverOf === current.name) {
      continue;
    }
    if (current) {
      current.end = i;
      ranges.push(current);
      current = null;
    }
    if (serverOf !== null) {
      current = { name: serverOf, start: i, end: lines.length, lines };
    }
  }
  if (current) {
    current.end = lines.length;
    ranges.push(current);
  }
  return ranges;
}
function parseValue(raw) {
  const text = raw.trim();
  if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) {
    return text.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  if (text.startsWith("'") && text.endsWith("'") && text.length >= 2) {
    return text.slice(1, -1);
  }
  if (text.startsWith("[") && text.endsWith("]")) {
    const inner = text.slice(1, -1).trim();
    if (!inner) return [];
    const items = [];
    const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'/g;
    let m;
    while (m = re.exec(inner)) {
      items.push((m[1] ?? m[2] ?? "").replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
    }
    return items;
  }
  if (text.startsWith("{") && text.endsWith("}")) {
    const table = {};
    const inner = text.slice(1, -1);
    const re = /([A-Za-z0-9_.-]+)\s*=\s*"((?:[^"\\]|\\.)*)"|([A-Za-z0-9_.-]+)\s*=\s*'([^']*)'/g;
    let m;
    while (m = re.exec(inner)) {
      if (m[1] !== void 0) table[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      else if (m[3] !== void 0) table[m[3]] = m[4];
    }
    return table;
  }
  if (text === "true") return true;
  if (text === "false") return false;
  const num = Number(text);
  if (!Number.isNaN(num) && text !== "") return num;
  return text;
}
function parseServerLines(lines) {
  const spec = {};
  const extra = {};
  let inSubTable = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const header = trimmed.match(/^\s*\[\s*mcp_servers\.([^\]]+?)\s*\]\s*$/);
    if (header) {
      const inner = header[1];
      const dot = inner.indexOf(".");
      inSubTable = dot >= 0 ? inner.slice(dot + 1).replace(/"/g, "") : null;
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = parseValue(trimmed.slice(eq + 1));
    if (inSubTable === "env") {
      if (!spec.env) spec.env = {};
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        spec.env[key] = String(value);
      }
      continue;
    }
    if (inSubTable) continue;
    switch (key) {
      case "command":
        if (typeof value === "string") spec.command = value;
        break;
      case "args":
        if (Array.isArray(value)) spec.args = value.map(String);
        break;
      case "env":
        if (value && typeof value === "object" && !Array.isArray(value)) {
          spec.env = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, String(v)]));
        }
        break;
      case "url":
        if (typeof value === "string") spec.url = value;
        break;
      default:
        extra[key] = value;
    }
  }
  if (Object.keys(extra).length) spec.extra = extra;
  return spec;
}
function parseCodexServers(text) {
  const lines = text.split(/\r?\n/);
  const ranges = collectServerRanges(lines);
  const result = {};
  for (const range of ranges) {
    result[range.name] = parseServerLines(range.lines.slice(range.start, range.end));
  }
  return result;
}
function serializeServerToml(name, spec) {
  const lines = [`[mcp_servers.${quoteName(name)}]`];
  if (spec.command !== void 0) lines.push(`command = ${escapeTomlString(spec.command)}`);
  if (spec.args !== void 0) lines.push(`args = [${spec.args.map(escapeTomlString).join(", ")}]`);
  if (spec.url !== void 0) lines.push(`url = ${escapeTomlString(spec.url)}`);
  if (spec.env && Object.keys(spec.env).length) {
    const pairs = Object.entries(spec.env).map(([k, v]) => `${k} = ${escapeTomlString(v)}`);
    lines.push(`env = { ${pairs.join(", ")} }`);
  }
  if (spec.headers && Object.keys(spec.headers).length) {
    const pairs = Object.entries(spec.headers).map(([k, v]) => `${k} = ${escapeTomlString(v)}`);
    lines.push(`headers = { ${pairs.join(", ")} }`);
  }
  if (spec.extra) {
    for (const [key, value] of Object.entries(spec.extra)) {
      if (typeof value === "string") lines.push(`${key} = ${escapeTomlString(value)}`);
      else if (typeof value === "boolean" || typeof value === "number") lines.push(`${key} = ${String(value)}`);
      else if (Array.isArray(value)) lines.push(`${key} = [${value.map((v) => escapeTomlString(String(v))).join(", ")}]`);
      else if (value && typeof value === "object") {
        const pairs = Object.entries(value).map(([k, v]) => `${k} = ${escapeTomlString(String(v))}`);
        lines.push(`${key} = { ${pairs.join(", ")} }`);
      }
    }
  }
  return lines.join("\n");
}
function writeCodexServer(text, name, newSection) {
  const lines = text.split(/\r?\n/);
  const ranges = collectServerRanges(lines);
  const target = ranges.find((r) => r.name === name);
  if (target) {
    const before = lines.slice(0, target.start);
    const after = lines.slice(target.end);
    while (after.length && after[0].trim() === "" && newSection === null) after.shift();
    const middle = newSection === null ? [] : newSection.split("\n");
    return [...before, ...middle, ...after].join("\n");
  }
  if (newSection === null) return text;
  const last = ranges[ranges.length - 1];
  const sectionLines = newSection.split("\n");
  if (last) {
    const before = lines.slice(0, last.end);
    const after = lines.slice(last.end);
    if (before.length && before[before.length - 1].trim() !== "") before.push("");
    return [...before, ...sectionLines, ...after].join("\n");
  }
  const out = text.endsWith("\n") || text === "" ? text : text + "\n";
  return out + (out.trim() ? "\n" : "") + sectionLines.join("\n") + "\n";
}
export {
  parseCodexServers,
  quoteName,
  serializeServerToml,
  writeCodexServer
};
