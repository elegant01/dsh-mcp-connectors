// WorkBuddy 官方连接器市场：读取本机缓存，映射成连接器目录。
// 数据位置（WorkBuddy 客户端自己维护）：
//   ~/.workbuddy/connectors-marketplace/.codebuddy-connector/connectors.json   索引
//   ~/.workbuddy/connectors-marketplace/connectors/<id>/mcp.json              MCP 配置
//   ~/.workbuddy/connectors-marketplace/connectors/<id>/token-schema.json     凭据字段
//   ~/.workbuddy/connectors-marketplace/connectors/<id>/cli.json              CLI 型连接器
// 没装 WorkBuddy 时目录不存在 → available=false，面板不显示这个来源。

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CatalogEntry } from "./catalog-data.js";

const CACHE_TTL_MS = 60_000;
const INSTALL_TARGET = "workbuddy-connectors";

export interface WorkBuddyStatus {
  available: boolean;
  count: number;
  installable: number;
}

export interface WorkBuddyCatalog extends WorkBuddyStatus {
  items: CatalogEntry[];
  fetchedAt: string;
}

function marketplaceRoot(): string {
  return join(homedir(), ".workbuddy", "connectors-marketplace");
}

function indexPath(): string {
  return join(marketplaceRoot(), ".codebuddy-connector", "connectors.json");
}

function connectorDir(id: string): string {
  return join(marketplaceRoot(), "connectors", id);
}

function iconsDir(): string {
  return join(marketplaceRoot(), "icons");
}

const ICON_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** 读取 WorkBuddy 市场里某个连接器的图标（本地文件，不联网）。 */
export async function findWorkBuddyIcon(id: string): Promise<{ data: Buffer; contentType: string } | null> {
  if (!/^[A-Za-z0-9_.-]{1,120}$/.test(id)) return null;
  for (const ext of Object.keys(ICON_TYPES)) {
    try {
      const data = await readFile(join(iconsDir(), `${id}${ext}`));
      return { data, contentType: ICON_TYPES[ext] };
    } catch { /* 尝试下一个扩展名 */ }
  }
  return null;
}

function iconPathFor(id: string): string {
  return `/api/dsh-mcp-connectors/catalog/workbuddy/icon?name=${encodeURIComponent(id)}`;
}

async function readJson(file: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8").catch(() => ""));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
  return out.length ? out : undefined;
}

function placeholdersIn(text: string): string[] {
  return [...text.matchAll(/\$\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]);
}

interface SchemaField {
  key: string;
  label: string;
  labelEn?: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
  secret?: boolean;
}

function fieldsFromSchema(schema: Record<string, unknown> | null): {
  fields: SchemaField[];
  docUrl?: string;
  docLabel?: string;
  docLabelEn?: string;
  title?: string;
  titleEn?: string;
  description?: string;
  descriptionZh?: string;
} {
  const out: SchemaField[] = [];
  const list = Array.isArray(schema?.fields) ? schema!.fields : [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const field = raw as Record<string, unknown>;
    const key = str(field.key);
    if (!key) continue;
    out.push({
      key,
      label: str(field.label) ?? key,
      labelEn: str(field.label_en),
      placeholder: str(field.placeholder),
      description: str(field.description),
      required: field.required === true,
      secret: field.type === "password" || field.secret === true,
    });
  }
  return {
    fields: out,
    docUrl: str(schema?.docUrl),
    docLabel: str(schema?.docLabel),
    docLabelEn: str(schema?.docLabel_en),
    title: str(schema?.title),
    titleEn: str(schema?.title_en),
    description: str(schema?.description),
    descriptionZh: str(schema?.description_zh) ?? str(schema?.description),
  };
}

/**
 * WorkBuddy 的 mcp.json 里凭据保持 `${VAR}` 占位符，真实值由 WorkBuddy 自己的
 * key store 在运行时注入。插件不做替换、不落明文，只把用到的变量名收集出来提示用户。
 */
function collectPlaceholders(input: unknown, needed: Set<string>): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) return;
  for (const value of Object.values(input as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    for (const name of placeholdersIn(value)) needed.add(name);
  }
}

function keepMap(input: unknown): Record<string, string> | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    out[key] = typeof value === "string" ? value : String(value ?? "");
  }
  return Object.keys(out).length ? out : undefined;
}

function mapMcpConnector(
  connector: Record<string, unknown>,
  serverKey: string,
  server: Record<string, unknown>,
  schema: ReturnType<typeof fieldsFromSchema>,
  multiple: boolean,
): CatalogEntry {
  // WorkBuddy 已安装条目的命名约定是 connector:<连接器 id>（不是 mcpServers 里的 server key）。
  // 一个连接器挂多台服务器时（目前仅 1 个），用 :<serverKey> 区分。
  const connectorId = str(connector.source) ?? str(connector.id) ?? serverKey;
  const id = multiple ? `connector:${connectorId}:${serverKey}` : `connector:${connectorId}`;
  const baseTitle = str(connector.name) ?? connectorId;
  const baseTitleEn = str(connector.name_en);
  const needed = new Set<string>();
  const headers: Record<string, string> = {};
  for (const source of [server.headers, server.staticHeaders]) {
    collectPlaceholders(source, needed);
    const mapped = keepMap(source);
    if (mapped) Object.assign(headers, mapped);
  }
  const env = keepMap(server.env);
  collectPlaceholders(server.env, needed);
  const args = Array.isArray(server.args) ? server.args.map(String) : undefined;
  for (const arg of args ?? []) for (const name of placeholdersIn(arg)) needed.add(name);
  for (const field of schema.fields) needed.add(field.key);

  const extra: Record<string, unknown> = {};
  for (const key of ["type", "timeout", "disabledTools", "runtime", "npmRegistry"]) {
    if (server[key] !== undefined) extra[key] = server[key];
  }

  const credentialNames = [...needed].filter(Boolean).sort();
  const warning = credentialNames.length
    ? `安装后需要在 WorkBuddy 内填写凭据：${credentialNames.join("、")}。凭据由 WorkBuddy 保管，不会写入配置文件。`
    : undefined;

  return {
    id,
    title: multiple ? `${baseTitle} · ${serverKey}` : baseTitle,
    titleEn: multiple && baseTitleEn ? `${baseTitleEn} · ${serverKey}` : baseTitleEn,
    description: str(connector.description_en) ?? str(connector.description) ?? "",
    descriptionZh: str(connector.description_zh) ?? str(connector.description),
    source: "workbuddy",
    transport: server.url ? "http" : "stdio",
    command: str(server.command),
    args: args?.length ? args : undefined,
    env,
    url: str(server.url),
    headers: Object.keys(headers).length ? headers : undefined,
    extra: Object.keys(extra).length ? extra : undefined,
    // 凭据不在插件里收集：WorkBuddy 用 ${VAR} 占位符 + 自己的 key store
    fields: [],
    installable: true,
    installTarget: INSTALL_TARGET,
    examples: stringArray(connector.examples_zh)?.slice(0, 3) ?? stringArray(connector.examples)?.slice(0, 3),
    examplesEn: stringArray(connector.examples_en)?.slice(0, 3),
    docUrl: schema.docUrl,
    docLabel: schema.docLabel,
    docLabelEn: schema.docLabelEn,
    warning,
    tags: ["mcp"],
    iconUrl: iconPathFor(connectorId),
  };
}

function mapCliConnector(connector: Record<string, unknown>): CatalogEntry {
  const connectorId = str(connector.source) ?? str(connector.id) ?? "connector";
  return {
    id: `cli:${connectorId}`,
    title: str(connector.name) ?? str(connector.id) ?? "WorkBuddy CLI",
    titleEn: str(connector.name_en),
    description: str(connector.description_en) ?? str(connector.description) ?? "",
    descriptionZh: str(connector.description_zh) ?? str(connector.description),
    source: "workbuddy",
    transport: "stdio",
    fields: [],
    installable: false,
    examples: stringArray(connector.examples_zh)?.slice(0, 3) ?? stringArray(connector.examples)?.slice(0, 3),
    examplesEn: stringArray(connector.examples_en)?.slice(0, 3),
    warning: "这是 WorkBuddy 的 CLI 型连接器，需要 WorkBuddy 客户端完成安装与登录，不能作为 MCP 服务器写入其它 Agent。",
    tags: ["cli"],
    iconUrl: iconPathFor(connectorId),
  };
}

let memo: { at: number; home: string; catalog: WorkBuddyCatalog } | null = null;

/** 读取本机 WorkBuddy 连接器市场；没装 WorkBuddy 时 available=false。 */
export async function loadWorkBuddyCatalog(): Promise<WorkBuddyCatalog> {
  const currentHome = homedir();
  if (memo && memo.home === currentHome && Date.now() - memo.at < CACHE_TTL_MS) return memo.catalog;

  const index = await readJson(indexPath());
  const connectors = Array.isArray(index?.connectors) ? index!.connectors as unknown[] : null;
  const fetchedAt = new Date().toISOString();
  if (!connectors) {
    const empty: WorkBuddyCatalog = { available: false, count: 0, installable: 0, items: [], fetchedAt };
    memo = { at: Date.now(), home: currentHome, catalog: empty };
    return empty;
  }

  const items: CatalogEntry[] = [];
  const CONCURRENCY = 32;
  for (let i = 0; i < connectors.length; i += CONCURRENCY) {
    const batch = connectors.slice(i, i + CONCURRENCY).map(async (raw) => {
      if (!raw || typeof raw !== "object") return null;
      const connector = raw as Record<string, unknown>;
      const dirId = str(connector.source) ?? str(connector.id);
      if (!dirId) return null;
      const dir = connectorDir(dirId);
      const mcp = await readJson(join(dir, "mcp.json"));
      const cli = mcp ? null : await readJson(join(dir, "cli.json"));
      if (!mcp && !cli) return null;
      if (!mcp) return mapCliConnector(connector);
      const schema = fieldsFromSchema(await readJson(join(dir, "token-schema.json")));
      const servers = mcp.mcpServers && typeof mcp.mcpServers === "object" && !Array.isArray(mcp.mcpServers)
        ? Object.entries(mcp.mcpServers as Record<string, unknown>)
        : [];
      const valid = servers.filter(([, server]) => server && typeof server === "object" && !Array.isArray(server));
      if (!valid.length) return mapCliConnector(connector);
      const multiple = valid.length > 1;
      return valid.map(([serverKey, server]) =>
        mapMcpConnector(connector, serverKey, server as Record<string, unknown>, schema, multiple));
    });
    for (const result of await Promise.all(batch)) {
      if (Array.isArray(result)) items.push(...result);
      else if (result) items.push(result);
    }
  }

  // 保持 connectors.json 的原始顺序（WorkBuddy 自己的展示顺序），不再按名称重排

  const catalog: WorkBuddyCatalog = {
    available: true,
    count: items.length,
    installable: items.filter((item) => item.installable !== false).length,
    items,
    fetchedAt,
  };
  memo = { at: Date.now(), home: currentHome, catalog };
  return catalog;
}

/** 轻量状态：面板据此决定是否显示 WorkBuddy 来源。 */
export async function workbuddyStatus(): Promise<WorkBuddyStatus> {
  const catalog = await loadWorkBuddyCatalog();
  return { available: catalog.available, count: catalog.count, installable: catalog.installable };
}
