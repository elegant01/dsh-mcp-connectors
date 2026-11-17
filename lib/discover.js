import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
const MCP_FILE_NAME = /^(mcp|mcp_config|mcpServers|mcpservers|cline_mcp_settings|mcp_settings|roo_mcp_settings)\.jsonc?$/i;
const MAYBE_FILE_NAME = /^(settings|config|opencode)\.json$/i;
const TOML_FILE_NAME = /^config\.toml$/i;
const BACKUP_FILE = /\.(bak|backup|old|tmp|moved)[-.0-9a-z]*(\.json|\.toml)?$|\.json\.bak/i;
const SKIP_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  ".cache",
  ".npm",
  ".yarn",
  ".pnpm-store",
  ".bun",
  ".vscode",
  ".vscode-shared",
  ".codegraph",
  ".docker",
  ".ssh",
  ".gnupg",
  ".gem",
  ".rustup",
  ".local",
  ".Trash",
  ".VirtualBox",
  ".MUMUVMM",
  ".pagefile-backup.txt",
  ".chrome-debug-profile",
  ".chrome-pool",
  ".chromium-browser-snapshots",
  ".cdp-browser",
  "logs",
  "log",
  "backups",
  "backup",
  ".dsh",
  ".dify-canvas",
  ".agent-acta",
  ".knowledge-center-context",
  ".lbdb",
  ".mavis",
  ".qdranttext",
  ".venv-html-to-docx",
  "extensions",
  "skills-marketplace",
  "connectors-marketplace",
  "memory",
  "sessions",
  ".viminfo",
  "go",
  ".GoLand2019.2"
]);
const CANDIDATE_REL_PATHS = [
  "mcp.json",
  "mcp.jsonc",
  "mcp_config.json",
  "mcpservers.json",
  "mcpServers.json",
  "cline_mcp_settings.json",
  "roo_mcp_settings.json",
  "mcp_settings.json",
  "settings.json",
  "config.json",
  "opencode.json",
  "config.toml",
  join("mcp", "mcp_settings.json"),
  join("mcp", "mcp.json"),
  join("User", "mcp.json"),
  join("connectors", "default", "mcp.json"),
  join("config", "mcp_config.json"),
  join("windsurf", "mcp_config.json")
];
const MAX_READ_BYTES = 2 << 20;
function makeKey(prefix, path) {
  const hash = createHash("sha1").update(path.toLowerCase()).digest("hex").slice(0, 6);
  return `${prefix}-${hash}`;
}
const GENERIC_CONTAINERS = /* @__PURE__ */ new Set([".config", "config"]);
const LABEL_ALIASES = { code: "VS Code", traecn: "Trae CN" };
function prettifyLabel(dirName, file) {
  const stripped = dirName.replace(/^[.]+/, "") || dirName;
  const lower = stripped.toLowerCase();
  if (LABEL_ALIASES[lower]) return LABEL_ALIASES[lower];
  if (GENERIC_CONTAINERS.has(dirName.toLowerCase()) && file) {
    const parent = file.replace(/[\\/][^\\/]+$/, "").split(/[\\/]/).pop();
    if (parent) return parent;
  }
  return stripped;
}
async function classifyJson(path, name) {
  if (MCP_FILE_NAME.test(name)) {
    try {
      const text = await readFile(path, "utf8");
      if (!text.trim()) return "json-mcpServers";
      const parsed = JSON.parse(text.replace(/^﻿/, ""));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        if (parsed.mcp && typeof parsed.mcp === "object" && !parsed.mcpServers) return "json-mcp";
      }
    } catch {
    }
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
    } catch {
    }
  }
  return null;
}
async function classifyToml(path, name) {
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
async function probeAgentDir(dir, containerLabel, emit) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (BACKUP_FILE.test(entry.name)) continue;
      if (!MCP_FILE_NAME.test(entry.name) && !MAYBE_FILE_NAME.test(entry.name) && !TOML_FILE_NAME.test(entry.name)) continue;
      await emit(join(dir, entry.name), entry.name, containerLabel);
    }
  } catch {
  }
  for (const rel of CANDIDATE_REL_PATHS) {
    const file = join(dir, rel);
    try {
      const info = await stat(file);
      if (!info.isFile()) continue;
    } catch {
      continue;
    }
    const name = rel.split(/[\\/]/).pop();
    await emit(file, name, containerLabel);
  }
}
async function discoverSources(coveredPaths) {
  const found = [];
  const seen = new Set(coveredPaths);
  const home = homedir();
  const emit = async (file, name, containerLabel) => {
    const normalized = file.toLowerCase();
    if (seen.has(normalized)) return;
    const format = await classifyJson(file, name) ?? await classifyToml(file, name);
    if (!format) return;
    seen.add(normalized);
    found.push({
      key: makeKey("auto", file),
      label: prettifyLabel(containerLabel, file),
      path: file,
      format
    });
  };
  const env = process.env;
  const roots = [home];
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
  const scannedRoots = /* @__PURE__ */ new Set();
  const pending = [];
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
        if (root === home && !entry.name.startsWith(".")) continue;
        pending.push(() => probeAgentDir(join(root, entry.name), entry.name, emit));
      } else if (entry.isFile() && root === home) {
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
export {
  discoverSources
};
