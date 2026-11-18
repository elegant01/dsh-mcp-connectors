import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { managerDir } from "./state.js";
const RANKINGS_URL = "https://mcp.so/zh/rankings/servers";
const CACHE_TTL_MS = 30 * 6e4;
const CACHE_FILE = () => join(managerDir(), "catalog-cache", "mcpso-rankings.json");
function decodeEntities(input) {
  return input.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))).replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16))).replace(/\s+/g, " ").trim();
}
function parseRankingsHtml(html) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const anchor = /<a\b[^>]*href="\/zh\/servers\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let match;
  while (match = anchor.exec(html)) {
    const slug = match[1];
    const inner = match[2];
    if (seen.has(slug)) continue;
    const rank = inner.match(/tabular-nums[^"]*"[^>]*>\s*(\d+)\s*</);
    const name = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
    if (!rank || !name) continue;
    seen.add(slug);
    const afterName = inner.slice(inner.indexOf("</h3>") + 5);
    const author = afterName.match(/<span class="text-muted-foreground[^"]*"[^>]*>([\s\S]*?)<\/span>/);
    const description = inner.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    const icon = inner.match(/<img[^>]+src="([^"]+)"/);
    const monthly = inner.match(/月搜\s*([\d.]+[KM]?)/);
    const stars = inner.match(/lucide-star[\s\S]*?<\/svg>\s*([\d.]+[KM]?)/);
    const score = inner.match(/>([\d.]+)<\/div>\s*$/);
    out.push({
      rank: Number(rank[1]),
      id: slug,
      title: decodeEntities(name[1]),
      author: author ? decodeEntities(author[1]) : void 0,
      description: description ? decodeEntities(description[1]) : void 0,
      url: `https://mcp.so/zh/servers/${slug}`,
      iconUrl: icon ? decodeEntities(icon[1]) : void 0,
      monthlySearches: monthly?.[1],
      stars: stars?.[1],
      score: score ? decodeEntities(score[1]) : void 0
    });
    if (out.length >= 100) break;
  }
  return out;
}
function decodeHtml(text) {
  return text.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))).replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}
function stripTags(text) {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function looksLikePlaceholder(value) {
  const text = value.trim();
  return /^YOUR[_-]?[A-Z0-9_-]*$/i.test(text) || /^<[^>]+>$/.test(text) || /^x{3,}$/i.test(text) || /^(changeme|replace[-_ ]?me|your[-_ ]?(api[-_ ]?)?(key|token))$/i.test(text);
}
function templatize(input, fields, kind) {
  if (!input) return void 0;
  const out = {};
  for (const [key, raw] of Object.entries(input)) {
    const value = String(raw ?? "");
    const placeholders = [...value.matchAll(/\$\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]);
    let text = value.replace(/\$\{([A-Za-z0-9_]+)\}/g, (_, name) => `{{${name}}}`);
    for (const name of placeholders) {
      if (!fields.some((field) => field.key === name)) {
        fields.push({ key: name, label: name, required: true, secret: true });
      }
    }
    const fieldKey = key.replace(/[^\w-]/g, "_").toUpperCase();
    if (looksLikePlaceholder(value)) {
      text = `{{${fieldKey}}}`;
      if (!fields.some((field) => field.key === fieldKey)) {
        fields.push({ key: fieldKey, label: key, required: true, secret: true });
      }
    } else {
      const embedded = /YOUR[_-]?[A-Z0-9_-]*|<[^>]+>/gi;
      if (embedded.test(value)) {
        text = value.replace(embedded, `{{${fieldKey}}}`);
        if (!fields.some((field) => field.key === fieldKey)) {
          fields.push({ key: fieldKey, label: key, required: true, secret: true });
        }
      }
    }
    out[key] = text;
  }
  return Object.keys(out).length ? out : void 0;
}
function templatizeArgs(args, fields) {
  if (!args?.length) return void 0;
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const arg = String(args[i]);
    const placeholders = [...arg.matchAll(/\$\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]);
    if (placeholders.length) {
      out.push(arg.replace(/\$\{([A-Za-z0-9_]+)\}/g, (_, name) => `{{${name}}}`));
      for (const name of placeholders) {
        if (!fields.some((field) => field.key === name)) {
          fields.push({ key: name, label: name, required: true, secret: true });
        }
      }
      continue;
    }
    if (looksLikePlaceholder(arg)) {
      const previous = args[i - 1];
      const base = previous && /^--?[A-Za-z0-9_-]+$/.test(previous) ? previous.replace(/^--?/, "") : `ARG_${i + 1}`;
      const key = base.replace(/[^\w-]/g, "_").toUpperCase();
      out.push(`{{${key}}}`);
      if (!fields.some((field) => field.key === key)) {
        fields.push({ key, label: base, required: true, secret: true });
      }
      continue;
    }
    out.push(arg);
  }
  return out;
}
function parseRankingDetail(html, slug) {
  const pageUrl = `https://mcp.so/zh/servers/${slug}`;
  let title;
  let description;
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(match[1]);
      if (data["@type"] === "SoftwareApplication") {
        title = typeof data.name === "string" ? data.name : title;
        description = typeof data.description === "string" ? data.description : description;
        break;
      }
    } catch {
    }
  }
  if (!title) {
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    if (h1) title = stripTags(h1[1]).replace(/\s*(已精选|Featured)\s*$/i, "");
  }
  if (!description) {
    const meta = html.match(/<meta name="description" content="([^"]*)"/);
    if (meta) description = decodeHtml(meta[1]);
  }
  const noise = [
    /^https:\/\/github\.com\/chatmcp\/mcp-directory/i,
    /\/settings\//i,
    /\/user-attachments/i,
    /^https:\/\/github\.com\/[^/]+\/?$/i
  ];
  const repository = [...html.matchAll(/https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?/g)].map((match) => match[0].replace(/\.git$/i, "")).find((url) => !noise.some((pattern) => pattern.test(url)));
  let config = null;
  const block = [...html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/g)].map((match) => match[1]).find((text) => text.includes("mcpServers"));
  if (block) {
    try {
      const parsed = JSON.parse(decodeHtml(block));
      const servers = parsed.mcpServers;
      if (servers && typeof servers === "object" && !Array.isArray(servers)) {
        const first = Object.values(servers).find((value) => value && typeof value === "object" && !Array.isArray(value));
        if (first) config = first;
      }
    } catch {
    }
  }
  const fields = [];
  const command = config && typeof config.command === "string" ? config.command : void 0;
  const args = config && Array.isArray(config.args) ? templatizeArgs(config.args.map(String), fields) : void 0;
  const env = config && config.env && typeof config.env === "object" && !Array.isArray(config.env) ? templatize(Object.fromEntries(Object.entries(config.env).map(([k, v]) => [k, String(v ?? "")])), fields, "env") : void 0;
  const headers = config && config.headers && typeof config.headers === "object" && !Array.isArray(config.headers) ? templatize(Object.fromEntries(Object.entries(config.headers).map(([k, v]) => [k, String(v ?? "")])), fields, "header") : void 0;
  const serverUrl = config && typeof config.url === "string" ? config.url : config && typeof config.serverUrl === "string" ? config.serverUrl : void 0;
  const extra = {};
  if (config) {
    for (const key of ["type", "timeout"]) {
      if (config[key] !== void 0) extra[key] = config[key];
    }
  }
  const installable = Boolean(command || serverUrl);
  const warning = fields.length ? "\u8BE5\u6761\u76EE\u5B89\u88C5\u65F6\u9700\u8981\u51ED\u636E\uFF1B\u5982\u679C\u8BE6\u60C5\u9875\u8FD8\u6709 OAuth / \u989D\u5916\u6B65\u9AA4\uFF0C\u8BF7\u540C\u65F6\u53C2\u8003 mcp.so \u9875\u9762\u3002" : void 0;
  return {
    id: slug,
    url: pageUrl,
    title,
    description,
    repository,
    installable,
    command,
    args,
    env,
    serverUrl,
    headers,
    fields,
    extra: Object.keys(extra).length ? extra : void 0,
    warning,
    error: installable ? void 0 : "\u8BE6\u60C5\u9875\u6CA1\u6709\u627E\u5230\u53EF\u7528\u7684 mcpServers \u5B89\u88C5\u914D\u7F6E"
  };
}
const detailMemo = /* @__PURE__ */ new Map();
const DETAIL_TTL_MS = 30 * 6e4;
function detailCachePath(slug) {
  return join(managerDir(), "catalog-cache", "mcpso-details", `${slug}.json`);
}
async function fetchRankingDetail(slug) {
  if (!/^[A-Za-z0-9_.-]{1,120}$/.test(slug)) {
    throw new Error(`\u65E0\u6548\u7684 mcp.so \u6761\u76EE: ${slug}`);
  }
  const key = detailCachePath(slug);
  const memo2 = detailMemo.get(key);
  if (memo2 && Date.now() - memo2.at < DETAIL_TTL_MS) return memo2.detail;
  let cached = null;
  try {
    cached = JSON.parse(await readFile(key, "utf8"));
  } catch {
  }
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < DETAIL_TTL_MS) {
    detailMemo.set(key, { at: Date.now(), detail: cached.detail });
    return cached.detail;
  }
  try {
    const response = await fetch(`https://mcp.so/zh/servers/${encodeURIComponent(slug)}`, {
      headers: { accept: "text/html", "user-agent": "dsh-mcp-connectors" },
      redirect: "follow",
      signal: AbortSignal.timeout(15e3)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const detail = parseRankingDetail(await response.text(), slug);
    detailMemo.set(key, { at: Date.now(), detail });
    try {
      await mkdir(dirname(key), { recursive: true });
      await writeFile(key, `${JSON.stringify({ fetchedAt: (/* @__PURE__ */ new Date()).toISOString(), detail }, null, 2)}
`, "utf8");
    } catch {
    }
    return detail;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    if (cached) return { ...cached.detail, stale: true, error: message };
    throw new Error(`\u65E0\u6CD5\u8BBF\u95EE mcp.so \u8BE6\u60C5\u9875\uFF08${message}\uFF09`);
  }
}
async function readCache() {
  try {
    const parsed = JSON.parse(await readFile(CACHE_FILE(), "utf8"));
    if (!Array.isArray(parsed.items) || !parsed.items.length) return null;
    return parsed;
  } catch {
    return null;
  }
}
async function writeCache(items, fetchedAt) {
  try {
    const file = CACHE_FILE();
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify({ fetchedAt, items, source: RANKINGS_URL }, null, 2)}
`, "utf8");
  } catch {
  }
}
let memo = null;
async function fetchRankings() {
  const cacheKey = CACHE_FILE();
  if (memo && memo.key === cacheKey && Date.now() - memo.at < CACHE_TTL_MS) return memo.payload;
  const cached = await readCache();
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < CACHE_TTL_MS) {
    const payload = { items: cached.items, fetchedAt: cached.fetchedAt, stale: false, source: RANKINGS_URL };
    memo = { at: Date.now(), key: cacheKey, payload };
    return payload;
  }
  try {
    const response = await fetch(RANKINGS_URL, {
      headers: { accept: "text/html", "user-agent": "dsh-mcp-connectors" },
      redirect: "follow",
      signal: AbortSignal.timeout(15e3)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const items = parseRankingsHtml(await response.text());
    if (!items.length) throw new Error("\u9875\u9762\u7ED3\u6784\u53D8\u5316\uFF0C\u672A\u89E3\u6790\u5230\u699C\u5355\u6761\u76EE");
    const fetchedAt = (/* @__PURE__ */ new Date()).toISOString();
    await writeCache(items, fetchedAt);
    const payload = { items, fetchedAt, stale: false, source: RANKINGS_URL };
    memo = { at: Date.now(), key: cacheKey, payload };
    return payload;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    if (cached) {
      return {
        items: cached.items,
        fetchedAt: cached.fetchedAt,
        stale: true,
        source: RANKINGS_URL,
        error: message
      };
    }
    throw new Error(`\u65E0\u6CD5\u8BBF\u95EE mcp.so \u6392\u884C\u699C\uFF08${message}\uFF09`);
  }
}
export {
  fetchRankingDetail,
  fetchRankings,
  parseRankingDetail,
  parseRankingsHtml
};
