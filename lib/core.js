import { readFile, writeFile, rename, access, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { BUILTIN_SOURCES, customSourceDef } from "./sources.js";
import { discoverSources } from "./discover.js";
import { parseCodexServers, serializeServerToml, writeCodexServer } from "./toml.js";
import { listBackups, loadState, makeBackup, managerDir, removeBackupEntry, updateState } from "./state.js";
function fail(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  throw error;
}
function expandPath(input) {
  let out = input.trim();
  if (out.startsWith("~/") || out === "~") out = join(homedir(), out.slice(1));
  return out.replace(/%([^%]+)%/g, (_, name) => process.env[name] ?? `%${name}%`).replace(/\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, braced, plain) => process.env[braced ?? plain] ?? "");
}
let discoveredCache = null;
const DISCOVER_TTL_MS = 3e4;
async function discoveredSources(coveredPaths) {
  if (discoveredCache && Date.now() - discoveredCache.at < DISCOVER_TTL_MS) {
    return discoveredCache.items.filter((item) => !coveredPaths.has(item.path.toLowerCase()));
  }
  let items = [];
  try {
    items = await discoverSources(coveredPaths);
  } catch {
  }
  discoveredCache = { at: Date.now(), items };
  return items;
}
async function resolveSources() {
  const state = await loadState();
  const out = [];
  for (const def of BUILTIN_SOURCES) {
    const override = state.rootOverrides[def.key];
    if (override) {
      out.push({ def, path: expandPath(override), overridden: true });
      continue;
    }
    let found = null;
    for (const candidate of def.paths) {
      try {
        await access(expandPath(candidate));
        found = expandPath(candidate);
        break;
      } catch {
      }
    }
    out.push({ def, path: found ?? expandPath(def.paths[0]), overridden: false });
  }
  for (const custom of state.customSources) {
    out.push({
      def: customSourceDef(custom.key, custom.label, custom.path),
      path: expandPath(custom.path),
      overridden: false
    });
  }
  const covered = new Set(
    out.filter((s) => s.path).map((s) => s.path.replace(/\//g, "\\").toLowerCase())
  );
  for (const item of await discoveredSources(covered)) {
    out.push({
      def: { key: item.key, label: item.label, format: item.format, paths: [item.path], writable: true, discovered: true },
      path: item.path,
      overridden: false
    });
  }
  return out;
}
async function findSource(key) {
  const sources = await resolveSources();
  const hit = sources.find((s) => s.def.key === key);
  if (!hit) fail(404, "error.source.unknown", `\u672A\u77E5\u914D\u7F6E\u6765\u6E90: ${key}`);
  return hit;
}
function normalizeSpec(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const obj = raw;
  const spec = {};
  if (typeof obj.command === "string") spec.command = obj.command;
  if (Array.isArray(obj.args)) spec.args = obj.args.map(String);
  if (obj.env && typeof obj.env === "object" && !Array.isArray(obj.env)) {
    spec.env = Object.fromEntries(Object.entries(obj.env).map(([k, v]) => [k, String(v)]));
  }
  if (typeof obj.url === "string") spec.url = obj.url;
  if (typeof obj.serverUrl === "string" && !spec.url) spec.url = obj.serverUrl;
  if (obj.headers && typeof obj.headers === "object" && !Array.isArray(obj.headers)) {
    spec.headers = Object.fromEntries(Object.entries(obj.headers).map(([k, v]) => [k, String(v)]));
  }
  const extra = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!["command", "args", "env", "url", "serverUrl", "headers", "disabled", "enabled"].includes(k)) extra[k] = v;
  }
  if (Object.keys(extra).length) spec.extra = extra;
  return spec;
}
function transportOf(spec) {
  if (spec.url) return /sse/i.test(spec.url) ? "sse" : "http";
  const t = spec.extra?.type ?? spec.extra?.transport;
  if (t === "sse" || t === "http" || t === "stdio") return t;
  return "stdio";
}
function summarize(spec) {
  if (spec.url) return spec.url;
  const cmd = [spec.command, ...spec.args ?? []].filter(Boolean).join(" ");
  return cmd || "\uFF08\u7A7A\u5B9A\u4E49\uFF09";
}
function stripJsonComments(text) {
  let out = "";
  let inString = false;
  let quote = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += next ?? "";
        i++;
      } else if (ch === quote) {
        inString = false;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
      continue;
    }
    out += ch;
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}
function parseJsonLenient(text) {
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(stripJsonComments(text));
  }
}
function extractServers(def, text) {
  if (!text.trim()) return {};
  if (def.format === "toml-codex") return parseCodexServers(text);
  const parsed = parseJsonLenient(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail(422, "error.config.shape", "\u914D\u7F6E\u6587\u4EF6\u9876\u5C42\u5FC5\u987B\u662F JSON \u5BF9\u8C61");
  }
  const table = def.format === "json-mcp" ? parsed.mcp : parsed.mcpServers;
  if (table === void 0 || table === null) return {};
  if (typeof table !== "object" || Array.isArray(table)) {
    fail(422, "error.config.shape", "\u670D\u52A1\u5668\u8868\u5FC5\u987B\u662F\u5BF9\u8C61");
  }
  const out = {};
  for (const [name, raw] of Object.entries(table)) {
    out[name] = normalizeSpec(raw);
  }
  return out;
}
async function readSourceText(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}
async function buildSourceView(entry, warnings) {
  const { def, path, overridden } = entry;
  const state = await loadState();
  const view = {
    key: def.key,
    label: def.label,
    path,
    exists: false,
    writable: def.writable,
    format: def.format,
    overridden,
    discovered: def.discovered === true,
    group: def.group,
    groupLabel: def.groupLabel,
    servers: []
  };
  if (!path) return view;
  const text = await readSourceText(path);
  if (text === null) return view;
  view.exists = true;
  let servers;
  try {
    servers = extractServers(def, text);
  } catch (caught) {
    const e = caught;
    view.error = e.message;
    warnings.push({ code: e.code ?? "error.config.parse", error: `${def.label}: ${e.message}` });
    return view;
  }
  view.servers = Object.entries(servers).map(([name, spec]) => ({
    name,
    transport: transportOf(spec),
    summary: summarize(spec),
    spec: denormalizeSpec(spec),
    enabled: true
  }));
  for (const [compound, spec] of Object.entries(state.disabled)) {
    const slash = compound.indexOf("/");
    if (compound.slice(0, slash) !== def.key) continue;
    const name = compound.slice(slash + 1);
    if (view.servers.some((s) => s.name === name)) continue;
    view.servers.push({
      name,
      transport: transportOf(spec),
      summary: summarize(spec),
      spec: denormalizeSpec(spec),
      enabled: false
    });
  }
  view.servers.sort((a, b) => a.name.localeCompare(b.name));
  return view;
}
async function snapshot() {
  const warnings = [];
  const sources = await resolveSources();
  const views = [];
  for (const entry of sources) {
    views.push(await buildSourceView(entry, warnings));
  }
  const backups = await listBackups();
  const state = await loadState();
  return {
    sources: views.filter((v) => v.exists || v.servers.length > 0 || v.overridden || v.error),
    backups,
    warnings,
    order: state.order ?? {}
  };
}
async function setOrder(groupKey, items) {
  if (!groupKey || groupKey.length > 128) {
    return { ok: false, code: "error.proto.invalidParams", error: "group \u65E0\u6548" };
  }
  const list = Array.isArray(items) ? items.filter((item) => typeof item === "string" && item.length <= 256).slice(0, 500) : [];
  await updateState((state) => {
    state.order = { ...state.order, [groupKey]: list };
  });
  return { ok: true };
}
function denormalizeSpec(spec) {
  const out = { ...spec.extra ?? {} };
  if (spec.command !== void 0) out.command = spec.command;
  if (spec.args !== void 0) out.args = spec.args;
  if (spec.env && Object.keys(spec.env).length) out.env = spec.env;
  if (spec.url !== void 0) out.url = spec.url;
  if (spec.headers && Object.keys(spec.headers).length) out.headers = spec.headers;
  return out;
}
async function writeServers(def, path, enabled) {
  await mkdir(dirname(path), { recursive: true });
  if (def.format === "toml-codex") {
    let text2 = await readSourceText(path) ?? "";
    const current = parseCodexServers(text2);
    for (const name of Object.keys(current)) {
      if (!(name in enabled)) text2 = writeCodexServer(text2, name, null);
    }
    for (const [name, spec] of Object.entries(enabled)) {
      text2 = writeCodexServer(text2, name, serializeServerToml(name, spec));
    }
    await atomicWriteFile(path, text2);
    return;
  }
  const tableKey = def.format === "json-mcp" ? "mcp" : "mcpServers";
  let doc = {};
  const text = await readSourceText(path);
  if (text !== null && text.trim()) {
    try {
      const parsed = parseJsonLenient(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) doc = parsed;
    } catch {
      fail(422, "error.config.parse", `\u539F\u914D\u7F6E\u4E0D\u662F\u5408\u6CD5 JSON\uFF0C\u62D2\u7EDD\u5199\u5165: ${path}`);
    }
  }
  const table = {};
  for (const [name, spec] of Object.entries(enabled)) table[name] = denormalizeSpec(spec);
  doc[tableKey] = table;
  await atomicWriteFile(path, JSON.stringify(doc, null, 2) + "\n");
}
async function atomicWriteFile(path, content) {
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, content, "utf8");
  await rename(tmp, path);
}
async function mutateSource(key, log, reason, mutate) {
  const { def, path } = await findSource(key);
  if (!path) return { ok: false, code: "error.source.missing", error: `\u6765\u6E90\u6CA1\u6709\u53EF\u7528\u8DEF\u5F84: ${key}` };
  if (!def.writable) return { ok: false, code: "error.source.readonly", error: `\u6765\u6E90\u4E0D\u5141\u8BB8\u5199\u5165: ${def.label}` };
  const text = await readSourceText(path);
  let enabled = {};
  if (text !== null) {
    enabled = extractServers(def, text);
  }
  await mutate(enabled, { label: def.label });
  await makeBackup(def.key, def.label, path, reason);
  await writeServers(def, path, enabled);
  await log("write", { source: key, reason });
  return { ok: true };
}
async function setServerEnabled(sourceKey, name, enabledFlag, log) {
  if (!enabledFlag) {
    const { def } = await findSource(sourceKey);
    const result2 = await mutateSource(sourceKey, log, `disable ${name}`, async (enabled) => {
      const spec2 = enabled[name];
      if (!spec2) fail(404, "error.server.notFound", `\u670D\u52A1\u5668\u4E0D\u5B58\u5728: ${name}`);
      delete enabled[name];
      await updateState((state2) => {
        state2.disabled[`${def.key}/${name}`] = spec2;
      });
    });
    return result2;
  }
  const state = await loadState();
  const compound = `${sourceKey}/${name}`;
  const spec = state.disabled[compound];
  if (!spec) return { ok: false, code: "error.server.notDisabled", error: `\u670D\u52A1\u5668\u4E0D\u5728\u505C\u7528\u5217\u8868: ${name}` };
  const result = await mutateSource(sourceKey, log, `enable ${name}`, async (enabled) => {
    if (enabled[name]) fail(409, "error.server.conflict", `\u540C\u540D\u670D\u52A1\u5668\u5DF2\u5B58\u5728: ${name}`);
    enabled[name] = spec;
  });
  if (result.ok) {
    await updateState((s) => {
      delete s.disabled[compound];
    });
  }
  return result;
}
async function upsertServer(input, log) {
  const sourceKey = String(input.source || "");
  const name = String(input.name || "").trim();
  if (!sourceKey) return { ok: false, code: "error.proto.invalidParams", error: "\u7F3A\u5C11 source" };
  if (!/^[^\s/\\]{1,64}$/.test(name)) {
    return { ok: false, code: "error.server.name", error: `\u670D\u52A1\u5668\u540D\u65E0\u6548\uFF081-64 \u5B57\u7B26\uFF0C\u4E0D\u542B\u7A7A\u767D\u4E0E\u659C\u6760\uFF09: ${name}` };
  }
  let spec;
  if (typeof input.raw === "string" && input.raw.trim()) {
    try {
      spec = normalizeSpec(JSON.parse(input.raw));
    } catch {
      return { ok: false, code: "error.server.raw", error: "JSON \u5B9A\u4E49\u4E0D\u662F\u5408\u6CD5 JSON" };
    }
  } else {
    spec = {};
    const transport = input.transport === "http" || input.transport === "sse" ? input.transport : "stdio";
    if (transport === "stdio") {
      if (!input.command || !String(input.command).trim()) {
        return { ok: false, code: "error.server.command", error: "stdio \u7C7B\u578B\u5FC5\u987B\u586B\u5199 command" };
      }
      spec.command = String(input.command).trim();
      if (Array.isArray(input.args) && input.args.length) spec.args = input.args.map(String);
      if (input.env && Object.keys(input.env).length) spec.env = input.env;
    } else {
      if (!input.url || !/^https?:\/\//.test(String(input.url))) {
        return { ok: false, code: "error.server.url", error: "http/sse \u7C7B\u578B\u5FC5\u987B\u586B\u5199 http(s) URL" };
      }
      spec.url = String(input.url).trim();
      if (input.headers && Object.keys(input.headers).length) spec.headers = input.headers;
    }
  }
  const result = await mutateSource(sourceKey, log, `upsert ${name}`, async (enabled) => {
    enabled[name] = spec;
  });
  if (result.ok) {
    await updateState((s) => {
      delete s.disabled[`${sourceKey}/${name}`];
    });
  }
  return result;
}
async function deleteServer(sourceKey, name, log) {
  await updateState((s) => {
    delete s.disabled[`${sourceKey}/${name}`];
  });
  return mutateSource(sourceKey, log, `delete ${name}`, async (enabled) => {
    if (!(name in enabled)) {
      return;
    }
    delete enabled[name];
  });
}
async function restoreBackup(id, log) {
  const backups = await listBackups();
  const entry = backups.find((b) => b.id === id);
  if (!entry) return { ok: false, code: "error.backup.notFound", error: `\u5907\u4EFD\u4E0D\u5B58\u5728: ${id}` };
  let content;
  try {
    content = await readFile(entry.file, "utf8");
  } catch {
    return { ok: false, code: "error.backup.missing", error: `\u5907\u4EFD\u6587\u4EF6\u4E22\u5931: ${entry.file}` };
  }
  await makeBackup(entry.sourceKey, entry.sourceLabel, entry.targetPath, `pre-restore ${id}`);
  await mkdir(dirname(entry.targetPath), { recursive: true });
  await atomicWriteFile(entry.targetPath, content);
  await log("restore", { id, target: entry.targetPath });
  return { ok: true };
}
async function deleteBackup(id) {
  await removeBackupEntry(id);
  return { ok: true };
}
async function setRootPath(key, path) {
  if (!BUILTIN_SOURCES.some((s) => s.key === key)) {
    return { ok: false, code: "error.source.unknown", error: `\u672A\u77E5\u914D\u7F6E\u6765\u6E90: ${key}` };
  }
  if (path !== null) {
    const expanded = expandPath(path);
    try {
      await access(expanded);
    } catch {
      return { ok: false, code: "error.rootPath.notFound", error: `\u8DEF\u5F84\u4E0D\u5B58\u5728: ${expanded}` };
    }
  }
  await updateState((s) => {
    if (path === null) delete s.rootOverrides[key];
    else s.rootOverrides[key] = path.trim();
  });
  return { ok: true };
}
async function addCustomSource(label, path) {
  const expanded = expandPath(path);
  try {
    await access(expanded);
  } catch {
    return { ok: false, code: "error.rootPath.notFound", error: `\u8DEF\u5F84\u4E0D\u5B58\u5728: ${expanded}` };
  }
  const key = `custom-${randomUUID().slice(0, 8)}`;
  await updateState((s) => {
    if (s.customSources.length >= 32) fail(400, "error.customSource.limit", "\u81EA\u5B9A\u4E49\u6765\u6E90\u6570\u91CF\u5DF2\u8FBE\u4E0A\u9650: 32");
    s.customSources.push({ key, label: label.trim() || expanded, path: expanded });
  });
  return { ok: true, key };
}
async function removeCustomSource(key) {
  await updateState((s) => {
    s.customSources = s.customSources.filter((c) => c.key !== key);
  });
  return { ok: true };
}
async function openFolder(sourceKey) {
  let resolved;
  try {
    resolved = await findSource(sourceKey);
  } catch (caught) {
    const e = caught;
    return { ok: false, code: e.code ?? "error.source.unknown", error: e.message };
  }
  const { path } = resolved;
  if (!path) return { ok: false, code: "error.source.missing", error: `\u6765\u6E90\u6CA1\u6709\u53EF\u7528\u8DEF\u5F84: ${sourceKey}` };
  const dir = dirname(path);
  try {
    await access(dir);
  } catch {
    return { ok: false, code: "error.folder.missing", error: `\u76EE\u5F55\u4E0D\u5B58\u5728: ${dir}` };
  }
  const cmd = process.platform === "win32" ? "explorer.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  try {
    const child = spawn(cmd, [dir], { detached: true, stdio: "ignore" });
    child.on("error", () => {
    });
    child.unref();
  } catch (caught) {
    const e = caught;
    return { ok: false, code: "error.openFolder", error: e.message };
  }
  return { ok: true };
}
export {
  addCustomSource,
  deleteBackup,
  deleteServer,
  expandPath,
  managerDir,
  openFolder,
  removeCustomSource,
  restoreBackup,
  setOrder,
  setRootPath,
  setServerEnabled,
  snapshot,
  upsertServer
};
