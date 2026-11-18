const BUILTIN_SOURCES = [
  {
    // 旧版/兼容路径；当前 DSH 的 MCP 实际在 ~/.dsh/profiles/<profile>/cordis.patch.yml，
    // 由 core.ts 的 cordisProfileSources() 动态列出。
    key: "dsh",
    label: "DSH\uFF08mcp.json\uFF09",
    format: "json-mcpServers",
    paths: ["~/.dsh/mcp.json", "~/.dsh/mcpServers.json"],
    writable: true,
    group: "dsh",
    groupLabel: "DSH"
  },
  {
    key: "claude",
    label: "Claude Code",
    format: "json-mcpServers",
    paths: ["~/.claude.json"],
    writable: true
  },
  {
    key: "codex",
    label: "Codex",
    format: "toml-codex",
    paths: ["~/.codex/config.toml"],
    writable: true
  },
  {
    key: "cursor",
    label: "Cursor",
    format: "json-mcpServers",
    paths: ["~/.cursor/mcp.json"],
    writable: true
  },
  {
    key: "gemini",
    label: "Gemini",
    format: "json-mcpServers",
    paths: ["~/.gemini/settings.json"],
    writable: true
  },
  {
    key: "antigravity",
    label: "Google Antigravity",
    format: "json-mcpServers",
    paths: ["~/.gemini/config/mcp_config.json", "~/.gemini/antigravity-cli/settings.json"],
    writable: true
  },
  {
    key: "qwen",
    label: "Qwen Code",
    format: "json-mcpServers",
    paths: ["~/.qwen/settings.json"],
    writable: true
  },
  {
    key: "kimicode",
    label: "Kimi Code",
    format: "toml-codex",
    paths: ["~/.kimi-code/config.toml"],
    writable: true
  },
  {
    key: "atomcode",
    label: "AtomCode",
    format: "json-mcpServers",
    paths: ["~/.atomcode/mcp.json"],
    writable: true
  },
  {
    key: "opencode",
    label: "OpenCode",
    format: "json-mcp",
    paths: ["~/.config/opencode/opencode.json", "~/.opencode/opencode.json"],
    writable: true
  },
  {
    key: "windsurf",
    label: "Windsurf",
    format: "json-mcpServers",
    paths: ["~/.codeium/windsurf/mcp_config.json", "~/.windsurf/mcp_config.json"],
    writable: true
  },
  {
    key: "trae",
    label: "Trae",
    format: "json-mcpServers",
    paths: ["~/.trae/mcp.json"],
    writable: true
  },
  {
    key: "traecn",
    label: "Trae CN",
    format: "json-mcpServers",
    paths: ["~/.trae-cn/mcp.json"],
    writable: true
  },
  {
    key: "qoder",
    label: "Qoder",
    format: "json-mcpServers",
    paths: ["~/.qoder/mcp.json"],
    writable: true
  },
  {
    key: "codebuddy",
    label: "CodeBuddy",
    format: "json-mcpServers",
    paths: ["~/.codebuddy/mcp.json"],
    writable: true
  },
  {
    key: "codebuddycn",
    label: "CodeBuddy CN",
    format: "json-mcpServers",
    paths: ["~/.codebuddycn/mcp.json"],
    writable: true
  },
  {
    key: "workbuddy",
    label: "WorkBuddy\uFF08\u7528\u6237\u7EA7\uFF09",
    format: "json-mcpServers",
    paths: ["~/.workbuddy/mcp.json"],
    writable: true,
    group: "workbuddy",
    groupLabel: "WorkBuddy"
  },
  {
    key: "workbuddy-connectors",
    label: "WorkBuddy\uFF08\u8FDE\u63A5\u5668\uFF09",
    format: "json-mcpServers",
    paths: ["~/.workbuddy/connectors/default/mcp.json"],
    writable: true,
    group: "workbuddy",
    groupLabel: "WorkBuddy"
  },
  {
    key: "factory",
    label: "Factory Droid",
    format: "json-mcpServers",
    paths: ["~/.factory/mcp.json"],
    writable: true
  },
  {
    key: "openclaw",
    label: "OpenClaw",
    format: "json-mcpServers",
    paths: ["~/.openclaw/mcp.json"],
    writable: true
  },
  {
    key: "roo",
    label: "Roo Code",
    format: "json-mcpServers",
    paths: ["~/.roo/mcp.json"],
    writable: true
  },
  {
    key: "ccswitch",
    label: "CC Switch",
    format: "json-mcpServers",
    paths: ["~/.cc-switch/mcp.json"],
    writable: true
  }
];
function customSourceDef(key, label, path) {
  return { key, label, format: "json-mcpServers", paths: [path], writable: true };
}
export {
  BUILTIN_SOURCES,
  customSourceDef
};
