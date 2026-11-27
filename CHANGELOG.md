# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/), versions use [SemVer](https://semver.org/).

## [0.4.0] - 2026-11-27

### Added

- New "TraeWork MCP market" source: reads the public API behind the marketplace built into TRAE SOLO CN (475 entries; 318 with a run command are installable, 157 are browse-only introductions). Supports filtering, details (README / repository / run command / parameters) and one-click install into any agent; 30-minute cache with a local snapshot fallback when offline. READMEs are fetched only from the marketplace's own download URL.
- Opening the connector catalog now probes reachability: when the official MCP Registry or mcp.so is unreachable, the "Online discovery" and "mcp.so" tabs are hidden and the panel switches to a source that still works (WorkBuddy connectors first).

### Changed

- Connector catalog tab order is now: Online discovery, mcp.so, WorkBuddy connectors, Qoder, TraeWork.

### Fixed

- Browse-only entries no longer mislabel themselves as "CLI (WorkBuddy only)"; they now show "Browse only".

## [0.3.1] - 2026-11-26

### Fixed

- The connector catalog modal now has a fixed height (`min(760px, viewport height)`), so it no longer starts short while loading and jumps taller when results arrive; the list scrolls inside the modal instead.
- Catalog loading states now use skeleton cards (6 placeholders with a pulse animation that respects `prefers-reduced-motion`); the error message and retry button appear only when a request actually fails.
- Each agent's connector list now starts collapsed every time the panel is opened (the expanded state is no longer persisted across sessions), and the collapse animation no longer gets stuck open on some Chromium builds (the unreliable `grid-template-rows` height transition was removed).
- The README area in the connector detail modal uses the same skeleton treatment, shows the error with a retry button only on failure, and now has a fixed-height (`min(340px, 46vh)`) scroll box so the modal no longer grows when the README arrives; the "View on GitHub" link is always available.

## [0.3.0] - 2026-11-24

### Added

- New "Qoder connector marketplace" source: reads 300+ connectors from Qoder's public marketplace API (50 per page, 30-minute cache, falls back to the last snapshot with a stale marker on network failure). OAuth connectors install in one click into `mcpServers` of `~/.qoder-cn/settings.json` or `~/.qoder/settings.json` (`type: "http"`) with the usual pre-write backup and preservation of other settings; the first connection still requires completing OAuth inside Qoder. Gateway-hosted (`mcp.qoder.cn` / `mcp.qoder.com`) and API-key connectors are marked browse-only with a pointer to install inside the Qoder marketplace.
- Qoder config discovery now also covers `~/.qoder/settings.json` and `~/.qoder-cn/settings.json` (alongside the existing `mcp.json` paths).
- WorkBuddy connector cards now show connector icons (read locally, no network) and the list keeps the WorkBuddy marketplace's original order instead of re-sorting by name.

## [0.2.0] - 2026-11-18

### Added

- Support DSH's real MCP configuration format: `~/.dsh/profiles/<profile>/cordis.patch.yml` (`@deepseek-ai/dsh-mcp-client` entries). Each profile appears as its own source under the DSH group; reads, adds, edits, deletes, and native `disabled` toggling are supported, and rewrites touch only the target entry's `config:` block so comments and other plugins survive.
- The previous `~/.dsh/mcp.json` path is still read for backward compatibility.
- Connector catalog: the seven official `modelcontextprotocol/servers` reference servers are built in, and the official MCP Registry can be searched live. Install into one or more agents at once, then toggle or uninstall from the catalog. Required parameters (directories, repository paths, tokens) are collected up front; Windows DSH targets get `cmd /c npx|uvx` automatically.
- Connector detail view: repository / website links, package, transport, registry name, launch command with parameter placeholders, environment variables, install parameters, and the agents it is installed in. Cards also link to the repository directly. Registry entries are not all from GitHub; the detail view says so when no repository is attached.
- The detail view lazily fetches and renders the GitHub repository README (headings / lists / code blocks / links; long files truncated to 600 lines with a GitHub link). Fetching is restricted to github.com → raw.githubusercontent.com and cached for 30 minutes.
- Online (MCP Registry) is now the default catalog tab and supports cursor pagination via "Load more" — the official `modelcontextprotocol/servers` repo intentionally only maintains a handful of reference implementations.
- New "mcp.so Top 100" source: reads only the mcp.so rankings page (respects robots.txt and never touches its `/search`), showing rank, author, description, monthly searches, stars and score. Successful fetches are cached to disk; network failures fall back to the last snapshot with an explicit stale marker.
- mcp.so entries are now installable: clicking Details / Install fetches the entry's detail page on demand, parses its `mcpServers` config (including `${VAR}` / `YOUR_TOKEN` credential placeholders) and opens the normal install form. Pages without a usable config degrade to a link to mcp.so. Detail responses are cached for 30 minutes with a local fallback.
- Removed the "Official reference" tab. The 7 built-in reference implementations now appear only as an offline fallback when every online source fails and WorkBuddy is not installed.
- New "WorkBuddy connectors" source: reads the local WorkBuddy official connector marketplace cache (318 entries, 272 installable MCP connectors, the rest CLI). MCP connectors keep WorkBuddy's `${VAR}` credential placeholders and install back into `~/.workbuddy/connectors/default/mcp.json` using the `connector:<id>` convention — real credentials stay in WorkBuddy's own key store and are never written to config by the plugin. CLI connectors are browse-only. The source is hidden entirely when WorkBuddy is not installed.

## [0.1.4] - 2026-11-18

### 变更

- Also publishes to GitHub Packages (`@elegant01/dsh-mcp-connectors`) so the repo sidebar shows the package.

## [0.1.3] - 2026-11-18

### 变更

- CI lockfile switched to registry.npmjs.org (mirror tarball URLs are rejected by npm’s EALLOWREMOTE check).

## [0.1.2] - 2026-11-18

### Changed

- Publishing now uses npm Trusted Publishing (GitHub OIDC) — no token, no OTP.

## [0.1.1] - 2026-11-17

### Changed

- Bilingual README (English + 简体中文) with light/dark screenshots.
- Added `CHANGELOG.md` / `CHANGELOG.zh-CN.md`.
- Added GitHub Actions: `ci.yml` (typecheck + full regression on push/PR) and `publish.yml` (publishes to npm when a `v*` tag is pushed, with provenance).
- Package name is `dsh-mcp-connectors` (the original `dsh-mcp-manager` is taken on npm).

## [0.1.0] - 2026-11-17

First public release.

### Added

- Auto-discovery of MCP config files across local AI agents (home dot-dirs, `%APPDATA%`, `%LOCALAPPDATA%`, with macOS/Linux equivalents). Identification by file name and content, not by hard-coded per-agent tables; unknown agents can be registered manually.
- Support for four config shapes: JSON `mcpServers`, OpenCode-style `mcp`, Codex TOML `[mcp_servers.*]`, and JSONC (comments and trailing commas).
- Enable/disable servers. Since MCP has no cross-tool `disabled` flag, disabling moves the entry out of the config into plugin state; enabling writes it back.
- Add, edit and delete servers, with form and raw-JSON modes. Unrecognized fields are preserved on edit.
- Automatic backup of the target file before every write (last 100 kept), one-click restore, and the restore itself is backed up first.
- Codex TOML is rewritten per server section only — comments and unrelated settings survive.
- Product grouping: files belonging to the same product (e.g. WorkBuddy user-level + connectors) render as one card while each server stays bound to its own file.
- Drag-to-reorder servers in the panel; ordering is display-only and never touches config files.
- BoardUI-style panel adapted to the settings page: vertical layout, sticky section headers, collapsible groups, status/agent filters, back-to-top button, light/dark theme following the host.
- Per-source config path override and custom source registration.
- Settings sidebar entry with a dedicated icon.
- Full regression suite (`npm test`) running against a temporary HOME.

### Fixed

- Invalid server input (bad names, non-http URLs, malformed JSON) is rejected with a specific error code.
- Empty (0-byte) placeholder config files are treated as "no servers" instead of raising a parse error.
- Opening the host folder reports a readable error instead of throwing when the source is unknown.
