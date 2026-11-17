// 截图夹具：用真实的 client.ts 组件 + 假数据渲染面板，供 README 截图使用。
// 仅开发用，不参与发布构建。
import * as React from "react";
import { createRoot } from "react-dom/client";
import { McpManagerApp, ZH } from "../src/client.js";

const snapshot = {
  order: {},
  warnings: [],
  backups: [
    { id: "b1", sourceKey: "claude", sourceLabel: "Claude Code", file: "/x", targetPath: "C:\\Users\\me\\.claude.json", createdAt: new Date(Date.now() - 3600e3).toISOString(), reason: "disable puppeteer", size: 4096 },
    { id: "b2", sourceKey: "codex", sourceLabel: "Codex", file: "/y", targetPath: "C:\\Users\\me\\.codex\\config.toml", createdAt: new Date(Date.now() - 86400e3).toISOString(), reason: "upsert sqlite", size: 2048 },
  ],
  sources: [
    {
      key: "claude", label: "Claude Code", path: "C:\\Users\\me\\.claude.json", exists: true,
      writable: true, format: "json-mcpServers",
      servers: [
        { name: "filesystem", transport: "stdio", summary: "npx -y @modelcontextprotocol/server-filesystem /data", spec: {}, enabled: true },
        { name: "github", transport: "http", summary: "https://api.githubcopilot.com/mcp/", spec: {}, enabled: true },
        { name: "puppeteer", transport: "stdio", summary: "npx -y @modelcontextprotocol/server-puppeteer", spec: {}, enabled: false },
      ],
    },
    {
      key: "codex", label: "Codex", path: "C:\\Users\\me\\.codex\\config.toml", exists: true,
      writable: true, format: "toml-codex",
      servers: [
        { name: "context7", transport: "http", summary: "https://mcp.context7.com/mcp", spec: {}, enabled: true },
        { name: "sqlite", transport: "stdio", summary: "uvx mcp-server-sqlite --db ./data.db", spec: {}, enabled: true },
      ],
    },
    {
      key: "workbuddy", label: "WorkBuddy（用户级）", path: "C:\\Users\\me\\.workbuddy\\mcp.json", exists: true,
      writable: true, format: "json-mcpServers", group: "workbuddy", groupLabel: "WorkBuddy",
      servers: [
        { name: "codegraph", transport: "stdio", summary: "codegraph serve --mcp", spec: {}, enabled: true },
        { name: "chrome-devtools", transport: "stdio", summary: "node chrome-pool-mcp.js", spec: {}, enabled: true },
      ],
    },
    {
      key: "workbuddy-connectors", label: "WorkBuddy（连接器）", path: "C:\\Users\\me\\.workbuddy\\connectors\\default\\mcp.json", exists: true,
      writable: true, format: "json-mcpServers", group: "workbuddy", groupLabel: "WorkBuddy",
      servers: [
        { name: "postgres", transport: "stdio", summary: "docker run -i postgres-mcp", spec: {}, enabled: false },
        { name: "notion", transport: "sse", summary: "https://mcp.notion.com/sse", spec: {}, enabled: true },
      ],
    },
  ],
};

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(typeof input === "string" ? input : (input as Request).url ?? input);
  if (url.includes("/state")) {
    return new Response(JSON.stringify({ ok: true, data: snapshot }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (init?.method === "POST" || url.includes("/reorder") || url.includes("/open-folder")) {
    return new Response(JSON.stringify({ ok: true, data: { ok: true } }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return realFetch(input as RequestInfo, init);
};

// 夹具里模拟 DSH 宿主的主题标记，让面板的「跟随宿主主题」逻辑生效
try {
  const dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  document.body.style.background = dark ? "#0a0a0a" : "#fafafa";
} catch { /* ignore */ }

// 预览时让所有分组默认展开，方便截到完整的卡片
try { localStorage.setItem("dmm-collapsed", JSON.stringify({ claude: false, codex: false, workbuddy: false })); } catch { /* ignore */ }

const t = (key: string) => (ZH as Record<string,string>)[key] ?? key;
createRoot(document.getElementById("root")!).render(
  React.createElement(McpManagerApp, { t }),
);
