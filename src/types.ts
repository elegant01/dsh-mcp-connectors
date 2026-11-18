// dsh-mcp-manager 共享类型：Host 路由层与核心层共用。

/** MCP 服务器定义（归一化后；写入时按来源格式还原）。 */
export interface McpServerSpec {
  /** stdio: 启动命令；http/sse: 访问地址 */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  /** 原始定义里的其余字段，读写时原样保留 */
  extra?: Record<string, unknown>;
  /** 条目级停用标志（仅 DSH 的 cordis.patch.yml 原生支持；其它格式不会出现） */
  disabled?: boolean;
}

export type TransportKind = "stdio" | "http" | "sse";

export interface ServerView {
  name: string;
  transport: TransportKind;
  summary: string;
  spec: McpServerSpec;
  enabled: boolean;
}

export type SourceFormat = "json-mcpServers" | "json-mcp" | "toml-codex" | "cordis-yaml";

export interface SourceDef {
  key: string;
  label: string;
  format: SourceFormat;
  /** 默认配置文件候选路径（支持 ~ 与环境变量）；第一个存在的生效 */
  paths: string[];
  /** 是否允许写入（备份+回退） */
  writable: boolean;
  /** 自动发现（非内置表）来源 */
  discovered?: boolean;
  /** 产品归组：同一产品的多个配置文件在面板上合成一张卡片 */
  group?: string;
  groupLabel?: string;
}

export interface SourceView {
  key: string;
  label: string;
  path: string | null;
  exists: boolean;
  writable: boolean;
  format: SourceFormat;
  error?: string;
  servers: ServerView[];
  /** 解析出的自定义覆盖路径（来自 state） */
  overridden?: boolean;
  /** 自动发现（非内置表）来源 */
  discovered?: boolean;
  /** 产品归组键与显示名 */
  group?: string;
  groupLabel?: string;
}

export interface BackupEntry {
  id: string;
  sourceKey: string;
  sourceLabel: string;
  /** 备份文件（绝对路径） */
  file: string;
  /** 被备份的原始配置文件 */
  targetPath: string;
  createdAt: string;
  reason: string;
  size: number;
}

export interface Snapshot {
  sources: SourceView[];
  backups: BackupEntry[];
  warnings: Diagnostic[];
  /** 面板内手动排序（groupKey -> ["sourceKey/name"]） */
  order: Record<string, string[]>;
}

export interface Diagnostic {
  code: string;
  error: string;
}

export interface OperationError {
  ok: false;
  code: string;
  error: string;
  params?: Record<string, unknown>;
}

export interface CodedError extends Error {
  statusCode?: number;
  code?: string;
  params?: Record<string, unknown>;
}

export type Log = (event: string, detail?: unknown) => Promise<void>;

/** 管理器自身状态（~/.dsh/mcp-manager/state.json）。 */
export interface ManagerState {
  version: 1;
  /** 被停用的服务器：key = `${sourceKey}/${name}` */
  disabled: Record<string, McpServerSpec>;
  /** 来源路径覆盖：sourceKey -> 绝对路径 */
  rootOverrides: Record<string, string>;
  /** 自定义来源（清单外的 agent） */
  customSources: Array<{ key: string; label: string; path: string }>;
  /** 面板内手动排序：groupKey -> ["sourceKey/name", ...]（纯展示层，不改配置文件） */
  order: Record<string, string[]>;
}

export interface ServerInput {
  source?: string;
  name?: string;
  transport?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  /** 直接给完整 JSON 定义（高级模式） */
  raw?: string;
}

export interface BackupInput {
  id?: string;
}
