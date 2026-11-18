// 核心层：扫描各 Agent 的 MCP 配置、读写（带备份）、启停、备份回退。
// 启停语义：MCP 各家格式没有统一的 disabled 字段 —— 停用 = 条目从配置文件移出、
// 原定义存进管理器 state.disabled；启用 = 写回配置文件。任何写入前先备份原文件。

import { readFile, writeFile, rename, access, mkdir, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type {
  BackupEntry,
  CodedError,
  Diagnostic,
  Log,
  McpServerSpec,
  OperationError,
  ServerInput,
  ServerView,
  Snapshot,
  SourceDef,
  SourceView,
  TransportKind,
} from "./types.js";
import { BUILTIN_SOURCES, customSourceDef } from "./sources.js";
import { discoverSources, type DiscoveredSource } from "./discover.js";
import { parseCodexServers, serializeServerToml, writeCodexServer } from "./toml.js";
import { hasCordisMcpServers, parseCordisServers, writeCordisServer } from "./cordis.js";
import { listBackups, loadState, makeBackup, managerDir, removeBackupEntry, updateState } from "./state.js";

export { managerDir };

function fail(statusCode: number, code: string, message: string): never {
  const error: CodedError = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  throw error;
}

export function expandPath(input: string): string {
  let out = input.trim();
  if (out.startsWith("~/") || out === "~") out = join(homedir(), out.slice(1));
  return out.replace(/%([^%]+)%/g, (_, name) => process.env[name] ?? `%${name}%`)
    .replace(/\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, braced, plain) => process.env[braced ?? plain] ?? "");
}

/** 自动发现结果缓存：候选路径探测本身已是毫秒级，30s TTL 只为避免重复 syscall。 */
let discoveredCache: { at: number; items: DiscoveredSource[] } | null = null;
const DISCOVER_TTL_MS = 30_000;

async function discoveredSources(coveredPaths: Set<string>): Promise<DiscoveredSource[]> {
  if (discoveredCache && Date.now() - discoveredCache.at < DISCOVER_TTL_MS) {
    return discoveredCache.items.filter((item) => !coveredPaths.has(item.path.toLowerCase()));
  }
  let items: DiscoveredSource[] = [];
  try {
    items = await discoverSources(coveredPaths);
  } catch { /* 扫盘失败不拖垮面板 */ }
  discoveredCache = { at: Date.now(), items };
  return items;
}

/**
 * DSH 的 MCP 配置实际在 profile 的 cordis.patch.yml 里（@deepseek-ai/dsh-mcp-client 条目），
 * 不是 ~/.dsh/mcp.json。这里扫描 ~/.dsh/profiles/<name>/cordis.patch.yml，只列出真正声明了
 * MCP 服务器的 profile（按 profile 拆成独立来源，归组到 DSH）。
 */
async function cordisProfileSources(): Promise<Array<{ def: SourceDef; path: string; overridden: boolean }>> {
  const profilesDir = join(homedir(), ".dsh", "profiles");
  let entries;
  try {
    entries = await readdir(profilesDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: Array<{ def: SourceDef; path: string; overridden: boolean }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = join(profilesDir, entry.name, "cordis.patch.yml");
    const text = await readSourceText(file);
    if (text === null || !hasCordisMcpServers(text)) continue;
    out.push({
      def: {
        key: `dsh-profile-${entry.name}`,
        label: `DSH（${entry.name}）`,
        format: "cordis-yaml",
        paths: [file],
        writable: true,
        group: "dsh",
        groupLabel: "DSH",
      },
      path: file,
      overridden: false,
    });
  }
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

/** 汇总来源表：内置 + state 覆盖 + 自定义来源 + 自动发现。每次请求重读，不缓存。 */
async function resolveSources(): Promise<Array<{ def: SourceDef; path: string | null; overridden: boolean }>> {
  const state = await loadState();
  const out: Array<{ def: SourceDef; path: string | null; overridden: boolean }> = [];
  for (const def of BUILTIN_SOURCES) {
    const override = state.rootOverrides[def.key];
    if (override) {
      out.push({ def, path: expandPath(override), overridden: true });
      continue;
    }
    let found: string | null = null;
    for (const candidate of def.paths) {
      try {
        await access(expandPath(candidate));
        found = expandPath(candidate);
        break;
      } catch { /* 尝试下一个候选 */ }
    }
    // 都不存在时，用第一个候选作为"待创建"的写入目标
    out.push({ def, path: found ?? expandPath(def.paths[0]), overridden: false });
  }
  for (const profile of await cordisProfileSources()) {
    const override = state.rootOverrides[profile.def.key];
    if (override) out.push({ ...profile, path: expandPath(override), overridden: true });
    else out.push(profile);
  }
  for (const custom of state.customSources) {
    out.push({
      def: customSourceDef(custom.key, custom.label, custom.path),
      path: expandPath(custom.path),
      overridden: false,
    });
  }
  // 自动发现：内置/自定义已覆盖的路径不重复入列
  const covered = new Set(
    out.filter((s) => s.path).map((s) => s.path!.replace(/\//g, "\\").toLowerCase()),
  );
  for (const item of await discoveredSources(covered)) {
    out.push({
      def: { key: item.key, label: item.label, format: item.format, paths: [item.path], writable: true, discovered: true },
      path: item.path,
      overridden: false,
    });
  }
  return out;
}

async function findSource(key: string) {
  const sources = await resolveSources();
  const hit = sources.find((s) => s.def.key === key);
  if (!hit) fail(404, "error.source.unknown", `未知配置来源: ${key}`);
  return hit;
}

// ---------- 读取 ----------

function normalizeSpec(raw: unknown): McpServerSpec {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const spec: McpServerSpec = {};
  if (typeof obj.command === "string") spec.command = obj.command;
  if (Array.isArray(obj.args)) spec.args = obj.args.map(String);
  if (obj.env && typeof obj.env === "object" && !Array.isArray(obj.env)) {
    spec.env = Object.fromEntries(Object.entries(obj.env as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
  }
  if (typeof obj.url === "string") spec.url = obj.url;
  if (typeof obj.serverUrl === "string" && !spec.url) spec.url = obj.serverUrl;
  if (obj.headers && typeof obj.headers === "object" && !Array.isArray(obj.headers)) {
    spec.headers = Object.fromEntries(Object.entries(obj.headers as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
  }
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!["command", "args", "env", "url", "serverUrl", "headers", "disabled", "enabled"].includes(k)) extra[k] = v;
  }
  if (Object.keys(extra).length) spec.extra = extra;
  return spec;
}

function transportOf(spec: McpServerSpec): TransportKind {
  if (spec.url) return /sse/i.test(spec.url) ? "sse" : "http";
  const t = spec.extra?.type ?? spec.extra?.transport;
  if (t === "sse" || t === "http" || t === "stdio") return t;
  return "stdio";
}

function summarize(spec: McpServerSpec): string {
  if (spec.url) return spec.url;
  const cmd = [spec.command, ...(spec.args ?? [])].filter(Boolean).join(" ");
  return cmd || "（空定义）";
}

/** 去掉 JSONC 的注释与尾逗号（VS Code 系 mcp.json 是 JSONC），不动字符串内部。 */
function stripJsonComments(text: string): string {
  let out = "";
  let inString = false;
  let quote = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += next ?? "";
        i++;
      } else if (ch === quote) {
        inString = false;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
      continue;
    }
    out += ch;
  }
  // 尾逗号：, 后跟 } 或 ]
  return out.replace(/,(\s*[}\]])/g, "$1");
}

function parseJsonLenient(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(stripJsonComments(text));
  }
}

/** 按格式从文件内容提取服务器表。空文件视为无服务器（有些 agent 会落 0 字节占位文件）。 */
function extractServers(def: SourceDef, text: string): Record<string, McpServerSpec> {
  if (!text.trim()) return {};
  if (def.format === "cordis-yaml") return parseCordisServers(text);
  if (def.format === "toml-codex") return parseCodexServers(text);
  const parsed = parseJsonLenient(text) as Record<string, unknown>;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail(422, "error.config.shape", "配置文件顶层必须是 JSON 对象");
  }
  const table = def.format === "json-mcp" ? parsed.mcp : parsed.mcpServers;
  if (table === undefined || table === null) return {};
  if (typeof table !== "object" || Array.isArray(table)) {
    fail(422, "error.config.shape", "服务器表必须是对象");
  }
  const out: Record<string, McpServerSpec> = {};
  for (const [name, raw] of Object.entries(table as Record<string, unknown>)) {
    out[name] = normalizeSpec(raw);
  }
  return out;
}

async function readSourceText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

async function buildSourceView(entry: { def: SourceDef; path: string | null; overridden: boolean }, warnings: Diagnostic[]): Promise<SourceView> {
  const { def, path, overridden } = entry;
  const state = await loadState();
  const view: SourceView = {
    key: def.key,
    label: def.label,
    path,
    exists: false,
    writable: def.writable,
    format: def.format,
    overridden,
    discovered: def.discovered === true,
    group: def.group,
    groupLabel: def.groupLabel,
    servers: [],
  };
  if (!path) return view;
  const text = await readSourceText(path);
  if (text === null) return view;
  view.exists = true;
  let servers: Record<string, McpServerSpec>;
  try {
    servers = extractServers(def, text);
  } catch (caught) {
    const e = caught as CodedError;
    view.error = e.message;
    warnings.push({ code: e.code ?? "error.config.parse", error: `${def.label}: ${e.message}` });
    return view;
  }
  // spec 对外给出「配置文件里的原始形状」（未识别字段平铺在顶层），
  // 内部归一化的 extra 只在读写时使用，不能泄漏到 JSON 视图/编辑表单里。
  view.servers = Object.entries(servers).map(([name, spec]) => ({
    name,
    transport: transportOf(spec),
    summary: summarize(spec),
    spec: denormalizeSpec(spec) as McpServerSpec,
    // cordis 条目有原生 disabled 字段；其它格式没有
    enabled: spec.disabled !== true,
  }));
  // 追加管理器里被停用的条目（cordis 用原生 disabled，不经过 state）
  if (def.format !== "cordis-yaml") for (const [compound, spec] of Object.entries(state.disabled)) {
    const slash = compound.indexOf("/");
    if (compound.slice(0, slash) !== def.key) continue;
    const name = compound.slice(slash + 1);
    if (view.servers.some((s) => s.name === name)) continue;
    view.servers.push({
      name, transport: transportOf(spec), summary: summarize(spec),
      spec: denormalizeSpec(spec) as McpServerSpec, enabled: false,
    });
  }
  view.servers.sort((a, b) => a.name.localeCompare(b.name));
  return view;
}

export async function snapshot(): Promise<Snapshot> {
  const warnings: Diagnostic[] = [];
  const sources = await resolveSources();
  const views: SourceView[] = [];
  for (const entry of sources) {
    views.push(await buildSourceView(entry, warnings));
  }
  const backups = await listBackups();
  const state = await loadState();
  return {
    sources: views.filter((v) => v.exists || v.servers.length > 0 || v.overridden || v.error),
    backups,
    warnings,
    order: state.order ?? {},
  };
}

/** 保存面板内手动排序（纯展示层，不写任何配置文件）。 */
export async function setOrder(groupKey: string, items: string[]) {
  if (!groupKey || groupKey.length > 128) {
    return { ok: false as const, code: "error.proto.invalidParams", error: "group 无效" };
  }
  const list = Array.isArray(items) ? items.filter((item) => typeof item === "string" && item.length <= 256).slice(0, 500) : [];
  await updateState((state) => {
    state.order = { ...state.order, [groupKey]: list };
  });
  return { ok: true as const };
}

// ---------- 写入 ----------

function denormalizeSpec(spec: McpServerSpec): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(spec.extra ?? {}) };
  if (spec.command !== undefined) out.command = spec.command;
  if (spec.args !== undefined) out.args = spec.args;
  if (spec.env && Object.keys(spec.env).length) out.env = spec.env;
  if (spec.url !== undefined) out.url = spec.url;
  if (spec.headers && Object.keys(spec.headers).length) out.headers = spec.headers;
  return out;
}

/** 把"启用态"的服务器集合写回配置文件。调用前必须已备份。 */
async function writeServers(def: SourceDef, path: string, enabled: Record<string, McpServerSpec>): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  if (def.format === "cordis-yaml") {
    let text = (await readSourceText(path)) ?? "";
    const current = parseCordisServers(text);
    // 删除不在启用集合里的（停用的条目仍在集合里，带 disabled 标志）
    for (const name of Object.keys(current)) {
      if (!(name in enabled)) text = writeCordisServer(text, name, null);
    }
    // 写入/更新启用集合（含停用条目，保留其 disabled 状态）
    for (const [name, spec] of Object.entries(enabled)) {
      text = writeCordisServer(text, name, spec);
    }
    await atomicWriteFile(path, text);
    return;
  }
  if (def.format === "toml-codex") {
    let text = (await readSourceText(path)) ?? "";
    const current = parseCodexServers(text);
    // 删除不在启用集合里的
    for (const name of Object.keys(current)) {
      if (!(name in enabled)) text = writeCodexServer(text, name, null);
    }
    // 写入/更新启用集合
    for (const [name, spec] of Object.entries(enabled)) {
      text = writeCodexServer(text, name, serializeServerToml(name, spec));
    }
    await atomicWriteFile(path, text);
    return;
  }
  const tableKey = def.format === "json-mcp" ? "mcp" : "mcpServers";
  let doc: Record<string, unknown> = {};
  const text = await readSourceText(path);
  if (text !== null && text.trim()) {
    try {
      const parsed = parseJsonLenient(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) doc = parsed as Record<string, unknown>;
    } catch {
      fail(422, "error.config.parse", `原配置不是合法 JSON，拒绝写入: ${path}`);
    }
  }
  const table: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(enabled)) table[name] = denormalizeSpec(spec);
  doc[tableKey] = table;
  await atomicWriteFile(path, JSON.stringify(doc, null, 2) + "\n");
}

async function atomicWriteFile(path: string, content: string): Promise<void> {
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, content, "utf8");
  await rename(tmp, path);
}

/** 通用变更：读出 -> 备份 -> 改 -> 写回。mutate 返回说明文字（记入备份原因）。 */
async function mutateSource(
  key: string,
  log: Log,
  reason: string,
  mutate: (enabled: Record<string, McpServerSpec>, ctx: { label: string }) => void | Promise<void>,
): Promise<{ ok: true } | OperationError> {
  const { def, path } = await findSource(key);
  if (!path) return { ok: false, code: "error.source.missing", error: `来源没有可用路径: ${key}` };
  if (!def.writable) return { ok: false, code: "error.source.readonly", error: `来源不允许写入: ${def.label}` };

  const text = await readSourceText(path);
  let enabled: Record<string, McpServerSpec> = {};
  if (text !== null) {
    enabled = extractServers(def, text);
  }
  await mutate(enabled, { label: def.label });
  await makeBackup(def.key, def.label, path, reason);
  await writeServers(def, path, enabled);
  await log("write", { source: key, reason });
  return { ok: true };
}

export async function setServerEnabled(sourceKey: string, name: string, enabledFlag: boolean, log: Log) {
  const found = await findSource(sourceKey);
  if (found.def.format === "cordis-yaml") {
    // cordis 条目有原生 disabled 字段：停用/启用只改这一行，条目留在文件里
    const compound = `${sourceKey}/${name}`;
    let restored = false;
    const result = await mutateSource(sourceKey, log, `${enabledFlag ? "enable" : "disable"} ${name}`, async (enabled) => {
      const spec = enabled[name];
      if (spec) {
        if (enabledFlag) delete spec.disabled;
        else spec.disabled = true;
        return;
      }
      if (!enabledFlag) fail(404, "error.server.notFound", `服务器不存在: ${name}`);
      // 兼容旧版把条目移出文件存进 state.disabled 的情况：启用时写回
      const state = await loadState();
      const saved = state.disabled[compound];
      if (!saved) fail(404, "error.server.notFound", `服务器不存在: ${name}`);
      enabled[name] = { ...saved };
      delete enabled[name].disabled;
      restored = true;
    });
    if (result.ok && restored) {
      await updateState((s) => { delete s.disabled[compound]; });
    }
    return result;
  }
  if (!enabledFlag) {
    // 停用：从配置移出，定义存进 state.disabled
    const { def } = await findSource(sourceKey);
    const result = await mutateSource(sourceKey, log, `disable ${name}`, async (enabled) => {
      const spec = enabled[name];
      if (!spec) fail(404, "error.server.notFound", `服务器不存在: ${name}`);
      delete enabled[name];
      await updateState((state) => {
        state.disabled[`${def.key}/${name}`] = spec;
      });
    });
    return result;
  }
  // 启用：从 state.disabled 写回配置
  const state = await loadState();
  const compound = `${sourceKey}/${name}`;
  const spec = state.disabled[compound];
  if (!spec) return { ok: false as const, code: "error.server.notDisabled", error: `服务器不在停用列表: ${name}` };
  const result = await mutateSource(sourceKey, log, `enable ${name}`, async (enabled) => {
    if (enabled[name]) fail(409, "error.server.conflict", `同名服务器已存在: ${name}`);
    enabled[name] = spec;
  });
  if (result.ok) {
    await updateState((s) => {
      delete s.disabled[compound];
    });
  }
  return result;
}

export async function upsertServer(input: ServerInput, log: Log) {
  const sourceKey = String(input.source || "");
  const name = String(input.name || "").trim();
  if (!sourceKey) return { ok: false as const, code: "error.proto.invalidParams", error: "缺少 source" };
  if (!/^[^\s/\\]{1,64}$/.test(name)) {
    return { ok: false as const, code: "error.server.name", error: `服务器名无效（1-64 字符，不含空白与斜杠）: ${name}` };
  }
  let spec: McpServerSpec;
  if (typeof input.raw === "string" && input.raw.trim()) {
    try {
      spec = normalizeSpec(JSON.parse(input.raw));
    } catch {
      return { ok: false as const, code: "error.server.raw", error: "JSON 定义不是合法 JSON" };
    }
  } else {
    spec = {};
    const transport = input.transport === "http" || input.transport === "sse" ? input.transport : "stdio";
    if (transport === "stdio") {
      if (!input.command || !String(input.command).trim()) {
        return { ok: false as const, code: "error.server.command", error: "stdio 类型必须填写 command" };
      }
      spec.command = String(input.command).trim();
      if (Array.isArray(input.args) && input.args.length) spec.args = input.args.map(String);
      if (input.env && Object.keys(input.env).length) spec.env = input.env;
    } else {
      if (!input.url || !/^https?:\/\//.test(String(input.url))) {
        return { ok: false as const, code: "error.server.url", error: "http/sse 类型必须填写 http(s) URL" };
      }
      spec.url = String(input.url).trim();
      if (input.headers && Object.keys(input.headers).length) spec.headers = input.headers;
    }
  }
  const result = await mutateSource(sourceKey, log, `upsert ${name}`, async (enabled) => {
    enabled[name] = spec;
  });
  if (result.ok) {
    // 若之前在停用列表，顺带清掉
    await updateState((s) => {
      delete s.disabled[`${sourceKey}/${name}`];
    });
  }
  return result;
}

/** 连接器目录的一次安装目标：把同一份 spec 写进多个 Agent 配置。 */
export interface CatalogInstallSpec {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  /** 额外写入配置的字段（如 WorkBuddy 的 timeout / disabledTools），写入前会平铺到顶层 */
  extra?: Record<string, unknown>;
}

export async function installCatalogServers(
  input: { name?: string; targets?: string[]; spec?: CatalogInstallSpec },
  log: Log,
) {
  const name = String(input.name || "").trim();
  if (!/^[^\s/\\]{1,64}$/.test(name)) {
    return { ok: false as const, code: "error.server.name", error: `服务器名无效（1-64 字符，不含空白与斜杠）: ${name}` };
  }
  const targets = [...new Set(Array.isArray(input.targets) ? input.targets.map(String).filter(Boolean) : [])].slice(0, 32);
  if (!targets.length) {
    return { ok: false as const, code: "error.catalog.targets", error: "至少选择一个写入目标" };
  }
  const spec = input.spec;
  if (!spec || typeof spec !== "object" || (!spec.command && !spec.url)) {
    return { ok: false as const, code: "error.catalog.spec", error: "连接器定义缺少 command 或 url" };
  }

  const results: Array<Record<string, unknown>> = [];
  for (const target of targets) {
    try {
      const hit = await findSource(target);
      // extra 是目录条目的内部结构，写入配置时要平铺到顶层
      const { extra, ...base } = spec;
      let writeSpec: Record<string, unknown> = { ...base, ...(extra ?? {}) };
      // DSH 的 mcp-client 直接 spawn，不经过 shell；Windows 上 npx/uvx 是 .cmd 包装，需要 cmd /c
      if (
        process.platform === "win32" &&
        hit.def.format === "cordis-yaml" &&
        typeof spec.command === "string" &&
        /^(npx|uvx|npm)$/i.test(spec.command)
      ) {
        writeSpec = { ...writeSpec, command: "cmd", args: ["/c", spec.command, ...(spec.args ?? []).map(String)] };
      }
      const result = await upsertServer({ source: target, name, raw: JSON.stringify(writeSpec) }, log);
      results.push({ source: target, ...result });
    } catch (caught) {
      const e = caught as CodedError;
      results.push({ source: target, ok: false, code: e.code ?? "error.catalog.install", error: e.message });
    }
  }
  return { results };
}

export async function uninstallCatalogServers(input: { name?: string; targets?: string[] }, log: Log) {
  const name = String(input.name || "").trim();
  const targets = [...new Set(Array.isArray(input.targets) ? input.targets.map(String).filter(Boolean) : [])].slice(0, 32);
  if (!name) return { ok: false as const, code: "error.server.name", error: "缺少服务器名" };
  if (!targets.length) return { ok: false as const, code: "error.catalog.targets", error: "至少选择一个写入目标" };

  const results: Array<Record<string, unknown>> = [];
  for (const target of targets) {
    try {
      const hit = await findSource(target);
      // 目标文件不存在时不创建空配置
      if (!hit.path) {
        results.push({ source: target, ok: true, skipped: true });
        continue;
      }
      try {
        await access(hit.path);
      } catch {
        results.push({ source: target, ok: true, skipped: true });
        continue;
      }
      const result = await deleteServer(target, name, log);
      results.push({ source: target, ...result });
    } catch (caught) {
      const e = caught as CodedError;
      results.push({ source: target, ok: false, code: e.code ?? "error.catalog.uninstall", error: e.message });
    }
  }
  return { results };
}

export async function deleteServer(sourceKey: string, name: string, log: Log) {
  // 先清停用存储里的同名条目（不碰配置文件）
  await updateState((s) => {
    delete s.disabled[`${sourceKey}/${name}`];
  });
  return mutateSource(sourceKey, log, `delete ${name}`, async (enabled) => {
    if (!(name in enabled)) {
      // 文件里本来就没有（只在停用列表里），不算错误
      return;
    }
    delete enabled[name];
  });
}

// ---------- 备份回退 ----------

export async function restoreBackup(id: string, log: Log) {
  const backups = await listBackups();
  const entry = backups.find((b) => b.id === id);
  if (!entry) return { ok: false as const, code: "error.backup.notFound", error: `备份不存在: ${id}` };
  let content: string;
  try {
    content = await readFile(entry.file, "utf8");
  } catch {
    return { ok: false as const, code: "error.backup.missing", error: `备份文件丢失: ${entry.file}` };
  }
  // 回退前也先备份当前状态，回退本身可再回退
  await makeBackup(entry.sourceKey, entry.sourceLabel, entry.targetPath, `pre-restore ${id}`);
  await mkdir(dirname(entry.targetPath), { recursive: true });
  await atomicWriteFile(entry.targetPath, content);
  await log("restore", { id, target: entry.targetPath });
  return { ok: true as const };
}

export async function deleteBackup(id: string) {
  await removeBackupEntry(id);
  return { ok: true as const };
}

// ---------- 来源路径覆盖与自定义来源 ----------

export async function setRootPath(key: string, path: string | null) {
  // 内置来源 + 按 profile 动态生成的 DSH 来源都允许改路径
  const known = (await resolveSources()).some((source) => source.def.key === key);
  if (!known) {
    return { ok: false as const, code: "error.source.unknown", error: `未知配置来源: ${key}` };
  }
  if (path !== null) {
    const expanded = expandPath(path);
    try {
      await access(expanded);
    } catch {
      return { ok: false as const, code: "error.rootPath.notFound", error: `路径不存在: ${expanded}` };
    }
  }
  await updateState((s) => {
    if (path === null) delete s.rootOverrides[key];
    else s.rootOverrides[key] = path.trim();
  });
  return { ok: true as const };
}

export async function addCustomSource(label: string, path: string) {
  const expanded = expandPath(path);
  try {
    await access(expanded);
  } catch {
    return { ok: false as const, code: "error.rootPath.notFound", error: `路径不存在: ${expanded}` };
  }
  const key = `custom-${randomUUID().slice(0, 8)}`;
  await updateState((s) => {
    if (s.customSources.length >= 32) fail(400, "error.customSource.limit", "自定义来源数量已达上限: 32");
    s.customSources.push({ key, label: label.trim() || expanded, path: expanded });
  });
  return { ok: true as const, key };
}

export async function removeCustomSource(key: string) {
  await updateState((s) => {
    s.customSources = s.customSources.filter((c) => c.key !== key);
  });
  return { ok: true as const };
}

// ---------- 打开所在文件夹 ----------

export async function openFolder(sourceKey: string) {
  let resolved: { path: string | null };
  try {
    resolved = await findSource(sourceKey);
  } catch (caught) {
    const e = caught as CodedError;
    return { ok: false as const, code: e.code ?? "error.source.unknown", error: e.message };
  }
  const { path } = resolved;
  if (!path) return { ok: false as const, code: "error.source.missing", error: `来源没有可用路径: ${sourceKey}` };
  const dir = dirname(path);
  try {
    await access(dir);
  } catch {
    return { ok: false as const, code: "error.folder.missing", error: `目录不存在: ${dir}` };
  }
  const cmd = process.platform === "win32" ? "explorer.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  try {
    const child = spawn(cmd, [dir], { detached: true, stdio: "ignore" });
    child.on("error", () => { /* 打不开时不拖垮请求 */ });
    child.unref();
  } catch (caught) {
    const e = caught as CodedError;
    return { ok: false as const, code: "error.openFolder", error: e.message };
  }
  return { ok: true as const };
}

export type { BackupEntry };
