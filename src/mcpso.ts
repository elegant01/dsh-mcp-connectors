// mcp.so 热门排行榜（方案 A：只浏览，不安装、不搜索）。
// mcp.so 的 robots.txt 明确 Disallow /search 与 /*?*q=，所以这里只抓
// https://mcp.so/zh/rankings/servers 这一个服务端渲染页面，解析 Top 100。
// 成功结果落盘缓存，网络失败时返回上次快照（stale=true）。

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { managerDir } from "./state.js";
import type { CatalogField, RankingEntry } from "./catalog-data.js";

const RANKINGS_URL = "https://mcp.so/zh/rankings/servers";
const CACHE_TTL_MS = 30 * 60_000;
const CACHE_FILE = () => join(managerDir(), "catalog-cache", "mcpso-rankings.json");

export interface RankingsPayload {
  items: RankingEntry[];
  fetchedAt: string;
  /** true = 网络失败，返回的是本地快照 */
  stale: boolean;
  source: string;
  error?: string;
}

function decodeEntities(input: string): string {
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

/** 解析 mcp.so 排行榜 SSR HTML（导出以便单测）。 */
export function parseRankingsHtml(html: string): RankingEntry[] {
  const out: RankingEntry[] = [];
  const seen = new Set<string>();
  const anchor = /<a\b[^>]*href="\/zh\/servers\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let match: RegExpExecArray | null;
  while ((match = anchor.exec(html))) {
    const slug = match[1];
    const inner = match[2];
    if (seen.has(slug)) continue;
    const rank = inner.match(/tabular-nums[^"]*"[^>]*>\s*(\d+)\s*</);
    const name = inner.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
    if (!rank || !name) continue; // 只收带排名的榜单条目
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
      author: author ? decodeEntities(author[1]) : undefined,
      description: description ? decodeEntities(description[1]) : undefined,
      url: `https://mcp.so/zh/servers/${slug}`,
      iconUrl: icon ? decodeEntities(icon[1]) : undefined,
      monthlySearches: monthly?.[1],
      stars: stars?.[1],
      score: score ? decodeEntities(score[1]) : undefined,
    });
    if (out.length >= 100) break;
  }
  return out;
}

// ---------- 详情页：解析 mcpServers 配置（方案 B：可详情、可安装） ----------

export interface RankingDetail {
  id: string;
  url: string;
  title?: string;
  description?: string;
  repository?: string;
  installable: boolean;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  serverUrl?: string;
  headers?: Record<string, string>;
  fields: CatalogField[];
  extra?: Record<string, unknown>;
  warning?: string;
  error?: string;
  stale?: boolean;
}

/** 解码 HTML 实体，但不压缩空白、不剥标签以外的内容（用于解析 JSON 配置块）。 */
function decodeHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)));
}

function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function looksLikePlaceholder(value: string): boolean {
  const text = value.trim();
  return /^YOUR[_-]?[A-Z0-9_-]*$/i.test(text)
    || /^<[^>]+>$/.test(text)
    || /^x{3,}$/i.test(text)
    || /^(changeme|replace[-_ ]?me|your[-_ ]?(api[-_ ]?)?(key|token))$/i.test(text);
}

/** 把 ${VAR} / YOUR_TOKEN 之类的凭据转成 {{field}}，并生成安装表单字段。 */
function templatize(
  input: Record<string, string> | undefined,
  fields: CatalogField[],
  kind: "env" | "header",
): Record<string, string> | undefined {
  if (!input) return undefined;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(input)) {
    const value = String(raw ?? "");
    const placeholders = [...value.matchAll(/\$\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]);
    let text = value.replace(/\$\{([A-Za-z0-9_]+)\}/g, (_, name: string) => `{{${name}}}`);
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
      // 值里内嵌的占位符（例如 "Bearer YOUR_TOKEN"）只替换占位部分
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
  return Object.keys(out).length ? out : undefined;
}

function templatizeArgs(args: string[] | undefined, fields: CatalogField[]): string[] | undefined {
  if (!args?.length) return undefined;
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = String(args[i]);
    const placeholders = [...arg.matchAll(/\$\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]);
    if (placeholders.length) {
      out.push(arg.replace(/\$\{([A-Za-z0-9_]+)\}/g, (_, name: string) => `{{${name}}}`));
      for (const name of placeholders) {
        if (!fields.some((field) => field.key === name)) {
          fields.push({ key: name, label: name, required: true, secret: true });
        }
      }
      continue;
    }
    if (looksLikePlaceholder(arg)) {
      const previous = args[i - 1];
      const base = previous && /^--?[A-Za-z0-9_-]+$/.test(previous)
        ? previous.replace(/^--?/, "")
        : `ARG_${i + 1}`;
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

/** 解析 mcp.so 服务器详情页（导出以便单测）。 */
export function parseRankingDetail(html: string, slug: string): RankingDetail {
  const pageUrl = `https://mcp.so/zh/servers/${slug}`;
  let title: string | undefined;
  let description: string | undefined;

  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(match[1]) as Record<string, unknown>;
      if (data["@type"] === "SoftwareApplication") {
        title = typeof data.name === "string" ? data.name : title;
        description = typeof data.description === "string" ? data.description : description;
        break;
      }
    } catch { /* 忽略坏 JSON-LD */ }
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
    /^https:\/\/github\.com\/[^/]+\/?$/i,
  ];
  const repository = [...html.matchAll(/https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?/g)]
    .map((match) => match[0].replace(/\.git$/i, ""))
    .find((url) => !noise.some((pattern) => pattern.test(url)));

  let config: Record<string, unknown> | null = null;
  const block = [...html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/g)]
    .map((match) => match[1])
    .find((text) => text.includes("mcpServers"));
  if (block) {
    try {
      const parsed = JSON.parse(decodeHtml(block)) as Record<string, unknown>;
      const servers = parsed.mcpServers;
      if (servers && typeof servers === "object" && !Array.isArray(servers)) {
        const first = Object.values(servers as Record<string, unknown>)
          .find((value) => value && typeof value === "object" && !Array.isArray(value));
        if (first) config = first as Record<string, unknown>;
      }
    } catch { /* 结构变了就退化为只读详情 */ }
  }

  const fields: CatalogField[] = [];
  const command = config && typeof config.command === "string" ? config.command : undefined;
  const args = config && Array.isArray(config.args) ? templatizeArgs(config.args.map(String), fields) : undefined;
  const env = config && config.env && typeof config.env === "object" && !Array.isArray(config.env)
    ? templatize(Object.fromEntries(Object.entries(config.env as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")])), fields, "env")
    : undefined;
  const headers = config && config.headers && typeof config.headers === "object" && !Array.isArray(config.headers)
    ? templatize(Object.fromEntries(Object.entries(config.headers as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")])), fields, "header")
    : undefined;
  const serverUrl = config && typeof config.url === "string"
    ? config.url
    : config && typeof config.serverUrl === "string" ? config.serverUrl : undefined;

  const extra: Record<string, unknown> = {};
  if (config) {
    for (const key of ["type", "timeout"]) {
      if (config[key] !== undefined) extra[key] = config[key];
    }
  }

  const installable = Boolean(command || serverUrl);
  const warning = fields.length
    ? "该条目安装时需要凭据；如果详情页还有 OAuth / 额外步骤，请同时参考 mcp.so 页面。"
    : undefined;

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
    extra: Object.keys(extra).length ? extra : undefined,
    warning,
    error: installable ? undefined : "详情页没有找到可用的 mcpServers 安装配置",
  };
}

interface DetailCacheFile {
  fetchedAt: string;
  detail: RankingDetail;
}

const detailMemo = new Map<string, { at: number; detail: RankingDetail }>();
const DETAIL_TTL_MS = 30 * 60_000;

function detailCachePath(slug: string): string {
  return join(managerDir(), "catalog-cache", "mcpso-details", `${slug}.json`);
}

/** 按需抓取 mcp.so 详情页；30 分钟缓存，失败时回退到本地快照。 */
export async function fetchRankingDetail(slug: string): Promise<RankingDetail> {
  if (!/^[A-Za-z0-9_.-]{1,120}$/.test(slug)) {
    throw new Error(`无效的 mcp.so 条目: ${slug}`);
  }
  const key = detailCachePath(slug);
  const memo = detailMemo.get(key);
  if (memo && Date.now() - memo.at < DETAIL_TTL_MS) return memo.detail;

  let cached: DetailCacheFile | null = null;
  try {
    cached = JSON.parse(await readFile(key, "utf8")) as DetailCacheFile;
  } catch { /* 没有缓存 */ }
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < DETAIL_TTL_MS) {
    detailMemo.set(key, { at: Date.now(), detail: cached.detail });
    return cached.detail;
  }

  try {
    const response = await fetch(`https://mcp.so/zh/servers/${encodeURIComponent(slug)}`, {
      headers: { accept: "text/html", "user-agent": "dsh-mcp-connectors" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const detail = parseRankingDetail(await response.text(), slug);
    detailMemo.set(key, { at: Date.now(), detail });
    try {
      await mkdir(dirname(key), { recursive: true });
      await writeFile(key, `${JSON.stringify({ fetchedAt: new Date().toISOString(), detail }, null, 2)}\n`, "utf8");
    } catch { /* 缓存写失败不影响本次返回 */ }
    return detail;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    if (cached) return { ...cached.detail, stale: true, error: message };
    throw new Error(`无法访问 mcp.so 详情页（${message}）`);
  }
}

interface CacheFile {
  fetchedAt: string;
  items: RankingEntry[];
  source: string;
}

async function readCache(): Promise<CacheFile | null> {
  try {
    const parsed = JSON.parse(await readFile(CACHE_FILE(), "utf8")) as CacheFile;
    if (!Array.isArray(parsed.items) || !parsed.items.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(items: RankingEntry[], fetchedAt: string): Promise<void> {
  try {
    const file = CACHE_FILE();
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify({ fetchedAt, items, source: RANKINGS_URL }, null, 2)}\n`, "utf8");
  } catch { /* 缓存写失败不影响本次返回 */ }
}

let memo: { at: number; key: string; payload: RankingsPayload } | null = null;

/** 拉取 mcp.so Top 100；30 分钟缓存，失败时回退到上次成功快照。 */
export async function fetchRankings(): Promise<RankingsPayload> {
  const cacheKey = CACHE_FILE();
  if (memo && memo.key === cacheKey && Date.now() - memo.at < CACHE_TTL_MS) return memo.payload;

  const cached = await readCache();
  if (cached && Date.now() - Date.parse(cached.fetchedAt) < CACHE_TTL_MS) {
    const payload: RankingsPayload = { items: cached.items, fetchedAt: cached.fetchedAt, stale: false, source: RANKINGS_URL };
    memo = { at: Date.now(), key: cacheKey, payload };
    return payload;
  }

  try {
    const response = await fetch(RANKINGS_URL, {
      headers: { accept: "text/html", "user-agent": "dsh-mcp-connectors" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const items = parseRankingsHtml(await response.text());
    if (!items.length) throw new Error("页面结构变化，未解析到榜单条目");
    const fetchedAt = new Date().toISOString();
    await writeCache(items, fetchedAt);
    const payload: RankingsPayload = { items, fetchedAt, stale: false, source: RANKINGS_URL };
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
        error: message,
      };
    }
    throw new Error(`无法访问 mcp.so 排行榜（${message}）`);
  }
}
