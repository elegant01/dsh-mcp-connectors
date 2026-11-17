# DSH MCP Manager

**统一管理本机各 Agent 的 MCP 服务器配置 · BoardUI 风格面板**

[English](#english) · 简体中文

DSH MCP Manager 是社区维护的 DeepSeek Harness(DSH)插件:扫描本机各 AI Agent 的 MCP 配置文件,在 DSH 里用一个面板完成查看、启停、新增、编辑、删除与备份回退。

## 功能

- **跨 Agent 集中管理**:内置 DSH、Claude Code、Codex、Cursor、Gemini、OpenCode、Windsurf、Trae、Qoder、CodeBuddy、WorkBuddy、Roo Code、CC Switch 等来源;清单外的 Agent 可添加自定义来源。
- **启停不丢定义**:停用 = 条目从配置文件移出、原定义存进管理器状态(各家 MCP 格式没有统一的 disabled 字段,这是不污染原文件语义的做法);启用一键写回。
- **读写带备份回退**:每次写配置文件前自动快照原文件(保留最近 100 份),随时一键回退;回退前也会先备份当前内容。
- **Codex TOML 安全改写**:只重写 `[mcp_servers.*]` 节区,文件其余内容(注释、其它配置)逐字节保留。
- **BoardUI 风格界面**:浮动侧栏导航、KPI 卡片、服务器卡片网格、明暗双主题,与表格型管理器完全不同的观感。

## 支持的配置文件

| Agent | 路径 | 格式 |
| --- | --- | --- |
| DSH | `~/.dsh/mcp.json` | JSON `mcpServers` |
| Claude Code | `~/.claude.json` | JSON `mcpServers` |
| Codex | `~/.codex/config.toml` | TOML `[mcp_servers.*]` |
| Cursor | `~/.cursor/mcp.json` | JSON `mcpServers` |
| Gemini | `~/.gemini/settings.json` | JSON `mcpServers` |
| OpenCode | `~/.config/opencode/opencode.json` | JSON `mcp` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | JSON `mcpServers` |
| Trae / Qoder / CodeBuddy / WorkBuddy / Roo / CC Switch | `~/.<agent>/mcp.json` | JSON `mcpServers` |

路径支持 `~`、`%ENV%`、`$ENV` 展开;每个内置来源都可以在面板里改读哪个文件(覆盖存于 `~/.dsh/mcp-manager/state.json`)。

## 安装

```powershell
dsh plugin --profile web add <本仓库路径或打包后的 .tgz>
```

安装后重启 DSH 并刷新页面:
- **设置 → MCP 服务器**:完整面板;
- **侧栏「插件」下方**:常驻 MCP 图标入口,大面板浏览。

## 开发

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run build       # 生成 lib/(host 不打包,client 打包成 DSH ModuleLoader CJS)
node scripts/preview.mjs   # 生成 docs/preview.html,浏览器里预览 UI(mock 数据)
```

## 安全边界

- 所有写接口要求自定义头 + JSON content-type + 同源 Origin,借用宿主 `connection.fetch` 门禁;
- 写操作串行执行,写前必备份;
- 删除服务器只删目标条目,配置文件的其它键原样保留(JSON 重序列化,Codex TOML 按节区重写)。

## 图标来源

`assets/agent-icons/` 下的各 Agent 品牌图标取自 [@lobehub/icons](https://github.com/lobehub/lobe-icons) 静态 SVG（MIT 许可），已随本仓库拷贝，构建时内联进产物，运行时不依赖任何外部目录。更新图标：替换 `assets/agent-icons/` 中文件后执行 `node scripts/gen-icons.mjs`。

## 许可证

[Apache License 2.0](LICENSE)

---

## English

A community DSH plugin that scans MCP config files of local AI agents (Claude Code, Codex, Cursor, Gemini, OpenCode, Windsurf, …) and manages them — view, toggle, add, edit, delete, backup and restore — from a single BoardUI-styled panel inside DeepSeek Harness.

- Toggle semantics: disabling moves the entry out of the agent's config into the manager's own state (no unified `disabled` field exists across MCP formats); enabling writes it back.
- Every write snapshots the original file first (last 100 kept); one-click restore, and restoring backs up the current content too.
- Codex `config.toml` is rewritten per `[mcp_servers.*]` section only — comments and unrelated settings are preserved byte-for-byte.
- UI: floating sidebar nav, KPI cards, server card grid, light/dark themes.

Install: `dsh plugin --profile web add <path-or-tgz>`, restart DSH, then open **Settings → MCP Servers** or the sidebar entry.
