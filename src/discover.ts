// 自动发现本机的 MCP 配置文件。
// 思路：不靠写死的来源表，而是扫描用户主目录（及 %APPDATA% 的 IDE 用户目录），
// 按文件名与文件内容双重判据识别 MCP 配置：
//   - 文件名命中 mcp.json / mcp_config.json / cline_mcp_settings.json 等
//   - settings.json / config.json / opencode.json 顶层含 mcpServers 或 mcp 对象
//   - config.toml 含 [mcp_servers 节区
// 内置来源已覆盖的路径会被跳过（避免重复），其余以 auto- 前缀来源入列。

import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { SourceFormat } from "./types.js";

export interface DiscoveredSource {
  key: string;
  label: string;
  path: string;
  format: SourceFormat;
}

/** 明确是 MCP 配置的文件名（无需再看内容）。 */
const MCP_FILE_NAME = /^(mcp|mcp_config|mcpServers|mcpservers|cline_mcp_settings|mcp_settings|roo_mcp_settings)\.jsonc?$/i;
/** 需要读内容确认含 mcpServers/mcp 键的文件名。 */
const MAYBE_FILE_NAME = /^(settings|config|opencode)\.json$/i;
/** TOML 里查 [mcp_servers 节区。 */
const TOML_FILE_NAME = /^config\.toml$/i;
/** 备份/临时文件不收。 */
const BACKUP_FILE = /\.(bak|backup|old|tmp|moved)[-.0-9a-z]*(\.json|\.toml)?$|\.json\.bak/i;

/** 不扫的目录：依赖、缓存、虚拟机、以及和 MCP 无关的大目录。 */
const SKIP_DIRS = new Set([
  "node_modules", ".git", ".cache", ".npm", ".yarn", ".pnpm-store", ".bun",
  ".vscode", ".vscode-shared", ".codegraph", ".docker", ".ssh", ".gnupg", ".gem",
  ".rustup", ".local", ".Trash", ".VirtualBox", ".MUMUVMM", ".pagefile-backup.txt",
  ".chrome-debug-profile", ".chrome-pool", ".chromium-browser-snapshots", ".cdp-browser",
  "logs", "log", "backups", "backup", ".dsh", ".dify-canvas", ".agent-acta",
  ".knowledge-center-context", ".lbdb", ".mavis", ".qdranttext", ".venv-html-to-docx",
  "extensions", "skills-marketplace", "connectors-marketplace", "memory", "sessions",
  ".viminfo", "go", ".GoLand2019.2",
]);

/** 每个 agent 目录直接 stat 探测的候选相对路径（覆盖常见嵌套摆法，不做递归遍历）。 */
const CANDIDATE_REL_PATHS = [
  "mcp.json", "mcp.jsonc", "mcp_config.json", "mcpservers.json", "mcpServers.json",
  "cline_mcp_settings.json", "roo_mcp_settings.json", "mcp_settings.json",
  "settings.json", "config.json", "opencode.json", "config.toml",
  join("mcp", "mcp_settings.json"), join("mcp", "mcp.json"),
  join("User", "mcp.json"),
  join("connectors", "default", "mcp.json"),
  join("config", "mcp_config.json"),
  join("windsurf", "mcp_config.json"),
];

const MAX_READ_BYTES = 2 << 20;

function makeKey(prefix: string, path: string): string {
  const hash = createHash("sha1").update(path.toLowerCase()).digest("hex").slice(0, 6);
  return `${prefix}-${hash}`;
}

/** 通用容器目录：命中时改用文件上一级目录名做显示名（.config/opencode → "opencode"）。 */
const GENERIC_CONTAINERS = new Set([".config", "config"]);
/** 个别显示名别名（对齐常见叫法）。 */
const LABEL_ALIASES: Record<string, string> = { code: "VS Code", traecn: "Trae CN" };

function prettifyLabel(dirName: string, file?: string): string {
  const stripped = dirName.replace(/^[.]+/, "") || dirName;
  const lower = stripped.toLowerCase();
  if (LABEL_ALIASES[lower]) return LABEL_ALIASES[lower];
  if (GENERIC_CONTAINERS.has(dirName.toLowerCase()) && file) {
    const parent = file.replace(/[\\/][^\\/]+$/, "").split(/[\\/]/).pop();
    if (parent) return parent;
  }
  return stripped;
}

async function classifyJson(path: string, name: string): Promise<SourceFormat | null> {
  if (MCP_FILE_NAME.test(name)) {
    // 文件名已确定是 MCP 配置（空文件也算，0 字节占位很常见）；
    // 格式读不出来时按 mcpServers 猜，解析错误在视图层展示。
    try {
      const text = await readFile(path, "utf8");
      if (!text.trim()) return "json-mcpServers";
      const parsed = JSON.parse(text.replace(/^﻿/, ""));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        if (parsed.mcp && typeof parsed.mcp === "object" && !parsed.mcpServers) return "json-mcp";
      }
    } catch { /* 按默认格式 */ }
    return "json-mcpServers";
  }
  if (MAYBE_FILE_NAME.test(name)) {
    try {
      const info = await stat(path);
      if (info.size > MAX_READ_BYTES || info.size === 0) return null;
      const parsed = JSON.parse((await readFile(path, "utf8")).replace(/^﻿/, ""));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        if (parsed.mcpServers && typeof parsed.mcpServers === "object" && !Array.isArray(parsed.mcpServers)) return "json-mcpServers";
        if (parsed.mcp && typeof parsed.mcp === "object" && !Array.isArray(parsed.mcp)) return "json-mcp";
      }
    } catch { /* 读不了/不是 JSON 就不算 */ }
  }
  return null;
}

async function classifyToml(path: string, name: string): Promise<SourceFormat | null> {
  if (!TOML_FILE_NAME.test(name)) return null;
  try {
    const info = await stat(path);
    if (info.size > MAX_READ_BYTES) return null;
    const text = await readFile(path, "utf8");
    return text.includes("[mcp_servers") ? "toml-codex" : null;
  } catch {
    return null;
  }
}

/**
 * 探测单个 agent 目录：
 *  1) 根上一层 readdir，抓白名单文件名（mcp*.json、settings.json、config.toml 等）
 *  2) CANDIDATE_REL_PATHS 逐个 stat（覆盖 User/mcp.json、connectors/default/mcp.json 等嵌套摆法）
 * 不递归 —— 这是对齐 dsh-skills-manager 的速度做法：已知小目录直接查，不遍历全目录树。
 */
async function probeAgentDir(dir: string, containerLabel: string, emit: (file: string, name: string, label: string) => Promise<void>): Promise<void> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (BACKUP_FILE.test(entry.name)) continue;
      if (!MCP_FILE_NAME.test(entry.name) && !MAYBE_FILE_NAME.test(entry.name) && !TOML_FILE_NAME.test(entry.name)) continue;
      await emit(join(dir, entry.name), entry.name, containerLabel);
    }
  } catch { /* 目录读不了就当没有 */ }
  for (const rel of CANDIDATE_REL_PATHS) {
    const file = join(dir, rel);
    try {
      const info = await stat(file);
      if (!info.isFile()) continue;
    } catch {
      continue;
    }
    const name = rel.split(/[\\/]/).pop()!;
    await emit(file, name, containerLabel);
  }
}

/**
 * 扫描本机，返回内置表之外的 MCP 配置来源。
 * 扫描根按平台约定铺开（与 agent-acta 的 basesFor 同一套）：
 *   win32 → ~/<点目录>、%APPDATA%/<n>、%LOCALAPPDATA%/<n>
 *   darwin → ~/<点目录>、~/Library/Application Support/<n>、~/.config/<n>
 *   linux/其他 → ~/<点目录>、$XDG_CONFIG_HOME(默认 ~/.config)/<n>、~/.local/share/<n>
 * 判据只认内容（文件名白名单 + 顶层 mcpServers/mcp 键 + [mcp_servers 节区），不做兜底猜测。
 * @param coveredPaths 已被内置/自定义来源占用的绝对路径（小写归一化）
 */
export async function discoverSources(coveredPaths: Set<string>): Promise<DiscoveredSource[]> {
  const found: DiscoveredSource[] = [];
  const seen = new Set(coveredPaths);
  const home = homedir();

  const emit = async (file: string, name: string, containerLabel: string) => {
    const normalized = file.toLowerCase();
    if (seen.has(normalized)) return;
    const format = (await classifyJson(file, name)) ?? (await classifyToml(file, name));
    if (!format) return;
    seen.add(normalized);
    found.push({
      key: makeKey("auto", file),
      label: prettifyLabel(containerLabel, file),
      path: file,
      format,
    });
  };

  // 各平台候选根（与 agent-acta 的 basesFor 同一套）。agent 主目录是容器根的直接子目录。
  const env = process.env;
  const roots: string[] = [home];
  if (process.platform === "win32") {
    if (env.APPDATA) roots.push(env.APPDATA);
    if (env.LOCALAPPDATA) roots.push(env.LOCALAPPDATA);
  } else if (process.platform === "darwin") {
    roots.push(join(home, "Library", "Application Support"));
    roots.push(join(home, ".config"));
  } else {
    roots.push(env.XDG_CONFIG_HOME || join(home, ".config"));
    roots.push(join(home, ".local", "share"));
  }

  const scannedRoots = new Set<string>();
  /** I/O 密集的探测任务并发执行（限制并发，避免 syscall 洪峰）。 */
  const pending: Array<() => Promise<void>> = [];
  for (const root of roots) {
    const rootKey = root.toLowerCase();
    if (scannedRoots.has(rootKey)) continue;
    scannedRoots.add(rootKey);
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        // 主目录只扫点目录；其它容器根（APPDATA 等）目录名不带点
        if (root === home && !entry.name.startsWith(".")) continue;
        pending.push(() => probeAgentDir(join(root, entry.name), entry.name, emit));
      } else if (entry.isFile() && root === home) {
        // 主目录根上的配置文件，如 ~/.claude.json（只查一层，只查命中文件名的）
        if (MCP_FILE_NAME.test(entry.name) && !BACKUP_FILE.test(entry.name)) {
          await emit(join(home, entry.name), entry.name, entry.name.replace(/\.jsonc?$/i, ""));
        }
      }
    }
  }

  const CONCURRENCY = 16;
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    await Promise.all(pending.slice(i, i + CONCURRENCY).map((task) => task()));
  }

  return found;
}
