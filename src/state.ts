// 管理器自身状态与备份存储：~/.dsh/mcp-manager/
//  - state.json: 停用的服务器、来源路径覆盖、自定义来源
//  - backups/:   每次写配置文件前的原始内容快照（带索引 backups/index.json）

import { mkdir, readFile, writeFile, rename, readdir, stat, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { BackupEntry, ManagerState } from "./types.js";

const MAX_BACKUPS = 100;

export function managerDir(): string {
  return join(process.env.DSH_HOME || join(homedir(), ".dsh"), "mcp-manager");
}

export function statePath(): string {
  return join(managerDir(), "state.json");
}

export function backupsDir(): string {
  return join(managerDir(), "backups");
}

function backupIndexPath(): string {
  return join(backupsDir(), "index.json");
}

const EMPTY_STATE: ManagerState = { version: 1, disabled: {}, rootOverrides: {}, customSources: [], order: {} };

let cached: { state: ManagerState; mtimeMs: number } | null = null;

async function atomicWrite(file: string, content: string): Promise<void> {
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, content, "utf8");
  await rename(tmp, file);
}

export async function loadState(force = false): Promise<ManagerState> {
  try {
    const info = await stat(statePath());
    if (!force && cached && cached.mtimeMs === info.mtimeMs) return cached.state;
  } catch {
    if (cached && !force) return cached.state;
  }
  let state = EMPTY_STATE;
  try {
    const parsed = JSON.parse(await readFile(statePath(), "utf8")) as Partial<ManagerState>;
    state = {
      version: 1,
      disabled: parsed.disabled && typeof parsed.disabled === "object" ? parsed.disabled : {},
      rootOverrides: parsed.rootOverrides && typeof parsed.rootOverrides === "object" ? parsed.rootOverrides : {},
      customSources: Array.isArray(parsed.customSources) ? parsed.customSources : [],
      order: parsed.order && typeof parsed.order === "object" ? parsed.order : {},
    };
  } catch {
    /* 状态缺失或损坏时按空状态运行，不覆盖原文件 */
  }
  try {
    const info = await stat(statePath());
    cached = { state, mtimeMs: info.mtimeMs };
  } catch {
    cached = { state, mtimeMs: 0 };
  }
  return state;
}

export async function saveState(next: ManagerState): Promise<void> {
  await mkdir(managerDir(), { recursive: true });
  await atomicWrite(statePath(), JSON.stringify(next, null, 2));
  cached = null;
  await loadState(true);
}

export async function updateState(mutate: (state: ManagerState) => void): Promise<ManagerState> {
  const state = await loadState();
  const next: ManagerState = {
    version: 1,
    disabled: { ...state.disabled },
    rootOverrides: { ...state.rootOverrides },
    customSources: [...state.customSources],
    order: { ...state.order },
  };
  mutate(next);
  await saveState(next);
  return next;
}

export async function listBackups(): Promise<BackupEntry[]> {
  try {
    const parsed = JSON.parse(await readFile(backupIndexPath(), "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 写配置前调用：把原始文件快照进 backups，返回登记条目。原始文件不存在时不备份，返回 null。 */
export async function makeBackup(sourceKey: string, sourceLabel: string, targetPath: string, reason: string): Promise<BackupEntry | null> {
  let content: string;
  try {
    content = await readFile(targetPath, "utf8");
  } catch {
    return null;
  }
  await mkdir(backupsDir(), { recursive: true });
  const id = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const file = join(backupsDir(), `${id}.bak`);
  await writeFile(file, content, "utf8");
  const entry: BackupEntry = {
    id,
    sourceKey,
    sourceLabel,
    file,
    targetPath,
    createdAt: new Date().toISOString(),
    reason,
    size: Buffer.byteLength(content),
  };
  const index = [entry, ...(await listBackups())].slice(0, MAX_BACKUPS);
  // 超出上限的最旧备份连文件一起清掉
  const dropped = (await listBackups()).slice(MAX_BACKUPS - 1);
  for (const old of dropped) {
    if (!index.some((e) => e.id === old.id)) await rm(old.file, { force: true }).catch(() => {});
  }
  await atomicWrite(backupIndexPath(), JSON.stringify(index, null, 2));
  return entry;
}

export async function removeBackupEntry(id: string): Promise<void> {
  const index = await listBackups();
  const target = index.find((e) => e.id === id);
  await atomicWrite(backupIndexPath(), JSON.stringify(index.filter((e) => e.id !== id), null, 2));
  if (target) await rm(target.file, { force: true }).catch(() => {});
}

export async function pruneBackupsForSource(sourceKey: string): Promise<void> {
  const index = await listBackups();
  const keep = index.filter((e) => e.sourceKey !== sourceKey);
  const drop = index.filter((e) => e.sourceKey === sourceKey);
  await atomicWrite(backupIndexPath(), JSON.stringify(keep, null, 2));
  for (const entry of drop) await rm(entry.file, { force: true }).catch(() => {});
}

export { readdir };
