// Qoder 官方连接器市场（apphub）：读取公开目录接口，映射成连接器目录。
// 数据来源（Qoder 客户端自己维护，本机只落"已安装回执"，没有整份目录缓存）：
//   列表  GET {base}/apphub/api/v1/marketplace/catalog/extensions?extension_types=connector&pagination...
//   详情  GET {base}/apphub/api/v1/marketplace/connectors/<connector_id>/detail
// 所以这里走在线接口 + 30 分钟缓存 + 断网回退本地快照。
// 安装回写：Qoder 的 MCP 配置在 settings.json 顶层 mcpServers（~/.qoder 或 ~/.qoder-cn），
// 远程条目写 { type: "http", url }；但经 mcp.qoder.cn 网关托管的连接器离开 Qoder 的
// 市场安装流程无法鉴权，详情页会标成只读，不提供一键安装。

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { CatalogEntry } from "./catalog-data.js";
import { managerDir } from "./state.js";

const PAGE_SIZE = 50;
const MAX_PAGES = 20;
const CACHE_TTL_MS = 30 * 60_000;
const REQUEST_TIMEOUT_MS = 20_000;
const USER_AGENT = "dsh-mcp-connectors (+https://github.com/elegant01/dsh-mcp-connectors)";

export interface QoderCatalogPayload {
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

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

let baseMemo: string | null = null;
/** 装了国内版用 qoder.cn，只有国际版用 qoder.com，都没装时按国内站处理。 */
async function marketBase(): Promise<string> {
  if (baseMemo) return baseMemo;
  const home = homedir();
  if (await exists(join(home, ".qoder-cn"))) baseMemo = "https://qoder.cn";
  else if (await exists(join(home, ".qoder"))) baseMemo = "https://qoder.com";
  else baseMemo = "https://qoder.cn";
  return baseMemo;
}

function marketplaceUrl(base: string): string {
  return `${base}/marketplace`;
}

function slugify(input: string, fallback: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

function cacheDir(): string {
  return join(managerDir(), "catalog-cache");
}

function catalogCachePath(): string {
  return join(cacheDir(), "qoder-catalog.json");
}

function detailCachePath(id: string): string {
  return join(cacheDir(), "qoder-details", `${id.replace(/[^A-Za-z0-9_.-]/g, "_")}.json`);
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Qoder 市场接口返回 ${response.status}: ${url}`);
  return response.json();
}

/** 把目录接口的一条数据映射成连接器目录条目（导出以便单测）。 */
export function mapQoderItem(raw: unknown, base: string): CatalogEntry | null {
  const item = asRecord(raw);
  if (!item) return null;
  const connectorId = str(item.connector_id);
  if (!connectorId) return null;
  const name = str(item.connector_name) ?? connectorId;
  const nameCn = str(item.connector_name_cn) ?? name;
  const description = str(item.description) ?? "";
  const descriptionZh = str(item.description_cn);
  const category = str(item.category);
  const tags = [...stringArray(item.tags)];
  if (category && !tags.includes(category)) tags.push(category);
  return {
    id: slugify(name, connectorId),
    remoteId: connectorId,
    title: nameCn,
    titleEn: name,
    description,
    descriptionZh,
    source: "qoder",
    transport: "http",
    iconUrl: str(item.icon_url),
    websiteUrl: marketplaceUrl(base),
    tags: tags.length ? tags : undefined,
    fields: [],
    installable: true,
  };
}

/**
 * 把详情接口映射成可安装条目（导出以便单测）。
 * 只有"非网关、非 API Key"的远程 MCP 才能直接写进 Qoder 的 settings.json；
 * 网关托管的连接器需要 Qoder 自己的安装回执与鉴权，标成只读。
 */
export function mapQoderDetail(raw: unknown, base: string): CatalogEntry {
  const item = asRecord(raw) ?? {};
  const baseEntry = mapQoderItem(item, base);
  if (!baseEntry) throw new Error("Qoder 连接器详情缺少 connector_id");

  const config = asRecord(item.config);
  const servers = Array.isArray(config?.servers) ? config!.servers : [];
  const server = asRecord(servers.find((entry) => asRecord(entry))) ?? {};
  const providerUrl = str(server.url);
  const gatewayUrl = str(server.qoder_url);
  const authType = str(server.auth_type) ?? "none";
  const protocol = str(server.protocol);
  const serverName = str(server.name) ?? baseEntry.titleEn ?? baseEntry.title;

  const hosted = providerUrl
    ? /^https:\/\/mcp\.qoder\.(cn|com)\//i.test(providerUrl) || providerUrl === gatewayUrl
    : true;

  let installable = true;
  let warning: string | undefined;
  if (authType === "api_key") {
    installable = false;
    warning = "该连接器需要 API Key，并依赖 Qoder 网关注入凭据；请到 Qoder 市场内安装。";
  } else if (hosted) {
    installable = false;
    warning = "该连接器由 Qoder 网关托管鉴权，只能在 Qoder 市场内安装。";
  } else if (authType === "oauth") {
    warning = "安装后首次连接需要在 Qoder 或目标 Agent 内完成 OAuth 登录。";
  }

  const tools = Array.isArray(server.tools) ? server.tools.length : 0;
  const tags = [...(baseEntry.tags ?? [])];
  if (protocol && !tags.includes(protocol)) tags.push(protocol);
  if (tools) tags.push(`${tools} tools`);

  return {
    ...baseEntry,
    id: slugify(serverName, baseEntry.remoteId ?? baseEntry.id),
    title: baseEntry.title,
    titleEn: baseEntry.titleEn,
    transport: "http",
    url: installable && providerUrl ? providerUrl : undefined,
    extra: installable ? { type: "http" } : undefined,
    installable,
    warning,
    tags: tags.length ? tags : undefined,
  };
}

interface ListCacheFile {
  fetchedAt: string;
  items: CatalogEntry[];
}

let listMemo: { at: number; payload: QoderCatalogPayload } | null = null;
let listInflight: Promise<QoderCatalogPayload> | null = null;

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

async function fetchAllPages(base: string): Promise<CatalogEntry[]> {
  const items: CatalogEntry[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${base}/apphub/api/v1/marketplace/catalog/extensions?extension_types=connector`
      + `&pagination.current_page=${page}&pagination.page_size=${PAGE_SIZE}`;
    const payload = asRecord(await getJson(url));
    const block = asRecord(payload?.connectors);
    const rawItems = Array.isArray(block?.items) ? block!.items : [];
    for (const raw of rawItems) {
      const entry = mapQoderItem(raw, base);
      if (entry) items.push(entry);
    }
    const pages = asRecord(block?.pages);
    const lastPage = typeof pages?.last_page === "number" ? pages.last_page : page;
    if (!rawItems.length || page >= lastPage) break;
  }
  // 同名 slug 去重（极少见，但不能让卡片 key 撞车）
  const seen = new Map<string, number>();
  for (const item of items) {
    const count = seen.get(item.id) ?? 0;
    seen.set(item.id, count + 1);
    if (count) item.id = `${item.id}-${count + 1}`;
  }
  return items;
}

/** 读取 Qoder 官方连接器目录：30 分钟缓存，网络失败时回退本地快照。 */
export async function loadQoderCatalog(): Promise<QoderCatalogPayload> {
  const base = await marketBase();
  if (listMemo && Date.now() - listMemo.at < CACHE_TTL_MS) return listMemo.payload;
  if (listInflight) return listInflight;

  listInflight = (async () => {
    const snapshot = await readListSnapshot();
    if (snapshot && Date.now() - Date.parse(snapshot.fetchedAt) < CACHE_TTL_MS) {
      const payload: QoderCatalogPayload = {
        items: snapshot.items, fetchedAt: snapshot.fetchedAt, stale: false, source: base,
      };
      listMemo = { at: Date.now(), payload };
      return payload;
    }
    try {
      const items = await fetchAllPages(base);
      const payload: QoderCatalogPayload = {
        items, fetchedAt: new Date().toISOString(), stale: false, source: base,
      };
      listMemo = { at: Date.now(), payload };
      await writeListSnapshot(items);
      return payload;
    } catch (caught) {
      if (snapshot) {
        const payload: QoderCatalogPayload = {
          items: snapshot.items,
          fetchedAt: snapshot.fetchedAt,
          stale: true,
          source: base,
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

const detailMemo = new Map<string, { at: number; entry: CatalogEntry }>();
const detailInflight = new Map<string, Promise<CatalogEntry>>();

/** 读取单个连接器详情（安装表单、只读判定都以此为准）；30 分钟缓存 + 本地快照。 */
export async function fetchQoderDetail(id: string): Promise<CatalogEntry> {
  if (!/^[A-Za-z0-9_.:-]{1,200}$/.test(id)) throw new Error(`无效的 Qoder 连接器: ${id}`);
  const memo = detailMemo.get(id);
  if (memo && Date.now() - memo.at < CACHE_TTL_MS) return memo.entry;
  const inflight = detailInflight.get(id);
  if (inflight) return inflight;

  const task = (async () => {
    const base = await marketBase();
    let snapshot: { fetchedAt: string; entry: CatalogEntry } | null = null;
    try {
      snapshot = JSON.parse(await readFile(detailCachePath(id), "utf8")) as { fetchedAt: string; entry: CatalogEntry };
    } catch { /* 没有缓存 */ }
    if (snapshot && Date.now() - Date.parse(snapshot.fetchedAt) < CACHE_TTL_MS) {
      detailMemo.set(id, { at: Date.now(), entry: snapshot.entry });
      return snapshot.entry;
    }
    try {
      const raw = await getJson(`${base}/apphub/api/v1/marketplace/connectors/${encodeURIComponent(id)}/detail`);
      const entry = mapQoderDetail(raw, base);
      detailMemo.set(id, { at: Date.now(), entry });
      try {
        await mkdir(dirname(detailCachePath(id)), { recursive: true });
        await writeFile(detailCachePath(id), JSON.stringify({ fetchedAt: new Date().toISOString(), entry }, null, 2), "utf8");
      } catch { /* 缓存写失败不影响返回 */ }
      return entry;
    } catch (caught) {
      if (snapshot) {
        const entry = { ...snapshot.entry, warning: `Qoder 市场不可用，显示上次快照：${caught instanceof Error ? caught.message : String(caught)}` };
        detailMemo.set(id, { at: Date.now(), entry });
        return entry;
      }
      throw caught;
    }
  })();

  detailInflight.set(id, task);
  try {
    return await task;
  } finally {
    detailInflight.delete(id);
  }
}
