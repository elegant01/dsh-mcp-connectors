import { mkdir, readFile, writeFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { managerDir } from "./state.js";
const PAGE_SIZE = 50;
const MAX_PAGES = 20;
const CACHE_TTL_MS = 30 * 6e4;
const REQUEST_TIMEOUT_MS = 2e4;
const USER_AGENT = "dsh-mcp-connectors (+https://github.com/elegant01/dsh-mcp-connectors)";
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function str(value) {
  return typeof value === "string" && value.trim() ? value : void 0;
}
function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && Boolean(item.trim())) : [];
}
async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
let baseMemo = null;
async function marketBase() {
  if (baseMemo) return baseMemo;
  const home = homedir();
  if (await exists(join(home, ".qoder-cn"))) baseMemo = "https://qoder.cn";
  else if (await exists(join(home, ".qoder"))) baseMemo = "https://qoder.com";
  else baseMemo = "https://qoder.cn";
  return baseMemo;
}
function marketplaceUrl(base) {
  return `${base}/marketplace`;
}
function slugify(input, fallback) {
  const slug = input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return slug || fallback;
}
function cacheDir() {
  return join(managerDir(), "catalog-cache");
}
function catalogCachePath() {
  return join(cacheDir(), "qoder-catalog.json");
}
function detailCachePath(id) {
  return join(cacheDir(), "qoder-details", `${id.replace(/[^A-Za-z0-9_.-]/g, "_")}.json`);
}
async function getJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`Qoder \u5E02\u573A\u63A5\u53E3\u8FD4\u56DE ${response.status}: ${url}`);
  return response.json();
}
function mapQoderItem(raw, base) {
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
    tags: tags.length ? tags : void 0,
    fields: [],
    installable: true
  };
}
function mapQoderDetail(raw, base) {
  const item = asRecord(raw) ?? {};
  const baseEntry = mapQoderItem(item, base);
  if (!baseEntry) throw new Error("Qoder \u8FDE\u63A5\u5668\u8BE6\u60C5\u7F3A\u5C11 connector_id");
  const config = asRecord(item.config);
  const servers = Array.isArray(config?.servers) ? config.servers : [];
  const server = asRecord(servers.find((entry) => asRecord(entry))) ?? {};
  const providerUrl = str(server.url);
  const gatewayUrl = str(server.qoder_url);
  const authType = str(server.auth_type) ?? "none";
  const protocol = str(server.protocol);
  const serverName = str(server.name) ?? baseEntry.titleEn ?? baseEntry.title;
  const hosted = providerUrl ? /^https:\/\/mcp\.qoder\.(cn|com)\//i.test(providerUrl) || providerUrl === gatewayUrl : true;
  let installable = true;
  let warning;
  if (authType === "api_key") {
    installable = false;
    warning = "\u8BE5\u8FDE\u63A5\u5668\u9700\u8981 API Key\uFF0C\u5E76\u4F9D\u8D56 Qoder \u7F51\u5173\u6CE8\u5165\u51ED\u636E\uFF1B\u8BF7\u5230 Qoder \u5E02\u573A\u5185\u5B89\u88C5\u3002";
  } else if (hosted) {
    installable = false;
    warning = "\u8BE5\u8FDE\u63A5\u5668\u7531 Qoder \u7F51\u5173\u6258\u7BA1\u9274\u6743\uFF0C\u53EA\u80FD\u5728 Qoder \u5E02\u573A\u5185\u5B89\u88C5\u3002";
  } else if (authType === "oauth") {
    warning = "\u5B89\u88C5\u540E\u9996\u6B21\u8FDE\u63A5\u9700\u8981\u5728 Qoder \u6216\u76EE\u6807 Agent \u5185\u5B8C\u6210 OAuth \u767B\u5F55\u3002";
  }
  const tools = Array.isArray(server.tools) ? server.tools.length : 0;
  const tags = [...baseEntry.tags ?? []];
  if (protocol && !tags.includes(protocol)) tags.push(protocol);
  if (tools) tags.push(`${tools} tools`);
  return {
    ...baseEntry,
    id: slugify(serverName, baseEntry.remoteId ?? baseEntry.id),
    title: baseEntry.title,
    titleEn: baseEntry.titleEn,
    transport: "http",
    url: installable && providerUrl ? providerUrl : void 0,
    extra: installable ? { type: "http" } : void 0,
    installable,
    warning,
    tags: tags.length ? tags : void 0
  };
}
let listMemo = null;
let listInflight = null;
async function readListSnapshot() {
  try {
    const parsed = JSON.parse(await readFile(catalogCachePath(), "utf8"));
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}
async function writeListSnapshot(items) {
  const file = catalogCachePath();
  try {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ fetchedAt: (/* @__PURE__ */ new Date()).toISOString(), items }, null, 2), "utf8");
  } catch {
  }
}
async function fetchAllPages(base) {
  const items = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${base}/apphub/api/v1/marketplace/catalog/extensions?extension_types=connector&pagination.current_page=${page}&pagination.page_size=${PAGE_SIZE}`;
    const payload = asRecord(await getJson(url));
    const block = asRecord(payload?.connectors);
    const rawItems = Array.isArray(block?.items) ? block.items : [];
    for (const raw of rawItems) {
      const entry = mapQoderItem(raw, base);
      if (entry) items.push(entry);
    }
    const pages = asRecord(block?.pages);
    const lastPage = typeof pages?.last_page === "number" ? pages.last_page : page;
    if (!rawItems.length || page >= lastPage) break;
  }
  const seen = /* @__PURE__ */ new Map();
  for (const item of items) {
    const count = seen.get(item.id) ?? 0;
    seen.set(item.id, count + 1);
    if (count) item.id = `${item.id}-${count + 1}`;
  }
  return items;
}
async function loadQoderCatalog() {
  const base = await marketBase();
  if (listMemo && Date.now() - listMemo.at < CACHE_TTL_MS) return listMemo.payload;
  if (listInflight) return listInflight;
  listInflight = (async () => {
    const snapshot = await readListSnapshot();
    if (snapshot && Date.now() - Date.parse(snapshot.fetchedAt) < CACHE_TTL_MS) {
      const payload = {
        items: snapshot.items,
        fetchedAt: snapshot.fetchedAt,
        stale: false,
        source: base
      };
      listMemo = { at: Date.now(), payload };
      return payload;
    }
    try {
      const items = await fetchAllPages(base);
      const payload = {
        items,
        fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
        stale: false,
        source: base
      };
      listMemo = { at: Date.now(), payload };
      await writeListSnapshot(items);
      return payload;
    } catch (caught) {
      if (snapshot) {
        const payload = {
          items: snapshot.items,
          fetchedAt: snapshot.fetchedAt,
          stale: true,
          source: base,
          error: caught instanceof Error ? caught.message : String(caught)
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
const detailMemo = /* @__PURE__ */ new Map();
const detailInflight = /* @__PURE__ */ new Map();
async function fetchQoderDetail(id) {
  if (!/^[A-Za-z0-9_.:-]{1,200}$/.test(id)) throw new Error(`\u65E0\u6548\u7684 Qoder \u8FDE\u63A5\u5668: ${id}`);
  const memo = detailMemo.get(id);
  if (memo && Date.now() - memo.at < CACHE_TTL_MS) return memo.entry;
  const inflight = detailInflight.get(id);
  if (inflight) return inflight;
  const task = (async () => {
    const base = await marketBase();
    let snapshot = null;
    try {
      snapshot = JSON.parse(await readFile(detailCachePath(id), "utf8"));
    } catch {
    }
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
        await writeFile(detailCachePath(id), JSON.stringify({ fetchedAt: (/* @__PURE__ */ new Date()).toISOString(), entry }, null, 2), "utf8");
      } catch {
      }
      return entry;
    } catch (caught) {
      if (snapshot) {
        const entry = { ...snapshot.entry, warning: `Qoder \u5E02\u573A\u4E0D\u53EF\u7528\uFF0C\u663E\u793A\u4E0A\u6B21\u5FEB\u7167\uFF1A${caught instanceof Error ? caught.message : String(caught)}` };
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
export {
  fetchQoderDetail,
  loadQoderCatalog,
  mapQoderDetail,
  mapQoderItem
};
