# 更新日志

本项目的重要变更都记录在此。格式遵循 [Keep a Changelog](https://keepachangelog.com/)，版本号遵循 [SemVer](https://semver.org/)。

## [0.3.0] - 2026-11-24

### 新增

- 新增「Qoder 连接器市场」来源：通过 Qoder 官网公开接口读取 300+ 连接器（按 50 条/页分页抓取，缓存 30 分钟，网络失败回退上次快照并标注）。OAuth 类型连接器可在目录里一键安装，直接写入 `~/.qoder-cn/settings.json` 或 `~/.qoder/settings.json` 的 `mcpServers`（`type: "http"`），写入前照常备份、保留文件里的其它配置；首次连接需在 Qoder 内完成 OAuth 登录。网关托管（`mcp.qoder.cn` / `mcp.qoder.com`）和需要 API Key 的连接器标为「仅浏览」并提示到 Qoder 市场内安装。
- Qoder 配置文件识别新增 `~/.qoder/settings.json` 和 `~/.qoder-cn/settings.json`（与原有的 `mcp.json` 并存）。
- WorkBuddy 连接器来源：卡片显示连接器图标（本地读取，不联网）；列表保持 WorkBuddy 市场的原始排序，不再按名称重排。

## [0.2.0] - 2026-11-18

### 新增

- 支持 DSH 真实的 MCP 配置形态：`~/.dsh/profiles/<profile>/cordis.patch.yml`（`@deepseek-ai/dsh-mcp-client` 条目）。每个 profile 在 DSH 分组下单独列出；支持读取、新增、编辑、删除，以及原生 `disabled` 启停。写入只替换目标条目的 `config:` 块，注释与其它插件配置原样保留。
- 旧的 `~/.dsh/mcp.json` 路径继续兼容读取。
- 连接器目录：内置 `modelcontextprotocol/servers` 的 7 个官方参考服务器，并可在线搜索官方 MCP Registry。可一次安装到多个 Agent，装好后直接在目录里启停或卸载；必填参数（目录、仓库路径、Token 等）在安装前收集，Windows 上的 DSH 目标会自动包成 `cmd /c npx|uvx`。
- 连接器详情页：显示仓库 / 官网地址、包名、传输方式、registry 名称、带占位符说明的启动命令、环境变量、安装参数和已安装的 Agent；列表卡片也直接带「仓库地址」链接。Registry 条目不是都来自 GitHub，没有仓库地址时详情页会明确提示。
- 详情页按需抓取并渲染 GitHub 仓库 README（标题 / 列表 / 代码块 / 链接，长文截断到 600 行并给出 GitHub 链接）；抓取只允许 github.com → raw.githubusercontent.com，缓存 30 分钟。
- 「在线发现」改为默认 Tab，并支持游标分页「加载更多」——官方 `modelcontextprotocol/servers` 仓库本来就只维护少量参考实现，完整目录在 MCP Registry。
- 新增「mcp.so 热门」来源：只抓取 mcp.so 排行榜 Top 100（遵守 robots.txt，不碰它的 /search），展示排名、作者、简介、月搜、星标和评分；成功结果落盘缓存，网络失败时回退到上次快照并明确标注。
- mcp.so 支持详情与安装：点「详情 / 安装」时按需抓取该条目详情页，解析其中的 `mcpServers` 配置（含 `${VAR}` / `YOUR_TOKEN` 等凭据占位符），转成安装表单；没有可用配置时退化为跳转 mcp.so。详情结果缓存 30 分钟，失败时回退本地快照。
- 移除「官方参考」Tab。在线来源都失败且本机没有 WorkBuddy 时，才在空状态里露出内置的 7 个官方参考实现作为断网兜底。
- 新增「WorkBuddy 连接器」来源：读取本机 WorkBuddy 官方连接器市场缓存（318 条，272 个可安装 MCP，其余为 CLI 类型）。MCP 类型保留 WorkBuddy 的 `${VAR}` 凭据占位符并安装回 `~/.workbuddy/connectors/default/mcp.json`（`connector:<id>` 命名），凭据仍由 WorkBuddy 自己的 key store 保管、不写入配置；CLI 类型只展示不安装；没装 WorkBuddy 时该来源不出现。

## [0.1.1] - 2026-11-17

### 变更

- 补齐中英双语 README（含明暗两套截图）。
- 新增 `CHANGELOG.md` / `CHANGELOG.zh-CN.md`。
- 新增 GitHub Actions：`ci.yml`（push/PR 跑类型检查与全量回归）、`publish.yml`（推 `v*` 标签自动发布 npm，带 provenance）。
- 包名确定为 `dsh-mcp-connectors`（原名 `dsh-mcp-manager` 在 npm 上已被占用）。

## [0.1.0] - 2026-11-17

首个公开版本。

### 新增

- 自动发现本机各 AI Agent 的 MCP 配置文件（主目录点目录、`%APPDATA%`、`%LOCALAPPDATA%`，并覆盖 macOS / Linux 对应目录）。按文件名与文件内容识别，不依赖写死的 agent 清单；清单外的 agent 可手动登记。
- 支持四种配置形态：JSON `mcpServers`、OpenCode 风格 `mcp`、Codex TOML `[mcp_servers.*]`、JSONC（注释与尾逗号）。
- 服务器启停。MCP 没有跨工具通用的 `disabled` 字段，因此停用会把条目移出配置文件、定义存入插件状态；启用再写回。
- 新增、编辑、删除服务器，支持表单与原始 JSON 两种模式；编辑时保留未识别字段。
- 每次写入前自动备份目标文件（保留最近 100 份），支持一键恢复，且恢复前也会先备份当前内容。
- Codex TOML 仅按服务器节区重写——注释和其它配置原样保留。
- 产品归组：同一产品散布在多个文件的配置（如 WorkBuddy 用户级 + 连接器）合成一张卡片，每台服务器仍绑定自己的文件。
- 面板内拖拽排序；顺序仅用于展示，不修改配置文件。
- 适配设置页的 BoardUI 风格面板：竖向布局、区块头吸顶、分组折叠、状态 / Agent 筛选、回到顶部、跟随宿主的明暗主题。
- 单个来源的配置路径可覆盖，支持登记自定义来源。
- 设置侧栏入口与专属图标。
- 全量回归测试（`npm test`），在临时 HOME 下运行。

### 修复

- 非法服务器输入（名称格式、非 http(s) 地址、非法 JSON）会返回明确的错误码。
- 0 字节的占位配置文件视为「无服务器」，不再报解析错误。
- 来源不存在时「打开所在文件夹」返回可读错误，而不是抛异常。
