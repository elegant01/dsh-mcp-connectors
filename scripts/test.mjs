// 全量回归：用临时 HOME 跑真实的插件核心逻辑，不碰用户真实配置。
// 覆盖：TOML 注释保留、JSONC 兼容、自动发现、启停、增删改、备份回退、排序、分组。
import { mkdir, writeFile, readFile, rm, cp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

const ROOT = join(tmpdir(), `dmm-test-${randomUUID().slice(0, 8)}`);
const HOME = join(ROOT, "home");
process.env.HOME = HOME;
process.env.USERPROFILE = HOME;
process.env.DSH_HOME = join(HOME, ".dsh");
process.env.APPDATA = join(ROOT, "appdata");
process.env.LOCALAPPDATA = join(ROOT, "localappdata");

let passed = 0;
const fails = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    fails.push({ name, err });
    console.log(`  ✗ ${name}\n    ${err.message}`);
  }
}

// ---------- 夹具 ----------
await mkdir(join(HOME, ".claude"), { recursive: true });
await writeFile(join(HOME, ".claude.json"), JSON.stringify({
  otherKey: { keep: true },
  mcpServers: {
    filesystem: { command: "npx", args: ["-y", "fs-server", "/tmp"], env: { A: "1" } },
    remote: { url: "https://example.com/mcp", headers: { Authorization: "Bearer x" }, note: "keepme" },
  },
}, null, 2));

await mkdir(join(HOME, ".codex"), { recursive: true });
await writeFile(join(HOME, ".codex", "config.toml"), [
  "# 注释必须保留",
  'model = "gpt-5"',
  "",
  "[mcp_servers.github]",
  'command = "npx"',
  'args = ["-y", "gh-server"]',
  'env = { GITHUB_TOKEN = "x" }',
  "",
  '[mcp_servers."weird name"]',
  'url = "http://localhost:8080/sse"',
  "",
  "[profiles.default]",
  'foo = "bar"',
  "",
].join("\n"));

await mkdir(join(HOME, ".cursor"), { recursive: true });
await writeFile(join(HOME, ".cursor", "mcp.json"), JSON.stringify({ mcpServers: { pg: { command: "docker", args: ["run", "pg"] } } }, null, 2));

// JSONC（注释 + 尾逗号）
await mkdir(join(HOME, ".vscode-jsonc"), { recursive: true });
await writeFile(join(HOME, ".vscode-jsonc", "mcp.json"), `{
  // 注释
  "mcpServers": {
    "a": { "command": "x" },
  }
}`);

// 空占位文件
await mkdir(join(HOME, ".gemini"), { recursive: true });
await writeFile(join(HOME, ".gemini", "settings.json"), "");

// 自动发现目标：清单外目录
await mkdir(join(HOME, ".someagent"), { recursive: true });
await writeFile(join(HOME, ".someagent", "mcp.json"), JSON.stringify({ mcpServers: { discoveredOne: { command: "dn" } } }, null, 2));

const core = await import("../lib/core.js");
const toml = await import("../lib/toml.js");
const discover = await import("../lib/discover.js");
const log = async () => {};

console.log("\n[TOML]");
await test("解析 [mcp_servers.*] 含引号名与 env", () => {
  const servers = toml.parseCodexServers([
    "[mcp_servers.github]",
    'command = "npx"',
    'args = ["-y", "g"]',
    'env = { TOKEN = "x" }',
    '[mcp_servers."weird name"]',
    'url = "http://x/sse"',
  ].join("\n"));
  assert.equal(servers.github.command, "npx");
  assert.deepEqual(servers.github.args, ["-y", "g"]);
  assert.deepEqual(servers.github.env, { TOKEN: "x" });
  assert.equal(servers["weird name"].url, "http://x/sse");
});

await test("重写节区保留注释与其它配置", () => {
  const before = '# c1\nmodel = "m"\n\n[mcp_servers.a]\ncommand = "x"\n\n[profiles.p]\nk = "v"\n';
  const after = toml.writeCodexServer(before, "a", '[mcp_servers.a]\ncommand = "y"');
  assert.ok(after.includes("# c1"));
  assert.ok(after.includes('model = "m"'));
  assert.ok(after.includes('command = "y"'));
  assert.ok(after.includes("[profiles.p]"));
  assert.ok(after.includes('k = "v"'));
});

await test("删除服务器只删对应节区", () => {
  const before = '[mcp_servers.a]\ncommand = "x"\n\n[mcp_servers.b]\ncommand = "y"\n';
  const after = toml.writeCodexServer(before, "a", null);
  assert.ok(!after.includes("mcp_servers.a"));
  assert.ok(after.includes("mcp_servers.b"));
});

await test("新增服务器追加到最后一个 mcp 节区之后", () => {
  const before = '[mcp_servers.a]\ncommand = "x"\n\n[profiles.p]\nk = "v"\n';
  const after = toml.writeCodexServer(before, "z", '[mcp_servers.z]\ncommand = "z"');
  assert.ok(after.indexOf("mcp_servers.z") < after.indexOf("[profiles.p]"));
});

console.log("\n[扫描]");
await test("snapshot 读取各来源", async () => {
  const snap = await core.snapshot();
  const byKey = Object.fromEntries(snap.sources.map((s) => [s.key, s]));
  assert.equal(byKey.claude.servers.length, 2);
  assert.ok(byKey.claude.servers.some((s) => s.name === "filesystem" && s.transport === "stdio"));
  assert.ok(byKey.claude.servers.some((s) => s.name === "remote" && s.transport === "http"));
  assert.equal(byKey.codex.servers.length, 2);
  assert.equal(byKey.cursor.servers.length, 1);
  assert.equal(snap.warnings.length, 0, "不应有解析警告");
});

await test("空占位配置文件不报错", async () => {
  const snap = await core.snapshot();
  const gemini = snap.sources.find((s) => s.key === "gemini");
  assert.ok(gemini);
  assert.equal(gemini.servers.length, 0);
  assert.equal(gemini.error, undefined);
});

await test("JSONC（注释/尾逗号）可解析", async () => {
  const items = await discover.discoverSources(new Set());
  const jsonc = items.find((i) => i.path.includes("vscode-jsonc"));
  assert.ok(jsonc, "应发现 JSONC 配置");
});

await test("自动发现清单外 agent", async () => {
  const items = await discover.discoverSources(new Set());
  assert.ok(items.some((i) => i.path.includes(".someagent")), "应发现 .someagent");
});

console.log("\n[启停与增删改]");
await test("停用后条目移出配置、进入停用列表", async () => {
  await core.setServerEnabled("claude", "filesystem", false, log);
  const snap = await core.snapshot();
  const claude = snap.sources.find((s) => s.key === "claude");
  const fs = claude.servers.find((s) => s.name === "filesystem");
  assert.equal(fs.enabled, false);
  const file = JSON.parse(await readFile(join(HOME, ".claude.json"), "utf8"));
  assert.equal(file.mcpServers.filesystem, undefined);
  assert.deepEqual(file.otherKey, { keep: true }, "其它键必须保留");
});

await test("重新启用写回配置", async () => {
  await core.setServerEnabled("claude", "filesystem", true, log);
  const file = JSON.parse(await readFile(join(HOME, ".claude.json"), "utf8"));
  assert.equal(file.mcpServers.filesystem.command, "npx");
  const snap = await core.snapshot();
  assert.equal(snap.sources.find((s) => s.key === "claude").servers.find((s) => s.name === "filesystem").enabled, true);
});

await test("Codex 停用/启用后注释仍在", async () => {
  await core.setServerEnabled("codex", "github", false, log);
  let text = await readFile(join(HOME, ".codex", "config.toml"), "utf8");
  assert.ok(!text.includes("mcp_servers.github"));
  assert.ok(text.includes("# 注释必须保留"));
  await core.setServerEnabled("codex", "github", true, log);
  text = await readFile(join(HOME, ".codex", "config.toml"), "utf8");
  assert.ok(text.includes("mcp_servers.github"));
  assert.ok(text.includes("# 注释必须保留"));
});

await test("新增服务器", async () => {
  const r = await core.upsertServer({ source: "cursor", name: "web", transport: "http", url: "https://a/b" }, log);
  assert.equal(r.ok, true);
  const file = JSON.parse(await readFile(join(HOME, ".cursor", "mcp.json"), "utf8"));
  assert.equal(file.mcpServers.web.url, "https://a/b");
});

await test("编辑服务器保留未识别字段", async () => {
  const snap = await core.snapshot();
  const remote = snap.sources.find((s) => s.key === "claude").servers.find((s) => s.name === "remote");
  // spec 对外是配置文件里的原始形状，未识别字段平铺在顶层
  assert.equal(remote.spec.note, "keepme");
  await core.upsertServer({ source: "claude", name: "remote", raw: JSON.stringify({ ...remote.spec, url: "https://b/c" }) }, log);
  const file = JSON.parse(await readFile(join(HOME, ".claude.json"), "utf8"));
  assert.equal(file.mcpServers.remote.url, "https://b/c");
  assert.equal(file.mcpServers.remote.note, "keepme");
});

await test("删除服务器", async () => {
  await core.deleteServer("cursor", "web", log);
  const file = JSON.parse(await readFile(join(HOME, ".cursor", "mcp.json"), "utf8"));
  assert.equal(file.mcpServers.web, undefined);
  assert.equal(file.mcpServers.pg.command, "docker");
});

await test("非法输入被拒绝", async () => {
  assert.equal((await core.upsertServer({ source: "cursor", name: "a/b", command: "x" }, log)).ok, false);
  assert.equal((await core.upsertServer({ source: "cursor", name: "x", transport: "http", url: "ftp://x" }, log)).ok, false);
  assert.equal((await core.upsertServer({ source: "cursor", name: "x", raw: "{bad" }, log)).ok, false);
});

console.log("\n[备份与回退]");
await test("每次写入前都有备份", async () => {
  const snap = await core.snapshot();
  assert.ok(snap.backups.length >= 5, `备份数应 >=5，实际 ${snap.backups.length}`);
  assert.ok(snap.backups.every((b) => b.size >= 0 && b.createdAt));
});

await test("回退恢复文件内容", async () => {
  const snap = await core.snapshot();
  const backup = snap.backups.find((b) => b.sourceKey === "cursor" && b.reason.includes("upsert web"));
  assert.ok(backup);
  await core.restoreBackup(backup.id, log);
  const file = JSON.parse(await readFile(join(HOME, ".cursor", "mcp.json"), "utf8"));
  assert.equal(file.mcpServers.web, undefined);
  assert.equal(file.mcpServers.pg.command, "docker");
});

await test("回退本身也会先备份", async () => {
  const snap = await core.snapshot();
  assert.ok(snap.backups.some((b) => b.reason.startsWith("pre-restore")));
});

console.log("\n[排序与分组]");
await test("排序持久化且不影响配置文件", async () => {
  const before = await readFile(join(HOME, ".claude.json"), "utf8");
  await core.setOrder("claude", ["claude/remote", "claude/filesystem"]);
  const snap = await core.snapshot();
  assert.deepEqual(snap.order.claude, ["claude/remote", "claude/filesystem"]);
  const after = await readFile(join(HOME, ".claude.json"), "utf8");
  assert.equal(before, after, "排序不得修改配置文件");
});

await test("WorkBuddy 两组配置共用一个 group", async () => {
  const sources = await import("../lib/sources.js");
  const wb = sources.BUILTIN_SOURCES.filter((s) => s.group === "workbuddy");
  assert.equal(wb.length, 2);
  assert.equal(wb[0].groupLabel, "WorkBuddy");
});

console.log("\n[打开文件夹]");
await test("路径不存在时返回错误而不是抛异常", async () => {
  const r = await core.openFolder("does-not-exist");
  assert.equal(r.ok, false);
});

// ---------- 收尾 ----------
await rm(ROOT, { recursive: true, force: true }).catch(() => {});
console.log(`\n结果：${passed} 通过，${fails.length} 失败`);
if (fails.length) process.exit(1);
