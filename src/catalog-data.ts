// 连接器目录的共享数据与类型：host 与 client 都会 import（不含任何 Node API）。
// 内置目录来自 modelcontextprotocol/servers 的 Reference Servers；
// 在线搜索结果由 host 端的 registry.ts 映射成同样的结构。

export type CatalogFieldKind = "text" | "path" | "lines";

export interface CatalogField {
  /** 模板占位符名：{{key}} */
  key: string;
  label: string;
  labelEn?: string;
  description?: string;
  required?: boolean;
  secret?: boolean;
  default?: string;
  placeholder?: string;
  kind?: CatalogFieldKind;
}

export interface CatalogEntry {
  /** 默认安装名（同时作为匹配已安装服务器的 key） */
  id: string;
  title: string;
  titleEn?: string;
  description: string;
  descriptionZh?: string;
  /** official = modelcontextprotocol/servers；registry = MCP Registry；mcpso = mcp.so 详情页；workbuddy = 本机 WorkBuddy 市场 */
  source: "official" | "registry" | "mcpso" | "workbuddy";
  transport: "stdio" | "http";
  /** 用于识别「已安装」的包名 / 地址 */
  packageId?: string;
  command?: string;
  /** 支持 {{field}} 占位符；含占位符且值为空时整段参数省略 */
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  fields: CatalogField[];
  repository?: string;
  /** registry 条目附带的官网 / 文档地址 */
  websiteUrl?: string;
  tags?: string[];
  warning?: string;
  /** registry 条目的原始名称，例如 io.github.foo/bar */
  registryName?: string;
  /** 额外写入配置的字段（如 WorkBuddy 的 timeout / disabledTools / type） */
  extra?: Record<string, unknown>;
  /** WorkBuddy CLI 连接器不可作为 MCP 安装 */
  installable?: boolean;
  /** 只允许安装到指定来源（WorkBuddy 连接器固定写回 WorkBuddy） */
  installTarget?: string;
  /** 使用示例（中 / 英） */
  examples?: string[];
  examplesEn?: string[];
  /** 凭据申请文档 */
  docUrl?: string;
  docLabel?: string;
  docLabelEn?: string;
}

/** mcp.so 热门排行榜条目（方案 A：只浏览，不安装）。 */
export interface RankingEntry {
  rank: number;
  id: string;
  title: string;
  author?: string;
  description?: string;
  url: string;
  iconUrl?: string;
  monthlySearches?: string;
  stars?: string;
  score?: string;
}

const REFERENCE_WARNING =
  "官方参考实现，用来演示 MCP 能力，不建议直接用于生产环境；请自行评估权限与安全边界。";

/** modelcontextprotocol/servers 当前维护的 Reference Servers（2026-11 对照 README）。 */
export const OFFICIAL_CATALOG: CatalogEntry[] = [
  {
    id: "filesystem",
    title: "Filesystem",
    description: "Secure file operations with configurable access controls.",
    descriptionZh: "带访问控制的安全文件读写、搜索与编辑。",
    source: "official",
    transport: "stdio",
    packageId: "@modelcontextprotocol/server-filesystem",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "{{dirs}}"],
    fields: [
      {
        key: "dirs",
        label: "允许访问的目录",
        labelEn: "Allowed directories",
        description: "每行一个绝对路径；服务器只能访问这些目录。",
        required: true,
        kind: "lines",
        placeholder: "F:\\centos\\my-project",
      },
    ],
    repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
    tags: ["files"],
    warning: REFERENCE_WARNING,
  },
  {
    id: "git",
    title: "Git",
    description: "Tools to read, search, and manipulate Git repositories.",
    descriptionZh: "读取、搜索和操作 Git 仓库。",
    source: "official",
    transport: "stdio",
    packageId: "mcp-server-git",
    command: "uvx",
    args: ["mcp-server-git", "--repository", "{{repo}}"],
    fields: [
      {
        key: "repo",
        label: "仓库路径",
        labelEn: "Repository path",
        required: true,
        kind: "path",
        default: ".",
        placeholder: "F:\\centos\\my-project",
      },
    ],
    repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/git",
    tags: ["git"],
    warning: REFERENCE_WARNING,
  },
  {
    id: "memory",
    title: "Memory",
    description: "Knowledge graph-based persistent memory system.",
    descriptionZh: "基于知识图谱的持久记忆系统。",
    source: "official",
    transport: "stdio",
    packageId: "@modelcontextprotocol/server-memory",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
    env: { MEMORY_FILE_PATH: "{{MEMORY_FILE_PATH}}" },
    fields: [
      {
        key: "MEMORY_FILE_PATH",
        label: "记忆文件路径（可选）",
        labelEn: "Memory file path (optional)",
        description: "留空则使用服务器默认位置。",
        kind: "path",
        placeholder: "F:\\centos\\.mcp\\memory.json",
      },
    ],
    repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
    tags: ["memory"],
    warning: REFERENCE_WARNING,
  },
  {
    id: "sequential-thinking",
    title: "Sequential Thinking",
    description: "Dynamic and reflective problem-solving through thought sequences.",
    descriptionZh: "通过逐步思考序列进行动态推理。",
    source: "official",
    transport: "stdio",
    packageId: "@modelcontextprotocol/server-sequential-thinking",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
    fields: [],
    repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking",
    tags: ["reasoning"],
    warning: REFERENCE_WARNING,
  },
  {
    id: "time",
    title: "Time",
    description: "Time and timezone conversion capabilities.",
    descriptionZh: "时间与时区转换。",
    source: "official",
    transport: "stdio",
    packageId: "mcp-server-time",
    command: "uvx",
    args: ["mcp-server-time", "--local-timezone={{tz}}"],
    fields: [
      {
        key: "tz",
        label: "本地时区（可选）",
        labelEn: "Local timezone (optional)",
        placeholder: "Asia/Shanghai",
      },
    ],
    repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/time",
    tags: ["time"],
    warning: REFERENCE_WARNING,
  },
  {
    id: "fetch",
    title: "Fetch",
    description: "Web content fetching and conversion for efficient LLM usage.",
    descriptionZh: "抓取网页并转成适合 LLM 使用的文本。",
    source: "official",
    transport: "stdio",
    packageId: "mcp-server-fetch",
    command: "uvx",
    args: ["mcp-server-fetch"],
    fields: [],
    repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch",
    tags: ["web"],
    warning: REFERENCE_WARNING,
  },
  {
    id: "everything",
    title: "Everything",
    description: "Reference / test server with prompts, resources, and tools.",
    descriptionZh: "参考/测试服务器，覆盖 prompts、resources、tools 全部能力。",
    source: "official",
    transport: "stdio",
    packageId: "@modelcontextprotocol/server-everything",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-everything"],
    fields: [],
    repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/everything",
    tags: ["test"],
    warning: REFERENCE_WARNING,
  },
];

/**
 * 把目录条目的 {{field}} 模板展开成真正写入配置的 spec。
 * - 含占位符且值为空 → 整段参数省略（用于可选的 --flag=value）
 * - kind=lines 的字段 → 每行展开成一个独立参数
 */
export function expandCatalogSpec(entry: CatalogEntry, values: Record<string, string>): {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  extra?: Record<string, unknown>;
} {
  const val = (key: string) => values[key] ?? "";
  const fieldByKey = Object.fromEntries(entry.fields.map((field) => [field.key, field]));
  const placeholders = (text: string) => [...text.matchAll(/\{\{([\w-]+)\}\}/g)].map((match) => match[1]);
  const expand = (text: string) => text.replace(/\{\{([\w-]+)\}\}/g, (_, key: string) => val(key));

  const args: string[] = [];
  for (const template of entry.args ?? []) {
    const keys = placeholders(template);
    if (keys.length && keys.every((key) => !val(key).trim())) continue;
    const linesKey = keys.length === 1 && fieldByKey[keys[0]]?.kind === "lines" ? keys[0] : null;
    if (linesKey) {
      for (const line of val(linesKey).split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) args.push(line);
    } else {
      args.push(expand(template));
    }
  }
  const env: Record<string, string> = {};
  for (const [key, template] of Object.entries(entry.env ?? {})) {
    const keys = placeholders(template);
    if (keys.length && keys.every((field) => !val(field).trim())) continue;
    env[key] = expand(template);
  }
  const headers: Record<string, string> = {};
  for (const [key, template] of Object.entries(entry.headers ?? {})) {
    const keys = placeholders(template);
    if (keys.length && keys.every((field) => !val(field).trim())) continue;
    headers[key] = expand(template);
  }
  const spec: {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
    extra?: Record<string, unknown>;
  } = {};
  if (entry.command) spec.command = entry.command;
  if (args.length) spec.args = args;
  if (Object.keys(env).length) spec.env = env;
  if (entry.url) spec.url = entry.url;
  if (Object.keys(headers).length) spec.headers = headers;
  if (entry.extra && Object.keys(entry.extra).length) spec.extra = entry.extra;
  return spec;
}

/** 判断某个已安装服务器是否是目录条目（用于「已安装」标记 / 卸载）。 */
export function matchesCatalogEntry(
  entry: Pick<CatalogEntry, "id" | "packageId" | "url">,
  name: string,
  spec: { command?: string; args?: string[]; url?: string },
): boolean {
  if (name === entry.id) return true;
  if (entry.url && spec.url === entry.url) return true;
  if (entry.packageId) {
    const needle = entry.packageId;
    if (spec.command === needle) return true;
    if (spec.args?.some((arg) => arg === needle)) return true;
    if (spec.url?.includes(needle)) return true;
  }
  return false;
}
