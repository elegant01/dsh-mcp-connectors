// TraeWork（TRAE SOLO CN）内置 MCP 市场：公开的 agent 目录接口，无需登录。
//   列表   GET https://api.trae.com.cn/extensions/api/-/agent/search?query=&size=100&offset=N
//   详情   GET https://api.trae.com.cn/extensions/api/-/agent/detail?id=<id>&mcpServerType=stdio
//   README GET https://api.trae.com.cn/extensions/api/-/agent/direct-download?fileID=...
// 当前目录里 475 条全部是 stdio（command + args + configs），可直接写进任意 Agent 的 MCP 配置；
// 列表条目已带图标、仓库地址、README 地址与 tools，安装不需要再请求详情。
// 注意：TraeWork 里的「连接器」是 OAuth 账号授权（ListConnectorInterfaces 要登录），不是 MCP 服务器，搬不过来。

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CatalogEntry, CatalogField } from "./catalog-data.js";
import { managerDir } from "./state.js";

const MARKET_BASE = "https://api.trae.com.cn";
const LIST_URL = `${MARKET_BASE}/extensions/api/-/agent/search`;
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const CACHE_TTL_MS = 30 * 60_000;
const REQUEST_TIMEOUT_MS = 20_000;
const README_MAX_BYTES = 512 * 1024;
const USER_AGENT = "dsh-mcp-connectors (+https://github.com/elegant01/dsh-mcp-connectors)";

export interface TraeCatalogPayload {
  items: CatalogEntry[];
  fetchedAt: string;
  /** true = 网络失败，返回的是本地快照 */
  stale: boolean;
  source: string;
  error?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function slugify(input: string, fallback: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

function fieldKey(input: string, fallback: string): string {
  const key = input.replace(/[^\w-]/g, "_").replace(/^_+|_+$/g, "");
  return key || fallback;
}

function cacheDir(): string {
  return join(managerDir(), "catalog-cache");
}

function catalogCachePath(): string {
  return join(cacheDir(), "trae-catalog.json");
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`TraeWork 市场接口返回 ${response.status}: ${url}`);
  return response.json();
}

const PLATFORM_KEYS: Record<string, string> = { win32: "windows", darwin: "darwin", linux: "linux" };

/** 按本机平台挑选运行配置：本平台 > universal > 任意一个。 */
function pickRun(item: Record<string, unknown>): { run: Record<string, unknown>; platformKey: string } | null {
  const commands = asRecord(item.commands);
  if (!commands) return null;
  const keys = [
    PLATFORM_KEYS[process.platform] ?? process.platform,
    "universal",
    "windows",
    "darwin",
    "linux",
    ...Object.keys(commands),
  ];
  const seen = new Set<string>();
  for (const key of keys) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const block = asRecord(commands[key]);
    const runs = Array.isArray(block?.run) ? block!.run as unknown[] : [];
    const run = asRecord(runs[0]);
    if (run && str(run.command)) return { run, platformKey: key };
  }
  return null;
}

/** 从启动命令里识别包名，用于「已安装」匹配。 */
function packageIdOf(command: string | undefined, args: string[]): string | undefined {
  if (!command) return undefined;
  if (/^(npx|npm|pnpm|bunx)$/i.test(command)) {
    const arg = args.find((item) => !item.startsWith("-"));
    return arg ? arg.replace(/@(\d[\w.-]*|\^[\w.-]*|~[\w.-]*|latest)$/i, "") : undefined;
  }
  if (/^uvx$/i.test(command)) {
    return args.find((item) => !item.startsWith("-"));
  }
  return undefined;
}

/**
 * 把市场条目映射成连接器目录条目（导出以便单测）。
 * - configs[].type === "env" → 环境变量占位符
 * - configs[].type === "args" → 追加到启动命令（上一项是 --flag 时作为它的值，否则作为位置参数）
 */
export function mapTraeItem(raw: unknown): CatalogEntry | null {
  const item = asRecord(raw);
  if (!item) return null;
  const remoteId = str(item.id);
  if (!remoteId) return null;
  const title = str(item.displayName) ?? str(item.name) ?? remoteId;
  const picked = pickRun(item);
  const tags = stringArray(item.categories);
  const provider = asRecord(item.provider);
  const providerName = str(provider?.displayTextKey);
  if (providerName && providerName !== "first_party" && !tags.includes(providerName)) tags.push(providerName);
  const base = {
    id: slugify(title, remoteId),
    remoteId,
    title,
    description: str(item.description) ?? "",
    source: "trae" as const,
    transport: (str(item.mcpServerType) === "http" ? "http" : "stdio") as CatalogEntry["transport"],
    iconUrl: str(item.icon),
    repository: str(item.repository),
    tags: tags.length ? tags : undefined,
  };
  if (!picked) {
    return {
      ...base,
      fields: [],
      installable: false,
      warning: "该条目在 TraeWork 市场里只提供了介绍，没有可直接运行的命令；请到 TraeWork 内安装或查看它的 README。",
    };
  }
  const run = picked.run;
  const command = str(run.command)!;
  const args = stringArray(run.args);
  const fields: CatalogField[] = [];
  const env: Record<string, string> = {};
  const extraArgs: string[] = [];
  let index = 0;
  for (const rawConfig of Array.isArray(run.configs) ? run.configs : []) {
    const config = asRecord(rawConfig);
    if (!config) continue;
    const type = str(config.type);
    const key = fieldKey(str(config.key) ?? str(config.title) ?? "", `param_${index++}`);
    if (type === "args") {
      const last = args.length ? args[args.length - 1] : "";
      const takesValue = last.startsWith("-") && !last.includes("=");
      if (takesValue) args.push(`{{${key}}}`);
      else extraArgs.push(`{{${key}}}`);
    } else if (type === "env") {
      env[key] = `{{${key}}}`;
    } else {
      continue;
    }
    fields.push({
      key,
      label: str(config.title) ?? str(config.placeholder) ?? key,
      description: str(config.description),
      required: config.required === true,
      secret: config.isPassword === true,
      default: str(config.default) ?? (typeof config.default === "string" ? config.default : undefined),
      placeholder: str(config.placeholder),
    });
  }
  const allArgs = [...args, ...extraArgs];
  const limited = picked.platformKey !== "universal" && picked.platformKey !== PLATFORM_KEYS[process.platform];
  return {
    ...base,
    packageId: packageIdOf(command, allArgs),
    command,
    args: allArgs.length ? allArgs : undefined,
    env: Object.keys(env).length ? env : undefined,
    fields,
    warning: limited
      ? `该条目只提供了 ${picked.platformKey} 平台的运行配置，当前系统可能无法直接运行。`
      : "来自 TraeWork 的 MCP 市场（社区 / 第三方提供），安装前请确认来源与权限。",
  };
}

interface ListCacheFile {
  fetchedAt: string;
  items: CatalogEntry[];
}

let listMemo: { at: number; payload: TraeCatalogPayload } | null = null;
let listInflight: Promise<TraeCatalogPayload> | null = null;

async function readListSnapshot(): Promise<ListCacheFile | null> {
  try {
    const parsed = JSON.parse(await readFile(catalogCachePath(), "utf8")) as ListCacheFile;
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeListSnapshot(items: CatalogEntry[]): Promise<void> {
  const file = catalogCachePath();
  try {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ fetchedAt: new Date().toISOString(), items }, null, 2), "utf8");
  } catch { /* 缓存写失败不影响返回 */ }
}

async function fetchAllPages(): Promise<CatalogEntry[]> {
  const items: CatalogEntry[] = [];
  const seenRemote = new Set<string>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${LIST_URL}?query=&size=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`;
    const payload = asRecord(await getJson(url));
    const rawItems = Array.isArray(payload?.data) ? payload!.data as unknown[] : [];
    for (const raw of rawItems) {
      const remoteId = str(asRecord(raw)?.id);
      if (remoteId) {
        if (seenRemote.has(remoteId)) continue;
        seenRemote.add(remoteId);
      }
      const entry = mapTraeItem(raw);
      if (entry) items.push(entry);
    }
    const total = typeof payload?.totalSize === "number" ? payload.totalSize : Infinity;
    if (rawItems.length < PAGE_SIZE || items.length >= total) break;
  }
  // 同名 slug 去重（不同命名空间可能重名）
  const seen = new Map<string, number>();
  for (const item of items) {
    const count = seen.get(item.id) ?? 0;
    seen.set(item.id, count + 1);
    if (count) item.id = `${item.id}-${count + 1}`;
  }
  return items;
}

/** 读取 TraeWork MCP 市场目录：30 分钟缓存，网络失败时回退本地快照。 */
export async function loadTraeCatalog(): Promise<TraeCatalogPayload> {
  if (listMemo && Date.now() - listMemo.at < CACHE_TTL_MS) return listMemo.payload;
  if (listInflight) return listInflight;

  listInflight = (async () => {
    const snapshot = await readListSnapshot();
    if (snapshot && Date.now() - Date.parse(snapshot.fetchedAt) < CACHE_TTL_MS) {
      const payload: TraeCatalogPayload = {
        items: snapshot.items, fetchedAt: snapshot.fetchedAt, stale: false, source: MARKET_BASE,
      };
      listMemo = { at: Date.now(), payload };
      return payload;
    }
    try {
      const items = await fetchAllPages();
      const payload: TraeCatalogPayload = {
        items, fetchedAt: new Date().toISOString(), stale: false, source: MARKET_BASE,
      };
      listMemo = { at: Date.now(), payload };
      await writeListSnapshot(items);
      return payload;
    } catch (caught) {
      if (snapshot) {
        const payload: TraeCatalogPayload = {
          items: snapshot.items,
          fetchedAt: snapshot.fetchedAt,
          stale: true,
          source: MARKET_BASE,
          error: caught instanceof Error ? caught.message : String(caught),
        };
        listMemo = { at: Date.now(), payload };
        return payload;
      }
      throw caught;
    }
  })();

  try {
    return await listInflight;
  } finally {
    listInflight = null;
  }
}

// ---------- README（详情页按需加载） ----------

const readmeCache = new Map<string, { at: number; data: { text: string; url: string; truncated: boolean } }>();

/** 只允许抓市场自己的 README 下载地址，避免被当成任意代理。 */
function allowedReadme(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:"
      && parsed.hostname === "api.trae.com.cn"
      && parsed.pathname.startsWith("/extensions/api/-/agent/direct-download");
  } catch {
    return false;
  }
}

/** 读取某个市场条目的 README（30 分钟缓存）。 */
export async function fetchTraeReadme(id: string): Promise<{ text: string; url: string; truncated: boolean }> {
  if (!/^[A-Za-z0-9_.:-]{1,200}$/.test(id)) throw new Error(`无效的 TraeWork 条目: ${id}`);
  const hit = readmeCache.get(id);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  const catalog = await loadTraeCatalog();
  const entry = catalog.items.find((item) => item.remoteId === id);
  if (!entry) throw new Error(`TraeWork 市场里没有该条目: ${id}`);
  const detail = asRecord(await getJson(
    `${MARKET_BASE}/extensions/api/-/agent/detail?id=${encodeURIComponent(id)}&mcpServerType=stdio`,
  ));
  const readmeUrl = str(asRecord(detail?.data)?.readme) ?? str(detail?.readme);
  if (!readmeUrl || !allowedReadme(readmeUrl)) throw new Error("该条目没有可读取的 README");
  const fileId = new URL(readmeUrl).searchParams.get("fileID") ?? "";
  if (!fileId.trim()) throw new Error("该条目没有可读取的 README");

  const response = await fetch(readmeUrl, {
    headers: { accept: "text/plain, text/markdown;q=0.9, */*;q=0.1", "user-agent": USER_AGENT },
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`README 下载失败: HTTP ${response.status}`);
  const text = await response.text();
  const truncated = text.length > README_MAX_BYTES;
  const data = { text: truncated ? text.slice(0, README_MAX_BYTES) : text, url: readmeUrl, truncated };
  readmeCache.set(id, { at: Date.now(), data });
  if (readmeCache.size > 128) {
    const oldest = [...readmeCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) readmeCache.delete(oldest[0]);
  }
  return data;
}
