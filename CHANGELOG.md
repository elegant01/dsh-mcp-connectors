# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/), versions use [SemVer](https://semver.org/).

## [Unreleased]

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
