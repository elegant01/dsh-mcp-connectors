#!/usr/bin/env node
/**
 * 部署脚本：把本仓库构建产物原地同步进 DSH profile 的 node_modules。
 * 照 dsh-codearts/scripts/deploy.mjs 的形式：
 *   - 全部走 fs（二进制复制 / writeFileSync 无 BOM），避免 PowerShell 写文本带 BOM 把宿主搞崩；
 *   - 原地覆盖（不删目录重建），已加载模块靠 mtime 变化被捕获；
 *   - 不动 profile/package.json 里的版本钉 —— 本地内容不是从 registry 装的，
 *     改了钉但版本没发布的话，宿主重载 profile 时整个 bundle 会掉线。
 *
 * 用法：node scripts/deploy.mjs [profileDir] [--quiet]
 *   profileDir 默认 <用户目录>/.dsh/profiles/desktop
 */
import {
  existsSync, mkdirSync, readFileSync, copyFileSync, readdirSync, statSync, rmSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PACKAGE_ROOT_FILES = ["cordis.patch.yml", "package.json"];
const PACKAGE_DIRS = ["lib", "locale", "assets"];
const SOURCE_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

function defaultProfileDir() {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? homedir();
  return join(home, ".dsh", "profiles", "desktop");
}

function assertNoBom(path) {
  const b = readFileSync(path);
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) {
    throw new Error(`BOM detected in ${path} — 部署中止，请检查源文件`);
  }
}

function sameBytes(a, b) {
  if (statSync(a).size !== statSync(b).size) return false;
  return readFileSync(a).equals(readFileSync(b));
}

function syncTree(src, dst, stats) {
  if (!existsSync(dst)) mkdirSync(dst, { recursive: true });
  const names = new Set(readdirSync(src));
  for (const name of names) {
    const s = join(src, name);
    const d = join(dst, name);
    if (statSync(s).isDirectory()) {
      syncTree(s, d, stats);
      continue;
    }
    if (existsSync(d) && statSync(d).isFile() && sameBytes(s, d)) {
      stats.unchanged++;
      continue;
    }
    const existed = existsSync(d);
    copyFileSync(s, d);
    if (existed) stats.updated++;
    else stats.added++;
  }
  for (const name of readdirSync(dst)) {
    if (names.has(name)) continue;
    rmSync(join(dst, name), { recursive: true, force: true });
    stats.pruned++;
  }
}

export function deploy(options = {}) {
  const profileDir = options.profileDir ?? defaultProfileDir();
  const log = options.log ?? ((line) => { if (!options.quiet) console.log(line); });

  const pkg = JSON.parse(readFileSync(join(SOURCE_DIR, "package.json"), "utf8"));
  const pkgName = pkg.name ?? "dsh-mcp-connectors";

  if (!existsSync(join(SOURCE_DIR, "lib"))) {
    throw new Error("找不到构建产物 lib/ —— 先跑 npm run build");
  }
  log(`→ profile: ${profileDir}`);
  log(`→ 源目录: ${SOURCE_DIR}`);

  const packageDir = join(profileDir, "node_modules", pkgName);
  if (!existsSync(packageDir)) {
    throw new Error(`profile 里没装 ${pkgName}（${packageDir} 不存在）—— 先正常安装一次再谈本地部署`);
  }

  const files = { added: 0, updated: 0, unchanged: 0, pruned: 0 };
  for (const dir of PACKAGE_DIRS) {
    const src = join(SOURCE_DIR, dir);
    if (existsSync(src)) syncTree(src, join(packageDir, dir), files);
  }
  for (const name of PACKAGE_ROOT_FILES) {
    const s = join(SOURCE_DIR, name);
    if (!existsSync(s)) continue;
    const d = join(packageDir, name);
    assertNoBom(s);
    if (existsSync(d) && sameBytes(s, d)) {
      files.unchanged++;
      continue;
    }
    if (existsSync(d)) files.updated++;
    else files.added++;
    copyFileSync(s, d);
  }
  log(`✓ 包本体已同步: ${packageDir} (新增 ${files.added} / 覆盖 ${files.updated} / 未变 ${files.unchanged} / 清理 ${files.pruned})`);

  const pinned = JSON.parse(readFileSync(join(profileDir, "package.json"), "utf8")).dependencies?.[pkgName];
  if (pinned !== undefined && pinned !== pkg.version) {
    log(`· profile 依赖保持 ${pinned}（仓库版本 ${pkg.version} 只用于本地产物，发布后再由插件管理器更新）`);
  }
  return { profileDir, packageDir, version: pkg.version, files };
}

function main(argv) {
  const quiet = argv.includes("--quiet");
  const profileDir = argv.find((arg) => !arg.startsWith("--"));
  try {
    deploy({ profileDir: profileDir ?? defaultProfileDir(), quiet });
    if (!quiet) console.log("重启 DSH 即可。");
  } catch (error) {
    console.error(`部署失败: ${error.message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main(process.argv.slice(2));
