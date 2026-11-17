import { mkdir, readFile, writeFile, rename, readdir, stat, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
const MAX_BACKUPS = 100;
function managerDir() {
  return join(process.env.DSH_HOME || join(homedir(), ".dsh"), "mcp-manager");
}
function statePath() {
  return join(managerDir(), "state.json");
}
function backupsDir() {
  return join(managerDir(), "backups");
}
function backupIndexPath() {
  return join(backupsDir(), "index.json");
}
const EMPTY_STATE = { version: 1, disabled: {}, rootOverrides: {}, customSources: [], order: {} };
let cached = null;
async function atomicWrite(file, content) {
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, content, "utf8");
  await rename(tmp, file);
}
async function loadState(force = false) {
  try {
    const info = await stat(statePath());
    if (!force && cached && cached.mtimeMs === info.mtimeMs) return cached.state;
  } catch {
    if (cached && !force) return cached.state;
  }
  let state = EMPTY_STATE;
  try {
    const parsed = JSON.parse(await readFile(statePath(), "utf8"));
    state = {
      version: 1,
      disabled: parsed.disabled && typeof parsed.disabled === "object" ? parsed.disabled : {},
      rootOverrides: parsed.rootOverrides && typeof parsed.rootOverrides === "object" ? parsed.rootOverrides : {},
      customSources: Array.isArray(parsed.customSources) ? parsed.customSources : [],
      order: parsed.order && typeof parsed.order === "object" ? parsed.order : {}
    };
  } catch {
  }
  try {
    const info = await stat(statePath());
    cached = { state, mtimeMs: info.mtimeMs };
  } catch {
    cached = { state, mtimeMs: 0 };
  }
  return state;
}
async function saveState(next) {
  await mkdir(managerDir(), { recursive: true });
  await atomicWrite(statePath(), JSON.stringify(next, null, 2));
  cached = null;
  await loadState(true);
}
async function updateState(mutate) {
  const state = await loadState();
  const next = {
    version: 1,
    disabled: { ...state.disabled },
    rootOverrides: { ...state.rootOverrides },
    customSources: [...state.customSources],
    order: { ...state.order }
  };
  mutate(next);
  await saveState(next);
  return next;
}
async function listBackups() {
  try {
    const parsed = JSON.parse(await readFile(backupIndexPath(), "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
async function makeBackup(sourceKey, sourceLabel, targetPath, reason) {
  let content;
  try {
    content = await readFile(targetPath, "utf8");
  } catch {
    return null;
  }
  await mkdir(backupsDir(), { recursive: true });
  const id = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const file = join(backupsDir(), `${id}.bak`);
  await writeFile(file, content, "utf8");
  const entry = {
    id,
    sourceKey,
    sourceLabel,
    file,
    targetPath,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    reason,
    size: Buffer.byteLength(content)
  };
  const index = [entry, ...await listBackups()].slice(0, MAX_BACKUPS);
  const dropped = (await listBackups()).slice(MAX_BACKUPS - 1);
  for (const old of dropped) {
    if (!index.some((e) => e.id === old.id)) await rm(old.file, { force: true }).catch(() => {
    });
  }
  await atomicWrite(backupIndexPath(), JSON.stringify(index, null, 2));
  return entry;
}
async function removeBackupEntry(id) {
  const index = await listBackups();
  const target = index.find((e) => e.id === id);
  await atomicWrite(backupIndexPath(), JSON.stringify(index.filter((e) => e.id !== id), null, 2));
  if (target) await rm(target.file, { force: true }).catch(() => {
  });
}
async function pruneBackupsForSource(sourceKey) {
  const index = await listBackups();
  const keep = index.filter((e) => e.sourceKey !== sourceKey);
  const drop = index.filter((e) => e.sourceKey === sourceKey);
  await atomicWrite(backupIndexPath(), JSON.stringify(keep, null, 2));
  for (const entry of drop) await rm(entry.file, { force: true }).catch(() => {
  });
}
export {
  backupsDir,
  listBackups,
  loadState,
  makeBackup,
  managerDir,
  pruneBackupsForSource,
  readdir,
  removeBackupEntry,
  saveState,
  statePath,
  updateState
};
