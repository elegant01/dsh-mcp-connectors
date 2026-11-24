import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
const CACHE_TTL_MS = 6e4;
const INSTALL_TARGET = "workbuddy-connectors";
function marketplaceRoot() {
  return join(homedir(), ".workbuddy", "connectors-marketplace");
}
function indexPath() {
  return join(marketplaceRoot(), ".codebuddy-connector", "connectors.json");
}
function connectorDir(id) {
  return join(marketplaceRoot(), "connectors", id);
}
function iconsDir() {
  return join(marketplaceRoot(), "icons");
}
const ICON_TYPES = {
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif"
};
async function findWorkBuddyIcon(id) {
  if (!/^[A-Za-z0-9_.-]{1,120}$/.test(id)) return null;
  for (const ext of Object.keys(ICON_TYPES)) {
    try {
      const data = await readFile(join(iconsDir(), `${id}${ext}`));
      return { data, contentType: ICON_TYPES[ext] };
    } catch {
    }
  }
  return null;
}
function iconPathFor(id) {
  return `/api/dsh-mcp-connectors/catalog/workbuddy/icon?name=${encodeURIComponent(id)}`;
}
async function readJson(file) {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8").catch(() => ""));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function str(value) {
  return typeof value === "string" && value.trim() ? value : void 0;
}
function stringArray(value) {
  if (!Array.isArray(value)) return void 0;
  const out = value.filter((item) => typeof item === "string" && Boolean(item.trim()));
  return out.length ? out : void 0;
}
function placeholdersIn(text) {
  return [...text.matchAll(/\$\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]);
}
function fieldsFromSchema(schema) {
  const out = [];
  const list = Array.isArray(schema?.fields) ? schema.fields : [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const field = raw;
    const key = str(field.key);
    if (!key) continue;
    out.push({
      key,
      label: str(field.label) ?? key,
      labelEn: str(field.label_en),
      placeholder: str(field.placeholder),
      description: str(field.description),
      required: field.required === true,
      secret: field.type === "password" || field.secret === true
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
    descriptionZh: str(schema?.description_zh) ?? str(schema?.description)
  };
}
function collectPlaceholders(input, needed) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return;
  for (const value of Object.values(input)) {
    if (typeof value !== "string") continue;
    for (const name of placeholdersIn(value)) needed.add(name);
  }
}
function keepMap(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return void 0;
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    out[key] = typeof value === "string" ? value : String(value ?? "");
  }
  return Object.keys(out).length ? out : void 0;
}
function mapMcpConnector(connector, serverKey, server, schema, multiple) {
  const connectorId = str(connector.source) ?? str(connector.id) ?? serverKey;
  const id = multiple ? `connector:${connectorId}:${serverKey}` : `connector:${connectorId}`;
  const baseTitle = str(connector.name) ?? connectorId;
  const baseTitleEn = str(connector.name_en);
  const needed = /* @__PURE__ */ new Set();
  const headers = {};
  for (const source of [server.headers, server.staticHeaders]) {
    collectPlaceholders(source, needed);
    const mapped = keepMap(source);
    if (mapped) Object.assign(headers, mapped);
  }
  const env = keepMap(server.env);
  collectPlaceholders(server.env, needed);
  const args = Array.isArray(server.args) ? server.args.map(String) : void 0;
  for (const arg of args ?? []) for (const name of placeholdersIn(arg)) needed.add(name);
  for (const field of schema.fields) needed.add(field.key);
  const extra = {};
  for (const key of ["type", "timeout", "disabledTools", "runtime", "npmRegistry"]) {
    if (server[key] !== void 0) extra[key] = server[key];
  }
  const credentialNames = [...needed].filter(Boolean).sort();
  const warning = credentialNames.length ? `\u5B89\u88C5\u540E\u9700\u8981\u5728 WorkBuddy \u5185\u586B\u5199\u51ED\u636E\uFF1A${credentialNames.join("\u3001")}\u3002\u51ED\u636E\u7531 WorkBuddy \u4FDD\u7BA1\uFF0C\u4E0D\u4F1A\u5199\u5165\u914D\u7F6E\u6587\u4EF6\u3002` : void 0;
  return {
    id,
    title: multiple ? `${baseTitle} \xB7 ${serverKey}` : baseTitle,
    titleEn: multiple && baseTitleEn ? `${baseTitleEn} \xB7 ${serverKey}` : baseTitleEn,
    description: str(connector.description_en) ?? str(connector.description) ?? "",
    descriptionZh: str(connector.description_zh) ?? str(connector.description),
    source: "workbuddy",
    transport: server.url ? "http" : "stdio",
    command: str(server.command),
    args: args?.length ? args : void 0,
    env,
    url: str(server.url),
    headers: Object.keys(headers).length ? headers : void 0,
    extra: Object.keys(extra).length ? extra : void 0,
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
    iconUrl: iconPathFor(connectorId)
  };
}
function mapCliConnector(connector) {
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
    warning: "\u8FD9\u662F WorkBuddy \u7684 CLI \u578B\u8FDE\u63A5\u5668\uFF0C\u9700\u8981 WorkBuddy \u5BA2\u6237\u7AEF\u5B8C\u6210\u5B89\u88C5\u4E0E\u767B\u5F55\uFF0C\u4E0D\u80FD\u4F5C\u4E3A MCP \u670D\u52A1\u5668\u5199\u5165\u5176\u5B83 Agent\u3002",
    tags: ["cli"],
    iconUrl: iconPathFor(connectorId)
  };
}
let memo = null;
async function loadWorkBuddyCatalog() {
  const currentHome = homedir();
  if (memo && memo.home === currentHome && Date.now() - memo.at < CACHE_TTL_MS) return memo.catalog;
  const index = await readJson(indexPath());
  const connectors = Array.isArray(index?.connectors) ? index.connectors : null;
  const fetchedAt = (/* @__PURE__ */ new Date()).toISOString();
  if (!connectors) {
    const empty = { available: false, count: 0, installable: 0, items: [], fetchedAt };
    memo = { at: Date.now(), home: currentHome, catalog: empty };
    return empty;
  }
  const items = [];
  const CONCURRENCY = 32;
  for (let i = 0; i < connectors.length; i += CONCURRENCY) {
    const batch = connectors.slice(i, i + CONCURRENCY).map(async (raw) => {
      if (!raw || typeof raw !== "object") return null;
      const connector = raw;
      const dirId = str(connector.source) ?? str(connector.id);
      if (!dirId) return null;
      const dir = connectorDir(dirId);
      const mcp = await readJson(join(dir, "mcp.json"));
      const cli = mcp ? null : await readJson(join(dir, "cli.json"));
      if (!mcp && !cli) return null;
      if (!mcp) return mapCliConnector(connector);
      const schema = fieldsFromSchema(await readJson(join(dir, "token-schema.json")));
      const servers = mcp.mcpServers && typeof mcp.mcpServers === "object" && !Array.isArray(mcp.mcpServers) ? Object.entries(mcp.mcpServers) : [];
      const valid = servers.filter(([, server]) => server && typeof server === "object" && !Array.isArray(server));
      if (!valid.length) return mapCliConnector(connector);
      const multiple = valid.length > 1;
      return valid.map(([serverKey, server]) => mapMcpConnector(connector, serverKey, server, schema, multiple));
    });
    for (const result of await Promise.all(batch)) {
      if (Array.isArray(result)) items.push(...result);
      else if (result) items.push(result);
    }
  }
  const catalog = {
    available: true,
    count: items.length,
    installable: items.filter((item) => item.installable !== false).length,
    items,
    fetchedAt
  };
  memo = { at: Date.now(), home: currentHome, catalog };
  return catalog;
}
async function workbuddyStatus() {
  const catalog = await loadWorkBuddyCatalog();
  return { available: catalog.available, count: catalog.count, installable: catalog.installable };
}
export {
  findWorkBuddyIcon,
  loadWorkBuddyCatalog,
  workbuddyStatus
};
