// 各 Agent 的 MCP 配置文件来源表（2026-11 对照真机校核过路径）。
// format:
//  - json-mcpServers: JSON 文件，服务器表在顶层 mcpServers（绝大多数）
//  - json-mcp:        JSON 文件，服务器表在顶层 mcp（opencode / crush）
//  - toml-codex:      Codex 系 config.toml，服务器表在 [mcp_servers.<name>] 节区
// 检测是优雅的：文件不存在的来源不会出现在面板里，路径猜错不造成任何副作用。

import type { SourceDef } from "./types.js";

export const BUILTIN_SOURCES: SourceDef[] = [
  {
    key: "dsh",
    label: "DSH",
    format: "json-mcpServers",
    paths: ["~/.dsh/mcp.json", "~/.dsh/mcpServers.json"],
    writable: true,
  },
  {
    key: "claude",
    label: "Claude Code",
    format: "json-mcpServers",
    paths: ["~/.claude.json"],
    writable: true,
  },
  {
    key: "codex",
    label: "Codex",
    format: "toml-codex",
    paths: ["~/.codex/config.toml"],
    writable: true,
  },
  {
    key: "cursor",
    label: "Cursor",
    format: "json-mcpServers",
    paths: ["~/.cursor/mcp.json"],
    writable: true,
  },
  {
    key: "gemini",
    label: "Gemini",
    format: "json-mcpServers",
    paths: ["~/.gemini/settings.json"],
    writable: true,
  },
  {
    key: "antigravity",
    label: "Google Antigravity",
    format: "json-mcpServers",
    paths: ["~/.gemini/config/mcp_config.json", "~/.gemini/antigravity-cli/settings.json"],
    writable: true,
  },
  {
    key: "qwen",
    label: "Qwen Code",
    format: "json-mcpServers",
    paths: ["~/.qwen/settings.json"],
    writable: true,
  },
  {
    key: "kimicode",
    label: "Kimi Code",
    format: "toml-codex",
    paths: ["~/.kimi-code/config.toml"],
    writable: true,
  },
  {
    key: "atomcode",
    label: "AtomCode",
    format: "json-mcpServers",
    paths: ["~/.atomcode/mcp.json"],
    writable: true,
  },
  {
    key: "opencode",
    label: "OpenCode",
    format: "json-mcp",
    paths: ["~/.config/opencode/opencode.json", "~/.opencode/opencode.json"],
    writable: true,
  },
  {
    key: "windsurf",
    label: "Windsurf",
    format: "json-mcpServers",
    paths: ["~/.codeium/windsurf/mcp_config.json", "~/.windsurf/mcp_config.json"],
    writable: true,
  },
  {
    key: "trae",
    label: "Trae",
    format: "json-mcpServers",
    paths: ["~/.trae/mcp.json"],
    writable: true,
  },
  {
    key: "traecn",
    label: "Trae CN",
    format: "json-mcpServers",
    paths: ["~/.trae-cn/mcp.json"],
    writable: true,
  },
  {
    key: "qoder",
    label: "Qoder",
    format: "json-mcpServers",
    paths: ["~/.qoder/mcp.json"],
    writable: true,
  },
  {
    key: "codebuddy",
    label: "CodeBuddy",
    format: "json-mcpServers",
    paths: ["~/.codebuddy/mcp.json"],
    writable: true,
  },
  {
    key: "codebuddycn",
    label: "CodeBuddy CN",
    format: "json-mcpServers",
    paths: ["~/.codebuddycn/mcp.json"],
    writable: true,
  },
  {
    key: "workbuddy",
    label: "WorkBuddy（用户级）",
    format: "json-mcpServers",
    paths: ["~/.workbuddy/mcp.json"],
    writable: true,
    group: "workbuddy",
    groupLabel: "WorkBuddy",
  },
  {
    key: "workbuddy-connectors",
    label: "WorkBuddy（连接器）",
    format: "json-mcpServers",
    paths: ["~/.workbuddy/connectors/default/mcp.json"],
    writable: true,
    group: "workbuddy",
    groupLabel: "WorkBuddy",
  },
  {
    key: "factory",
    label: "Factory Droid",
    format: "json-mcpServers",
    paths: ["~/.factory/mcp.json"],
    writable: true,
  },
  {
    key: "openclaw",
    label: "OpenClaw",
    format: "json-mcpServers",
    paths: ["~/.openclaw/mcp.json"],
    writable: true,
  },
  {
    key: "roo",
    label: "Roo Code",
    format: "json-mcpServers",
    paths: ["~/.roo/mcp.json"],
    writable: true,
  },
  {
    key: "ccswitch",
    label: "CC Switch",
    format: "json-mcpServers",
    paths: ["~/.cc-switch/mcp.json"],
    writable: true,
  },
];

/** 自定义来源统一按 json-mcpServers 解析。 */
export function customSourceDef(key: string, label: string, path: string): SourceDef {
  return { key, label, format: "json-mcpServers", paths: [path], writable: true };
}
