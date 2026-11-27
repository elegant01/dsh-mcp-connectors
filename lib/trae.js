import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { managerDir } from "./state.js";
const MARKET_BASE = "https://api.trae.com.cn";
const LIST_URL = `${MARKET_BASE}/extensions/api/-/agent/search`;
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const CACHE_TTL_MS = 30 * 6e4;
const REQUEST_TIMEOUT_MS = 2e4;
const README_MAX_BYTES = 512 * 1024;
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
function slugify(input, fallback) {
  const slug = input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return slug || fallback;
}
function fieldKey(input, fallback) {
  const key = input.replace(/[^\w-]/g, "_").replace(/^_+|_+$/g, "");
  return key || fallback;
}
function cacheDir() {
  return join(managerDir(), "catalog-cache");
}
function catalogCachePath() {
  return join(cacheDir(), "trae-catalog.json");
}
async function getJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`TraeWork \u5E02\u573A\u63A5\u53E3\u8FD4\u56DE ${response.status}: ${url}`);
  return response.json();
}
const PLATFORM_KEYS = { win32: "windows", darwin: "darwin", linux: "linux" };
function pickRun(item) {
  const commands = asRecord(item.commands);
  if (!commands) return null;
  const keys = [
    PLATFORM_KEYS[process.platform] ?? process.platform,
    "universal",
    "windows",
    "darwin",
    "linux",
    ...Object.keys(commands)
  ];
  const seen = /* @__PURE__ */ new Set();
  for (const key of keys) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const block = asRecord(commands[key]);
    const runs = Array.isArray(block?.run) ? block.run : [];
    const run = asRecord(runs[0]);
    if (run && str(run.command)) return { run, platformKey: key };
  }
  return null;
}
function packageIdOf(command, args) {
  if (!command) return void 0;
  if (/^(npx|npm|pnpm|bunx)$/i.test(command)) {
    const arg = args.find((item) => !item.startsWith("-"));
    return arg ? arg.replace(/@(\d[\w.-]*|\^[\w.-]*|~[\w.-]*|latest)$/i, "") : void 0;
  }
  if (/^uvx$/i.test(command)) {
    return args.find((item) => !item.startsWith("-"));
  }
  return void 0;
}
function mapTraeItem(raw) {
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
    source: "trae",
    transport: str(item.mcpServerType) === "http" ? "http" : "stdio",
    iconUrl: str(item.icon),
    repository: str(item.repository),
    tags: tags.length ? tags : void 0
  };
  if (!picked) {
    return {
      ...base,
      fields: [],
      installable: false,
      warning: "\u8BE5\u6761\u76EE\u5728 TraeWork \u5E02\u573A\u91CC\u53EA\u63D0\u4F9B\u4E86\u4ECB\u7ECD\uFF0C\u6CA1\u6709\u53EF\u76F4\u63A5\u8FD0\u884C\u7684\u547D\u4EE4\uFF1B\u8BF7\u5230 TraeWork \u5185\u5B89\u88C5\u6216\u67E5\u770B\u5B83\u7684 README\u3002"
    };
  }
  const run = picked.run;
  const command = str(run.command);
  const args = stringArray(run.args);
  const fields = [];
  const env = {};
  const extraArgs = [];
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
      default: str(config.default) ?? (typeof config.default === "string" ? config.default : void 0),
      placeholder: str(config.placeholder)
    });
  }
  const allArgs = [...args, ...extraArgs];
  const limited = picked.platformKey !== "universal" && picked.platformKey !== PLATFORM_KEYS[process.platform];
  return {
    ...base,
    packageId: packageIdOf(command, allArgs),
    command,
    args: allArgs.length ? allArgs : void 0,
    env: Object.keys(env).length ? env : void 0,
    fields,
    warning: limited ? `\u8BE5\u6761\u76EE\u53EA\u63D0\u4F9B\u4E86 ${picked.platformKey} \u5E73\u53F0\u7684\u8FD0\u884C\u914D\u7F6E\uFF0C\u5F53\u524D\u7CFB\u7EDF\u53EF\u80FD\u65E0\u6CD5\u76F4\u63A5\u8FD0\u884C\u3002` : "\u6765\u81EA TraeWork \u7684 MCP \u5E02\u573A\uFF08\u793E\u533A / \u7B2C\u4E09\u65B9\u63D0\u4F9B\uFF09\uFF0C\u5B89\u88C5\u524D\u8BF7\u786E\u8BA4\u6765\u6E90\u4E0E\u6743\u9650\u3002"
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
async function fetchAllPages() {
  const items = [];
  const seenRemote = /* @__PURE__ */ new Set();
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${LIST_URL}?query=&size=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`;
    const payload = asRecord(await getJson(url));
    const rawItems = Array.isArray(payload?.data) ? payload.data : [];
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
  const seen = /* @__PURE__ */ new Map();
  for (const item of items) {
    const count = seen.get(item.id) ?? 0;
    seen.set(item.id, count + 1);
    if (count) item.id = `${item.id}-${count + 1}`;
  }
  return items;
}
async function loadTraeCatalog() {
  if (listMemo && Date.now() - listMemo.at < CACHE_TTL_MS) return listMemo.payload;
  if (listInflight) return listInflight;
  listInflight = (async () => {
    const snapshot = await readListSnapshot();
    if (snapshot && Date.now() - Date.parse(snapshot.fetchedAt) < CACHE_TTL_MS) {
      const payload = {
        items: snapshot.items,
        fetchedAt: snapshot.fetchedAt,
        stale: false,
        source: MARKET_BASE
      };
      listMemo = { at: Date.now(), payload };
      return payload;
    }
    try {
      const items = await fetchAllPages();
      const payload = {
        items,
        fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
        stale: false,
        source: MARKET_BASE
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
          source: MARKET_BASE,
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
const readmeCache = /* @__PURE__ */ new Map();
function allowedReadme(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "api.trae.com.cn" && parsed.pathname.startsWith("/extensions/api/-/agent/direct-download");
  } catch {
    return false;
  }
}
async function fetchTraeReadme(id) {
  if (!/^[A-Za-z0-9_.:-]{1,200}$/.test(id)) throw new Error(`\u65E0\u6548\u7684 TraeWork \u6761\u76EE: ${id}`);
  const hit = readmeCache.get(id);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  const catalog = await loadTraeCatalog();
  const entry = catalog.items.find((item) => item.remoteId === id);
  if (!entry) throw new Error(`TraeWork \u5E02\u573A\u91CC\u6CA1\u6709\u8BE5\u6761\u76EE: ${id}`);
  const detail = asRecord(await getJson(
    `${MARKET_BASE}/extensions/api/-/agent/detail?id=${encodeURIComponent(id)}&mcpServerType=stdio`
  ));
  const readmeUrl = str(asRecord(detail?.data)?.readme) ?? str(detail?.readme);
  if (!readmeUrl || !allowedReadme(readmeUrl)) throw new Error("\u8BE5\u6761\u76EE\u6CA1\u6709\u53EF\u8BFB\u53D6\u7684 README");
  const fileId = new URL(readmeUrl).searchParams.get("fileID") ?? "";
  if (!fileId.trim()) throw new Error("\u8BE5\u6761\u76EE\u6CA1\u6709\u53EF\u8BFB\u53D6\u7684 README");
  const response = await fetch(readmeUrl, {
    headers: { accept: "text/plain, text/markdown;q=0.9, */*;q=0.1", "user-agent": USER_AGENT },
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`README \u4E0B\u8F7D\u5931\u8D25: HTTP ${response.status}`);
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
export {
  fetchTraeReadme,
  loadTraeCatalog,
  mapTraeItem
};
