<p align="center">
  <img src="assets/icon.svg" width="88" height="88" alt="DSH MCP Connectors" />
</p>

<h1 align="center">DSH MCP Connectors</h1>

<p align="center">
  在 DeepSeek Harness 里统一管理本机各个 AI Agent 的 MCP 服务器。
</p>

<p align="center">
  <b>简体中文</b> · <a href="README.md">English</a> ·
  <a href="https://www.npmjs.com/package/dsh-mcp-connectors">npm</a>
</p>

![面板](assets/screenshots/panel-light.png)

## 为什么做这个

每个 AI Agent 都把自己的 MCP 配置放在不同文件、不同格式里。想知道本机到底跑着哪些 server、想单独关掉某一个工具里的某个 server，就得手改 JSON，还得记住哪个文件属于谁。

这个插件把这些文件自动找出来，集中到一个面板里，支持启停、新增、编辑、删除——**每次写文件前自动备份，随时一键回退**。

## 功能

- **自动发现**——扫描 `~`、`%APPDATA%`、`%LOCALAPPDATA%`（macOS / Linux 对应目录同样覆盖），按文件名**和**文件内容双重判据识别（`mcpServers` / `mcp` 键、`[mcp_servers]` 节区）。常规开发机首扫约 250ms，之后走缓存。
- **多格式**——JSON（`mcpServers`）、OpenCode 风格（`mcp`）、Codex TOML（`[mcp_servers.*]`）、DSH 的 `cordis.patch.yml`（`@deepseek-ai/dsh-mcp-client` 条目），以及 JSONC（注释 / 尾逗号）。TOML / YAML 都只重写目标条目，注释和其它配置逐字节保留。
- **安全写入**——每次写入前把原文件快照到 `~/.dsh/mcp-connectors/backups/`（保留最近 100 份），任意版本一键恢复；恢复前也会先备份当前内容。
- **启停**——DSH 条目有原生 `disabled` 字段，直接改这一行；其它工具没有统一字段，停用 = 条目移出配置文件、定义存进管理器状态，启用再写回。
- **产品归组**——配置分散在多个文件里的工具（如 WorkBuddy 用户级 + 连接器）合成一张卡片，但每台 server 仍绑定自己的文件。
- **连接器目录**——四个来源：官方 [MCP Registry](https://registry.modelcontextprotocol.io/)（在线搜索 + 分页）、[mcp.so 热门 Top 100](https://mcp.so/zh/rankings/servers)（可详情、可安装，带离线缓存）、本机 **WorkBuddy 官方连接器市场**（MCP 类型可装回 WorkBuddy，CLI 类型仅展示），以及 **Qoder 官方连接器市场**（公开接口读取 300+ 连接器；OAuth 连接器一键写入 Qoder / Qoder CN 配置，网关托管或需要 API Key 的标「仅浏览」并提示到 Qoder 内安装）。勾选目标 Agent、填好参数后一键安装，已安装的直接启停或卸载。每个条目有详情页（仓库 / 官网地址、README、启动命令、环境变量、参数）。在线来源都不可用且本机没有 WorkBuddy 时，才会露出内置的 7 个官方参考实现作为断网兜底。
- **拖拽排序**——顺序只存在插件状态里，配置文件一个字节都不动。
- **适配设置页的面板**——竖向布局、区块头吸顶、分组可折叠、状态 / Agent 筛选、回到顶部，明暗主题跟随宿主。

![暗色主题](assets/screenshots/panel-dark.png)

## 支持的配置

| Agent | 路径 | 格式 |
| --- | --- | --- |
| DSH | `~/.dsh/profiles/<profile>/cordis.patch.yml` | YAML `@deepseek-ai/dsh-mcp-client` 条目 |
| DSH（旧版兼容） | `~/.dsh/mcp.json` | JSON `mcpServers` |
| Claude Code | `~/.claude.json` | JSON `mcpServers` |
| Codex | `~/.codex/config.toml` | TOML `[mcp_servers.*]` |
| Cursor | `~/.cursor/mcp.json` | JSON `mcpServers` |
| Gemini | `~/.gemini/settings.json` | JSON `mcpServers` |
| Google Antigravity | `~/.gemini/config/mcp_config.json` | JSON `mcpServers` |
| Qwen Code | `~/.qwen/settings.json` | JSON `mcpServers` |
| Kimi Code | `~/.kimi-code/config.toml` | TOML |
| AtomCode | `~/.atomcode/mcp.json` | JSON `mcpServers` |
| OpenCode | `~/.config/opencode/opencode.json` | JSON `mcp` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | JSON `mcpServers` |
| Trae / Trae CN | `~/.trae/mcp.json`、`~/.trae-cn/mcp.json` | JSON `mcpServers` |
| Qoder | `~/.qoder/settings.json`、`~/.qoder/mcp.json` | JSON `mcpServers` |
| Qoder CN | `~/.qoder-cn/settings.json`、`~/.qoder-cn/mcp.json` | JSON `mcpServers` |
| CodeBuddy / 国内版 | `~/.codebuddy/mcp.json` | JSON `mcpServers` |
| WorkBuddy | `~/.workbuddy/mcp.json`、`~/.workbuddy/connectors/default/mcp.json` | JSON `mcpServers` |
| VS Code | `%APPDATA%/Code/User/mcp.json` | JSONC |
| ……其它自动发现 | — | — |

每个来源的路径都可以在面板里改，覆盖存于 `~/.dsh/mcp-connectors/state.json`。文件不存在的来源不会出现在列表里。

## 安装

```powershell
dsh plugin --profile web add dsh-mcp-connectors
```

或从 GitHub 安装：

```powershell
dsh plugin --profile web add https://github.com/elegant01/dsh-mcp-connectors
```

重启 DSH 后打开 **设置 → 连接器**。后端路由在启动时注册，升级后需要**彻底退出应用**（托盘退出）再启动。

## 安全边界

- 所有写接口要求自定义头 + `application/json` + 同源 `Origin`，宿主 `connection.fetch` 门禁照常生效；
- 写操作串行执行，写前必备份；
- 删除服务器只删目标条目，文件里的其它键原样保留（JSON 重序列化，Codex TOML 按节区重写，DSH YAML 只替换目标条目的 `config:` 块）。
- 连接器在线发现只访问固定域名 `registry.modelcontextprotocol.io`（结果缓存 10 分钟）；mcp.so 只读取允许抓取的排行榜页与详情页（缓存 30 分钟，遵守 robots.txt，不碰 `/search`）；WorkBuddy 连接器只读本机市场缓存。插件不会自动安装或运行任何服务器，必须由你在面板里确认目标 Agent 和参数。
- WorkBuddy 连接器安装时保留 `${VAR}` 凭据占位符，真实密钥仍由 WorkBuddy 自己的 key store 保管，插件不会写入明文凭据。

## 开发

```bash
npm install
npm run typecheck
npm run build        # 生成 lib/（host 不打包，client 打成 DSH ModuleLoader 包）
npm test             # 用临时 HOME 跑全量回归
npm run preview      # docs/preview.html，真实组件 + 假数据
```

## 发版

发布全自动：

```bash
node scripts/bump.cjs 0.2.0   # 同步 package.json + lockfile + changelog
git commit -am "chore(release): v0.2.0"
git push origin main
git tag v0.2.0 && git push origin v0.2.0
```

`publish.yml` 会跑完整测试并用 [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers)（GitHub OIDC）发布——**不需要 NPM_TOKEN，也不受 OTP 限制**，provenance 自动签名。

## 图标

`assets/agent-icons/` 下的各 Agent 品牌图标取自 [@lobehub/icons](https://github.com/lobehub/lobe-icons)（MIT），已随仓库拷贝并在构建时内联，运行时不依赖任何外部路径。

## 许可证

[Apache-2.0](LICENSE)
