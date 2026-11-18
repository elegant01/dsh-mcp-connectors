// DSH profile 的 cordis.patch.yml 读写器。
// DSH 的 MCP 服务器不是独立 mcp.json，而是 patch 层里的
// `@deepseek-ai/dsh-mcp-client` 插件条目：
//
//   - id: mcp-dify-canvas
//     name: '@deepseek-ai/dsh-mcp-client'
//     config:
//       serverName: dify-canvas
//       transport: stdio
//       command: node
//       args: [ 'F:/x/index.mjs' ]
//
// 或包在一层 insert 列表里。这里只解析带 config.serverName 的条目，
// 其余 YAML（注释、其它插件配置）逐字节保留；写入只替换目标条目的 config 块。

import type { McpServerSpec } from "./types.js";

const DSH_MCP_PLUGIN = "@deepseek-ai/dsh-mcp-client";

/** 一个 cordis patch 条目（配置 MCP 的那一条）在文件中的位置与解析结果。 */
export interface CordisEntry {
  /** 条目起始行（顶层/嵌套的 `- ` 行） */
  start: number;
  /** 条目结束行（不含）：下一个缩进不大于条目缩进的非空行 */
  end: number;
  /** `- ` 的缩进 */
  dashIndent: number;
  /** 条目键的缩进（通常是 dashIndent + 2） */
  keyIndent: number;
  id?: string;
  disabled?: boolean;
  /** config: 行号与缩进 */
  configStart: number;
  configEnd: number;
  configIndent: number;
  serverName: string;
  spec: McpServerSpec;
}

function indentOf(line: string): number {
  const m = line.match(/^[\t ]*/);
  return m ? m[0].length : 0;
}

/** 按顶层分隔符切分（忽略引号与嵌套括号内部的分隔符）。 */
function splitTopLevel(input: string, sep: string): string[] {
  const out: string[] = [];
  let buf = "";
  let depth = 0;
  let quote: string | null = null;
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

/** 在第一个顶层冒号处切成 [key, value]（引号/括号内部的冒号不算）。 */
function splitKeyValue(text: string): [string, string] | null {
  let depth = 0;
  let quote: string | null = null;
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

function unquote(text: string): string {
  const t = text.trim();
  if (t.length >= 2 && t[0] === "'" && t[t.length - 1] === "'") {
    return t.slice(1, -1).replace(/''/g, "'");
  }
  if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"') {
    return t
      .slice(1, -1)
      .replace(/\\(["\\/nrt])/g, (_, c: string) => (c === "n" ? "\n" : c === "r" ? "\r" : c === "t" ? "\t" : c));
  }
  return t;
}

/** 去掉未加引号部分的行尾注释（` # ...`）。 */
function stripComment(text: string): string {
  let quote: string | null = null;
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

function isBalanced(text: string): boolean {
  let depth = 0;
  let quote: string | null = null;
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

function parseFlow(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("[")) {
    const inner = trimmed.slice(1, trimmed.lastIndexOf("]"));
    if (!inner.trim()) return [];
    return splitTopLevel(inner, ",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => parseScalar(part));
  }
  if (trimmed.startsWith("{")) {
    const inner = trimmed.slice(1, trimmed.lastIndexOf("}"));
    const out: Record<string, unknown> = {};
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

function parseScalar(raw: string): unknown {
  const text = raw.trim();
  if (!text) return null;
  // DSH 的 !!js 表达式原样保留，写入时也按原样输出
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

/** 解析一个块值（块列表 / 块映射 / 多行 flow）。 */
function parseBlock(block: string[]): unknown {
  const meaningful = block.filter((line) => line.trim() && !line.trim().startsWith("#"));
  if (!meaningful.length) return null;
  const first = meaningful[0].trim();
  if (first.startsWith("- ") || first === "-") {
    const out: unknown[] = [];
    for (const line of meaningful) {
      const m = line.trim().match(/^-\s*(.*)$/);
      if (!m) continue;
      out.push(parseScalar(m[1]));
    }
    return out;
  }
  if (first.startsWith("{") || first.startsWith("[")) {
    return parseFlow(meaningful.map((line) => line.trim()).join(" "));
  }
  const out: Record<string, unknown> = {};
  for (const line of meaningful) {
    const kv = splitKeyValue(line.trim());
    if (!kv) continue;
    out[unquote(kv[0])] = parseScalar(kv[1]);
  }
  return out;
}

/** 解析 config: 块下的直接子键。 */
function parseConfigChildren(lines: string[], start: number, end: number, configIndent: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
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
      let j = i;
      if ((rest.startsWith("{") || rest.startsWith("[")) && !isBalanced(rest)) {
        while (++j < end) {
          text += " " + lines[j].trim();
          if (isBalanced(text)) break;
        }
      }
      out[key] = parseScalar(text);
      i = j + 1;
      continue;
    }
    // 块值：收集所有缩进大于 childIndent 的行
    let j = i + 1;
    const block: string[] = [];
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

function stringMap(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")]));
}

/** 扫描文件里所有 config.serverName 条目（MCP 客户端插件条目）。 */
export function scanCordisEntries(text: string): CordisEntry[] {
  const lines = text.split(/\r?\n/);
  const entries: CordisEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([\t ]*)config\s*:\s*(?:#.*)?$/);
    if (!m) continue;
    const configIndent = m[1].length;
    const dashIndent = configIndent - 2;
    if (dashIndent < 0) continue;
    // 向上找条目起始的 `- ` 行（要求缩进正好比 config 少 2）
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

    // 条目范围：下一个缩进不超出 `- ` 的非空行
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

    // 条目级键：id / disabled
    let id: string | undefined;
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

    const spec: McpServerSpec = {};
    if (typeof config.command === "string") spec.command = config.command;
    if (Array.isArray(config.args)) spec.args = config.args.map((arg) => String(arg));
    const env = stringMap(config.env);
    if (env && Object.keys(env).length) spec.env = env;
    if (typeof config.url === "string") spec.url = config.url;
    const headers = stringMap(config.headers);
    if (headers && Object.keys(headers).length) spec.headers = headers;
    const extra: Record<string, unknown> = {};
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
      spec,
    });
  }
  return entries;
}

/** 读出 cordis.patch.yml 里的全部 MCP 服务器（key = config.serverName）。 */
export function parseCordisServers(text: string): Record<string, McpServerSpec> {
  const out: Record<string, McpServerSpec> = {};
  for (const entry of scanCordisEntries(text)) out[entry.serverName] = entry.spec;
  return out;
}

/** 文件是否至少声明了一台 MCP 服务器（用于动态来源筛选）。 */
export function hasCordisMcpServers(text: string): boolean {
  return scanCordisEntries(text).length > 0;
}

// ---------- 序列化 ----------

function yamlString(value: string): string {
  if (value.startsWith("!!js")) return value;
  return `'${value.replace(/'/g, "''")}'`;
}

function yamlInline(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return yamlString(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[ ${value.map(yamlInline).join(", ")} ]`;
  if (typeof value === "object") {
    const pairs = Object.entries(value as Record<string, unknown>).map(([k, v]) => `${k}: ${yamlInline(v)}`);
    return `{ ${pairs.join(", ")} }`;
  }
  return yamlString(String(value));
}

function safeKey(key: string): string {
  return /^[A-Za-z0-9_.-]+$/.test(key) ? key : yamlString(key);
}

/** 生成一台服务器的 config: 块（indent = `config:` 的缩进）。 */
function serializeConfig(name: string, spec: McpServerSpec, indent: number): string[] {
  const pad = " ".repeat(indent);
  const child = " ".repeat(indent + 2);
  const out = [
    `${pad}config:`,
    `${child}serverName: ${yamlString(name)}`,
    `${child}transport: ${spec.url ? "streamable-http" : "stdio"}`,
  ];
  if (spec.command !== undefined) out.push(`${child}command: ${yamlString(spec.command)}`);
  if (spec.args && spec.args.length) {
    out.push(`${child}args:`);
    for (const arg of spec.args) out.push(`${child}  - ${yamlString(arg)}`);
  }
  if (spec.env && Object.keys(spec.env).length) {
    out.push(`${child}env:`);
    for (const [key, value] of Object.entries(spec.env)) out.push(`${child}  ${safeKey(key)}: ${yamlString(value)}`);
  }
  if (spec.url !== undefined) out.push(`${child}url: ${yamlString(spec.url)}`);
  if (spec.headers && Object.keys(spec.headers).length) {
    out.push(`${child}headers:`);
    for (const [key, value] of Object.entries(spec.headers)) out.push(`${child}  ${safeKey(key)}: ${yamlString(value)}`);
  }
  for (const [key, value] of Object.entries(spec.extra ?? {})) {
    if (value === undefined) continue;
    out.push(`${child}${safeKey(key)}: ${yamlInline(value)}`);
  }
  return out;
}

// ---------- 写入 ----------

/** 找条目里 `disabled:` 的行号。 */
function findDisabledLine(lines: string[], entry: CordisEntry): number {
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

/** 删掉子项为空（或只剩注释）的 `- insert:` 块，避免留下 `insert: null` 的补丁。 */
function pruneEmptyInsert(lines: string[]): string[] {
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

function removeEntry(lines: string[], entry: CordisEntry): string[] {
  const before = lines.slice(0, entry.start);
  const after = lines.slice(entry.end);
  while (before.length && before[before.length - 1].trim() === "") before.pop();
  while (after.length && after[0].trim() === "") after.shift();
  const out = [...before];
  if (before.length && after.length) out.push("");
  out.push(...after);
  return pruneEmptyInsert(out);
}

function insertEntry(text: string, name: string, spec: McpServerSpec): string {
  const existing = new Set<string>();
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
    ...serializeConfig(name, spec, 6),
  ];
  const trimmed = text.replace(/\s*$/, "");
  return `${trimmed ? trimmed + "\n\n" : ""}${block.join("\n")}\n`;
}

/**
 * 写入/更新/删除一台 DSH MCP 服务器（key = serverName）。
 * spec 为 null 时删除整个条目；spec.disabled 为 true 时写条目级 `disabled: true`。
 */
export function writeCordisServer(text: string, name: string, spec: McpServerSpec | null): string {
  let lines = text.split(/\r?\n/);
  let entries = scanCordisEntries(lines.join("\n"));
  const target = entries.find((entry) => entry.serverName === name);

  if (!target) {
    if (!spec) return text;
    return insertEntry(text, name, spec);
  }
  if (!spec) return removeEntry(lines, target).join("\n");

  // 先处理条目级 disabled（会改变行号，随后重新扫描定位 config）
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
