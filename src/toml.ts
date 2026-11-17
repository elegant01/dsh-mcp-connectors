// Codex config.toml 的最小 TOML 节区读写器。
// 只理解 [mcp_servers.<name>]（含其子节区如 .env），其余内容（注释、其它配置）逐字节保留。
// 重写策略：定位某服务器占用的行区间，整段替换/删除；新增插在最后一个 mcp_servers 节区之后。

import type { McpServerSpec } from "./types.js";

const SERVER_HEADER = /^\s*\[\s*mcp_servers\.([^\]]+?)\s*\]\s*$/;
const ANY_HEADER = /^\s*\[[^\]]+\]\s*$/;

interface SectionRange {
  /** 服务器名（未解码引号时的原始写法已还原） */
  name: string;
  /** 该服务器占用的行区间 [start, end) */
  start: number;
  end: number;
  lines: string[];
}

function unquoteName(raw: string): string {
  const first = raw.trim();
  if (first.startsWith('"') && first.endsWith('"') && first.length >= 2) {
    return first.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return first;
}

export function quoteName(name: string): string {
  return /^[A-Za-z0-9_-]+$/.test(name) ? name : `"${name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function escapeTomlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** 把所有属于 mcp_servers.* 的节区按服务器分组，返回每台服务器占用的行区间。 */
function collectServerRanges(lines: string[]): SectionRange[] {
  const ranges: SectionRange[] = [];
  let current: SectionRange | null = null;

  const headerServerName = (line: string): string | null | undefined => {
    const m = line.match(SERVER_HEADER);
    if (m) {
      // [mcp_servers.<name>] 或 [mcp_servers.<name>.<sub>] —— 取第一段
      const inner = m[1];
      const parts: string[] = [];
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
    if (ANY_HEADER.test(line)) return null; // 其它节区
    return undefined; // 非节区头
  };

  for (let i = 0; i < lines.length; i++) {
    const serverOf = headerServerName(lines[i]);
    if (serverOf === undefined) continue; // 普通行，归属当前区间
    if (serverOf !== null && current && serverOf === current.name) {
      continue; // 同一服务器的子节区（如 .env），并入当前区间
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

/** 解析一行 key = value（仅支持字符串、字符串数组、布尔、数字、内联表）。 */
function parseValue(raw: string): unknown {
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
    const items: string[] = [];
    const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(inner))) {
      items.push((m[1] ?? m[2] ?? "").replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
    }
    return items;
  }
  if (text.startsWith("{") && text.endsWith("}")) {
    const table: Record<string, string> = {};
    const inner = text.slice(1, -1);
    const re = /([A-Za-z0-9_.-]+)\s*=\s*"((?:[^"\\]|\\.)*)"|([A-Za-z0-9_.-]+)\s*=\s*'([^']*)'/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(inner))) {
      if (m[1] !== undefined) table[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      else if (m[3] !== undefined) table[m[3]] = m[4];
    }
    return table;
  }
  if (text === "true") return true;
  if (text === "false") return false;
  const num = Number(text);
  if (!Number.isNaN(num) && text !== "") return num;
  return text;
}

/** 从一台服务器的节区行中解析出 McpServerSpec。 */
function parseServerLines(lines: string[]): McpServerSpec {
  const spec: McpServerSpec = {};
  const extra: Record<string, unknown> = {};
  let inSubTable: string | null = null;
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
    if (inSubTable) continue; // 其它子节区不识别，丢弃解析（重写时整段替换，原文仍保留）
    switch (key) {
      case "command":
        if (typeof value === "string") spec.command = value;
        break;
      case "args":
        if (Array.isArray(value)) spec.args = value.map(String);
        break;
      case "env":
        if (value && typeof value === "object" && !Array.isArray(value)) {
          spec.env = Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
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

/** 读出 config.toml 里的全部 MCP 服务器。 */
export function parseCodexServers(text: string): Record<string, McpServerSpec> {
  const lines = text.split(/\r?\n/);
  const ranges = collectServerRanges(lines);
  const result: Record<string, McpServerSpec> = {};
  for (const range of ranges) {
    result[range.name] = parseServerLines(range.lines.slice(range.start, range.end));
  }
  return result;
}

/** 序列化一台服务器为 TOML 节区文本（不含尾部空行）。 */
export function serializeServerToml(name: string, spec: McpServerSpec): string {
  const lines: string[] = [`[mcp_servers.${quoteName(name)}]`];
  if (spec.command !== undefined) lines.push(`command = ${escapeTomlString(spec.command)}`);
  if (spec.args !== undefined) lines.push(`args = [${spec.args.map(escapeTomlString).join(", ")}]`);
  if (spec.url !== undefined) lines.push(`url = ${escapeTomlString(spec.url)}`);
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
        const pairs = Object.entries(value as Record<string, unknown>).map(([k, v]) => `${k} = ${escapeTomlString(String(v))}`);
        lines.push(`${key} = { ${pairs.join(", ")} }`);
      }
    }
  }
  return lines.join("\n");
}

/**
 * 用 newSection 替换名为 name 的服务器节区；newSection 为 null 时删除。
 * 服务器不存在且 newSection 非空时，插在最后一个 mcp_servers 节区之后（否则追加到文件末尾）。
 */
export function writeCodexServer(text: string, name: string, newSection: string | null): string {
  const lines = text.split(/\r?\n/);
  const ranges = collectServerRanges(lines);
  const target = ranges.find((r) => r.name === name);

  if (target) {
    const before = lines.slice(0, target.start);
    const after = lines.slice(target.end);
    // 吃掉段后多余空行（最多一段）
    while (after.length && after[0].trim() === "" && newSection === null) after.shift();
    const middle = newSection === null ? [] : newSection.split("\n");
    return [...before, ...middle, ...after].join("\n");
  }

  if (newSection === null) return text;

  // 追加：找最后一个 mcp_servers 节区的末尾
  const last = ranges[ranges.length - 1];
  const sectionLines = newSection.split("\n");
  if (last) {
    const before = lines.slice(0, last.end);
    const after = lines.slice(last.end);
    // 保证与上文之间有一个空行
    if (before.length && before[before.length - 1].trim() !== "") before.push("");
    return [...before, ...sectionLines, ...after].join("\n");
  }
  const out = text.endsWith("\n") || text === "" ? text : text + "\n";
  return out + (out.trim() ? "\n" : "") + sectionLines.join("\n") + "\n";
}
