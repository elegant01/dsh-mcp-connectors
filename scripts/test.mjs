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

// DSH：MCP 配置在 profile 的 cordis.patch.yml（插件条目），不是 ~/.dsh/mcp.json
const DSH_PROFILE = join(HOME, ".dsh", "profiles", "desktop");
const DSH_PATCH = join(DSH_PROFILE, "cordis.patch.yml");
const DSH_PATCH_TEXT = [
  "# DSH patch 注释必须保留",
  "- id: ui-settings",
  "  name: '@deepseek-ai/dsh-client-ui-settings'",
  "  config:",
  "    enabled: false",
  "",
  "- insert:",
  "    - id: mcp-dify",
  "      name: '@deepseek-ai/dsh-mcp-client'",
  "      config:",
  "        serverName: dify-canvas",
  "        transport: stdio",
  "        command: node",
  "        args:",
  "          - 'F:/x/index.mjs'",
  "        failOnStartupError: false",
  "",
  "- id: mcp-win",
  "  disabled: true",
  "  config:",
  "    serverName: windows",
  "    transport: stdio",
  "    command: 'C:\\tools\\w.exe'",
  '    args: [ serve, --exclude-tools, "App,PowerShell" ]',
  "    reconnect: { enabled: true, initialDelayMs: 500 }",
  "    env:",
  "      {",
  '        A: "false",',
  '        B: "1"',
  "      }",
  "",
  "- id: tail",
  "  name: other-plugin",
  "  config:",
  "    foo: bar",
  "",
].join("\n");
await mkdir(DSH_PROFILE, { recursive: true });
await writeFile(DSH_PATCH, DSH_PATCH_TEXT);

// WorkBuddy：官方连接器市场缓存（mcp.json + token-schema.json + cli.json）
const WB_ROOT = join(HOME, ".workbuddy", "connectors-marketplace");
await mkdir(join(WB_ROOT, ".codebuddy-connector"), { recursive: true });
await writeFile(join(WB_ROOT, ".codebuddy-connector", "connectors.json"), JSON.stringify({
  name: "test-connectors",
  connectors: [
    {
      id: "demo", name: "演示连接器", name_en: "Demo Connector", type: "mcp",
      description: "Demo MCP connector", description_zh: "演示 MCP 连接器",
      examples_zh: ["用演示连接器做点事"], examples_en: ["Do something with the demo connector"],
    },
    {
      id: "demo-cli", name: "演示 CLI", name_en: "Demo CLI", type: "cli",
      description: "Demo CLI connector", description_zh: "演示 CLI 连接器",
    },
  ],
}, null, 2));

await mkdir(join(WB_ROOT, "connectors", "demo"), { recursive: true });
await writeFile(join(WB_ROOT, "connectors", "demo", "mcp.json"), JSON.stringify({
  mcpServers: {
    "demo-srv": {
      type: "streamableHttp",
      url: "https://demo.example.com/mcp",
      headers: { "X-Demo-Key": "${DEMO_KEY}" },
      staticHeaders: { client: "WorkBuddy" },
      timeout: 30000,
      disabledTools: ["danger"],
    },
  },
}, null, 2));
await writeFile(join(WB_ROOT, "connectors", "demo", "token-schema.json"), JSON.stringify({
  docUrl: "https://demo.example.com/keys",
  docLabel: "获取 Demo Key",
  fields: [{ key: "DEMO_KEY", label: "Demo Key", type: "password", required: true, description: "演示密钥" }],
}, null, 2));

await mkdir(join(WB_ROOT, "connectors", "demo-cli"), { recursive: true });
await writeFile(join(WB_ROOT, "connectors", "demo-cli", "cli.json"), JSON.stringify({
  init: { win32: "npm i -g demo-cli" },
}, null, 2));

await mkdir(join(ROOT, "empty-home"), { recursive: true });

const core = await import("../lib/core.js");
const toml = await import("../lib/toml.js");
const cordis = await import("../lib/cordis.js");
const catalog = await import("../lib/catalog-data.js");
const registry = await import("../lib/registry.js");
const host = await import("../lib/index.js");
const mcpso = await import("../lib/mcpso.js");
const workbuddy = await import("../lib/workbuddy.js");
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

console.log("\n[DSH / cordis.patch.yml]");
await test("解析 insert 列表与顶层条目，识别原生 disabled", () => {
  const servers = cordis.parseCordisServers(DSH_PATCH_TEXT);
  assert.equal(servers["dify-canvas"].command, "node");
  assert.deepEqual(servers["dify-canvas"].args, ["F:/x/index.mjs"]);
  assert.equal(servers["dify-canvas"].extra.failOnStartupError, false);
  assert.equal(servers.windows.disabled, true);
  assert.equal(servers.windows.command, "C:\\tools\\w.exe");
  assert.deepEqual(servers.windows.env, { A: "false", B: "1" });
  assert.deepEqual(servers.windows.extra.reconnect, { enabled: true, initialDelayMs: 500 });
  assert.equal(servers.windows.extra.extra, undefined);
});

await test("重写 config 块保留注释、其它插件与未识别字段", () => {
  const after = cordis.writeCordisServer(DSH_PATCH_TEXT, "windows", { ...cordis.parseCordisServers(DSH_PATCH_TEXT).windows, disabled: undefined });
  assert.ok(after.includes("# DSH patch 注释必须保留"));
  assert.ok(after.includes("- id: tail"));
  assert.ok(after.includes("foo: bar"));
  assert.ok(!/^\s*disabled: true$/m.test(after), "启用后应移除 disabled 行");
  assert.ok(after.includes("initialDelayMs: 500"));
  const reparsed = cordis.parseCordisServers(after);
  assert.equal(reparsed.windows.disabled, undefined);
  assert.equal(reparsed.windows.command, "C:\\tools\\w.exe");
});

await test("停用只写 disabled: true，条目留在文件里", async () => {
  await core.setServerEnabled("dsh-profile-desktop", "dify-canvas", false, log);
  const text = await readFile(DSH_PATCH, "utf8");
  assert.ok(text.includes("serverName: 'dify-canvas'"), "停用不移除条目");
  const snap = await core.snapshot();
  const dsh = snap.sources.find((s) => s.key === "dsh-profile-desktop");
  assert.equal(dsh.servers.find((s) => s.name === "dify-canvas").enabled, false);
  assert.ok(text.includes("# DSH patch 注释必须保留"));
});

await test("启用清掉 disabled 且保留其它条目", async () => {
  await core.setServerEnabled("dsh-profile-desktop", "dify-canvas", true, log);
  const snap = await core.snapshot();
  const dsh = snap.sources.find((s) => s.key === "dsh-profile-desktop");
  assert.equal(dsh.servers.find((s) => s.name === "dify-canvas").enabled, true);
  const text = await readFile(DSH_PATCH, "utf8");
  assert.ok(text.includes("- id: tail"));
  assert.ok(text.includes("# DSH patch 注释必须保留"));
});

await test("新增服务器追加为 insert 条目", async () => {
  const r = await core.upsertServer({ source: "dsh-profile-desktop", name: "new-mcp", command: "npx", args: ["-y", "x"] }, log);
  assert.equal(r.ok, true);
  const text = await readFile(DSH_PATCH, "utf8");
  assert.ok(text.includes("- insert:"));
  assert.ok(text.includes("serverName: 'new-mcp'"));
  const snap = await core.snapshot();
  assert.equal(snap.sources.find((s) => s.key === "dsh-profile-desktop").servers.length, 3);
});

await test("编辑已有服务器保留 reconnect/env", async () => {
  const snap = await core.snapshot();
  const win = snap.sources.find((s) => s.key === "dsh-profile-desktop").servers.find((s) => s.name === "windows");
  await core.upsertServer({ source: "dsh-profile-desktop", name: "windows", raw: JSON.stringify({ ...win.spec, command: "C:\\tools\\w2.exe" }) }, log);
  const text = await readFile(DSH_PATCH, "utf8");
  assert.ok(text.includes("w2.exe"));
  assert.ok(text.includes("initialDelayMs: 500"));
  assert.ok(text.includes("B: '1'"));
});

await test("删除只移除目标条目", async () => {
  await core.deleteServer("dsh-profile-desktop", "new-mcp", log);
  const text = await readFile(DSH_PATCH, "utf8");
  assert.ok(!text.includes("new-mcp"));
  assert.ok(text.includes("serverName: 'windows'"));
  assert.ok(text.includes("- id: tail"));
});

await test("删除 insert 里最后一条时一并清掉空的 insert 块", () => {
  const before = [
    "- insert:",
    "    - id: mcp-only",
    "      name: '@deepseek-ai/dsh-mcp-client'",
    "      config:",
    "        serverName: only",
    "        transport: stdio",
    "        command: node",
    "",
    "- id: tail",
    "  name: other",
    "  config:",
    "    foo: bar",
    "",
  ].join("\n");
  const after = cordis.writeCordisServer(before, "only", null);
  assert.ok(!after.includes("insert:"));
  assert.ok(after.includes("- id: tail"));
  assert.ok(after.includes("foo: bar"));
  assert.equal(cordis.parseCordisServers(after).only, undefined);
});

console.log("\n[连接器目录]");
await test("内置目录覆盖官方 Reference Servers", () => {
  const ids = catalog.OFFICIAL_CATALOG.map((entry) => entry.id);
  for (const id of ["everything", "fetch", "filesystem", "git", "memory", "sequential-thinking", "time"]) {
    assert.ok(ids.includes(id), `缺少 ${id}`);
  }
  assert.ok(catalog.OFFICIAL_CATALOG.every((entry) => entry.command && entry.args.length));
});

await test("已安装识别：按名称或包名匹配", () => {
  const entry = catalog.OFFICIAL_CATALOG.find((item) => item.id === "filesystem");
  assert.equal(catalog.matchesCatalogEntry(entry, "filesystem", { command: "npx" }), true);
  assert.equal(catalog.matchesCatalogEntry(entry, "my-fs", {
    command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "F:/tmp"],
  }), true);
  assert.equal(catalog.matchesCatalogEntry(entry, "other", { command: "node", args: ["x"] }), false);
});

await test("MCP Registry 响应映射为安装条目", () => {
  const fixture = {
    servers: [
      {
        server: {
          name: "io.test/foo",
          title: "Foo Server",
          description: "test",
          version: "1.0.0",
          repository: { url: "https://github.com/test/foo", source: "github" },
          websiteUrl: "https://foo.test",
          packages: [{
            registryType: "npm",
            identifier: "@test/foo",
            transport: { type: "stdio" },
            runtimeArguments: [{ type: "positional", value: "-y" }],
            packageArguments: [{ type: "named", name: "--dir", value: "{data_dir}", variables: { data_dir: { description: "dir", isRequired: true } } }],
            environmentVariables: [{ name: "FOO_KEY", isRequired: true, description: "key", isSecret: true }],
          }],
        },
        _meta: { "io.modelcontextprotocol.registry/official": { isLatest: true } },
      },
      {
        server: { name: "io.test/remote", title: "Remote", description: "r", version: "1", remotes: [{ type: "streamable-http", url: "https://x/mcp" }] },
        _meta: { "io.modelcontextprotocol.registry/official": { isLatest: true } },
      },
      {
        server: { name: "io.test/old", title: "Old", version: "0.1", packages: [] },
        _meta: { "io.modelcontextprotocol.registry/official": { isLatest: false } },
      },
    ],
  };
  const entries = registry.mapRegistryPayload(fixture);
  assert.equal(entries.length, 2);
  const foo = entries.find((entry) => entry.registryName === "io.test/foo");
  assert.equal(foo.command, "npx");
  assert.deepEqual(foo.args.slice(0, 3), ["-y", "@test/foo", "--dir"]);
  assert.equal(foo.env.FOO_KEY, "{{FOO_KEY}}");
  assert.ok(foo.fields.some((field) => field.key === "FOO_KEY" && field.required && field.secret));
  assert.ok(foo.fields.some((field) => field.key === "pkg-data_dir"));
  assert.equal(foo.repository, "https://github.com/test/foo");
  assert.equal(foo.websiteUrl, "https://foo.test");
  const remote = entries.find((entry) => entry.registryName === "io.test/remote");
  assert.equal(remote.url, "https://x/mcp");
  assert.equal(remote.transport, "http");
});

await test("GitHub README 候选地址（仓库根 / tree / blob / 非 GitHub）", () => {
  const root = registry.githubReadmeCandidates("https://github.com/modelcontextprotocol/servers");
  assert.ok(root.includes("https://raw.githubusercontent.com/modelcontextprotocol/servers/HEAD/README.md"));
  const tree = registry.githubReadmeCandidates("https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem");
  assert.equal(tree[0], "https://raw.githubusercontent.com/modelcontextprotocol/servers/main/src/filesystem/README.md");
  const blob = registry.githubReadmeCandidates("https://github.com/a/b/blob/dev/docs/x.md");
  assert.equal(blob[0], "https://raw.githubusercontent.com/a/b/dev/docs/x.md");
  assert.deepEqual(registry.githubReadmeCandidates("https://evil.example.com/a/b"), []);
  assert.deepEqual(registry.githubReadmeCandidates("not a url"), []);
});

await test("目录模板展开：多行目录、可选参数、带连字符的字段", () => {
  const fsEntry = catalog.OFFICIAL_CATALOG.find((entry) => entry.id === "filesystem");
  assert.deepEqual(catalog.expandCatalogSpec(fsEntry, { dirs: "F:\\a\nF:\\b" }).args,
    ["-y", "@modelcontextprotocol/server-filesystem", "F:\\a", "F:\\b"]);

  const timeEntry = catalog.OFFICIAL_CATALOG.find((entry) => entry.id === "time");
  assert.deepEqual(catalog.expandCatalogSpec(timeEntry, {}).args, ["mcp-server-time"]);
  assert.deepEqual(catalog.expandCatalogSpec(timeEntry, { tz: "Asia/Shanghai" }).args,
    ["mcp-server-time", "--local-timezone=Asia/Shanghai"]);

  const memoryEntry = catalog.OFFICIAL_CATALOG.find((entry) => entry.id === "memory");
  assert.equal(catalog.expandCatalogSpec(memoryEntry, {}).env, undefined);
  assert.deepEqual(catalog.expandCatalogSpec(memoryEntry, { MEMORY_FILE_PATH: "F:/x/m.json" }).env,
    { MEMORY_FILE_PATH: "F:/x/m.json" });

  // registry 包参数里的变量名带连字符（pkg-data_dir），占位符必须能展开
  const registryEntry = {
    id: "x", title: "X", description: "", source: "registry", transport: "stdio",
    command: "npx", args: ["-y", "@test/x", "--dir", "{{pkg-data_dir}}"],
    fields: [{ key: "pkg-data_dir", label: "dir", required: true }],
  };
  assert.deepEqual(catalog.expandCatalogSpec(registryEntry, { "pkg-data_dir": "F:/d" }).args,
    ["-y", "@test/x", "--dir", "F:/d"]);
});

await test("一键安装到多个 Agent，卸载后复原", async () => {
  const spec = { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "F:/tmp"], env: { A: "1" } };
  const result = await core.installCatalogServers({ name: "catalog-fs", targets: ["claude", "dsh-profile-desktop"], spec }, log);
  assert.equal(result.results.length, 2);
  assert.ok(result.results.every((item) => item.ok !== false), JSON.stringify(result.results));

  const snap = await core.snapshot();
  const claude = snap.sources.find((source) => source.key === "claude").servers.find((server) => server.name === "catalog-fs");
  assert.equal(claude.spec.command, "npx");
  const dsh = snap.sources.find((source) => source.key === "dsh-profile-desktop").servers.find((server) => server.name === "catalog-fs");
  if (process.platform === "win32") {
    // DSH 的 mcp-client 直接 spawn，Windows 上 npx 需要 cmd /c
    assert.equal(dsh.spec.command, "cmd");
    assert.deepEqual(dsh.spec.args.slice(0, 3), ["/c", "npx", "-y"]);
  } else {
    assert.equal(dsh.spec.command, "npx");
  }

  const removed = await core.uninstallCatalogServers({ name: "catalog-fs", targets: ["claude", "dsh-profile-desktop"] }, log);
  assert.ok(removed.results.every((item) => item.ok !== false), JSON.stringify(removed.results));
  const after = await core.snapshot();
  assert.ok(!after.sources.find((source) => source.key === "claude").servers.some((server) => server.name === "catalog-fs"));
  assert.ok(!after.sources.find((source) => source.key === "dsh-profile-desktop").servers.some((server) => server.name === "catalog-fs"));
});

await test("host 路由：catalog install/uninstall 走写接口门禁", async () => {
  const routes = new Map();
  host.apply({
    connection: { fetch: { register(route) { routes.set(route.path, route); return () => {}; } } },
  });
  const install = routes.get("/api/dsh-mcp-connectors/catalog/install");
  const uninstall = routes.get("/api/dsh-mcp-connectors/catalog/uninstall");
  assert.ok(install && uninstall);
  assert.ok(routes.get("/api/dsh-mcp-connectors/catalog/search"));
  assert.ok(routes.get("/api/dsh-mcp-connectors/catalog/readme"));
  assert.ok(routes.get("/api/dsh-mcp-connectors/catalog/rankings"));
  assert.ok(routes.get("/api/dsh-mcp-connectors/catalog/ranking-detail"));
  assert.ok(routes.get("/api/dsh-mcp-connectors/catalog/workbuddy"));
  assert.ok(routes.get("/api/dsh-mcp-connectors/catalog/workbuddy/status"));

  const makeRequest = (path, body, headers = {}) => new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-dsh-mcp-connectors": "1", origin: "http://localhost", ...headers },
    body: JSON.stringify(body),
  });

  const denied = await install.fetch(makeRequest("/api/dsh-mcp-connectors/catalog/install", {}, { "x-dsh-mcp-connectors": "" }));
  assert.equal(denied.status, 403);

  const installed = await install.fetch(makeRequest("/api/dsh-mcp-connectors/catalog/install", {
    name: "route-fs",
    targets: ["claude"],
    spec: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "F:/x"] },
  }));
  const installPayload = await installed.json();
  assert.equal(installed.status, 200);
  assert.equal(installPayload.data.results[0].ok, true);

  const removed = await uninstall.fetch(makeRequest("/api/dsh-mcp-connectors/catalog/uninstall", {
    name: "route-fs", targets: ["claude"],
  }));
  const uninstallPayload = await removed.json();
  assert.equal(uninstallPayload.data.results[0].ok, true);
  const snap = await core.snapshot();
  assert.ok(!snap.sources.find((source) => source.key === "claude").servers.some((server) => server.name === "route-fs"));
});

await test("目录安装拒绝非法名称", async () => {
  const result = await core.installCatalogServers({ name: "a/b", targets: ["claude"], spec: { command: "x" } }, log);
  assert.equal(result.ok, false);
});

console.log("\n[mcp.so 排行榜]");
await test("解析排行榜 SSR HTML", () => {
  const html = [
    '<a class="x" href="/zh/servers/playwright-mcp"><span class="flex tabular-nums">1</span>',
    '<img src="https://a/b.png?x=1&amp;y=2"/>',
    '<h3>Playwright &amp; MCP</h3><span class="text-muted-foreground x">microsoft</span>',
    '<p>Playwright MCP server</p><span>月搜 12.1K</span>',
    '<span><svg class="lucide lucide-star"></svg>34.8K</span><div class="bg-secondary/60 text">84</div></a>',
    '<a href="/zh/servers/foo"><span class="tabular-nums">2</span><h3>Foo</h3>',
    '<p>Desc &amp; more</p><div class="bg-secondary/60">15</div></a>',
    '<a href="/zh/servers/not-ranked"><h3>No rank</h3></a>',
  ].join("");
  const items = mcpso.parseRankingsHtml(html);
  assert.equal(items.length, 2);
  assert.equal(items[0].rank, 1);
  assert.equal(items[0].title, "Playwright & MCP");
  assert.equal(items[0].author, "microsoft");
  assert.equal(items[0].monthlySearches, "12.1K");
  assert.equal(items[0].stars, "34.8K");
  assert.equal(items[0].score, "84");
  assert.equal(items[0].iconUrl, "https://a/b.png?x=1&y=2");
  assert.equal(items[0].url, "https://mcp.so/zh/servers/playwright-mcp");
  assert.equal(items[1].title, "Foo");
});

await test("解析详情页 mcpServers 配置与凭据占位符", () => {
  const html = [
    '<script type="application/ld+json">{"@type":"SoftwareApplication","name":"Demo Server","description":"Demo desc"}</script>',
    '<pre><code>{ &quot;mcpServers&quot;: { &quot;demo&quot;: { &quot;command&quot;: &quot;npx&quot;, ',
    '&quot;args&quot;: [&quot;-y&quot;, &quot;@demo/server&quot;, &quot;--token&quot;, &quot;YOUR_DEMO_TOKEN&quot;], ',
    '&quot;env&quot;: { &quot;DEMO_KEY&quot;: &quot;${DEMO_KEY}&quot; }, ',
    '&quot;headers&quot;: { &quot;Authorization&quot;: &quot;Bearer YOUR_AUTH_TOKEN&quot; } } } }</code></pre>',
    '<a href="https://github.com/chatmcp/mcp-directory">noise</a>',
    '<a href="https://github.com/demo/demo-server">repo</a>',
  ].join("");
  const detail = mcpso.parseRankingDetail(html, "demo");
  assert.equal(detail.title, "Demo Server");
  assert.equal(detail.description, "Demo desc");
  assert.equal(detail.repository, "https://github.com/demo/demo-server");
  assert.equal(detail.installable, true);
  assert.equal(detail.command, "npx");
  assert.deepEqual(detail.args, ["-y", "@demo/server", "--token", "{{TOKEN}}"]);
  assert.deepEqual(detail.env, { DEMO_KEY: "{{DEMO_KEY}}" });
  assert.deepEqual(detail.headers, { Authorization: "Bearer {{AUTHORIZATION}}" });
  const keys = detail.fields.map((field) => field.key).sort();
  assert.deepEqual(keys, ["AUTHORIZATION", "DEMO_KEY", "TOKEN"]);
  assert.ok(detail.fields.every((field) => field.required && field.secret));
});

await test("详情页缓存命中时不联网", async () => {
  const dir = join(HOME, ".dsh", "mcp-manager", "catalog-cache", "mcpso-details");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "cached-slug.json"), JSON.stringify({
    fetchedAt: new Date().toISOString(),
    detail: { id: "cached-slug", url: "https://mcp.so/zh/servers/cached-slug", title: "Cached Detail", installable: true, command: "npx", fields: [] },
  }));
  const detail = await mcpso.fetchRankingDetail("cached-slug");
  assert.equal(detail.title, "Cached Detail");
  assert.equal(detail.installable, true);
});

await test("排行榜缓存命中时不联网", async () => {
  const dir = join(HOME, ".dsh", "mcp-manager", "catalog-cache");
  await mkdir(dir, { recursive: true });
  const fetchedAt = new Date().toISOString();
  await writeFile(join(dir, "mcpso-rankings.json"), JSON.stringify({
    fetchedAt,
    source: "https://mcp.so/zh/rankings/servers",
    items: [{ rank: 1, id: "cached", title: "Cached", url: "https://mcp.so/zh/servers/cached" }],
  }));
  const payload = await mcpso.fetchRankings();
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].title, "Cached");
  assert.equal(payload.stale, false);
});

console.log("\n[WorkBuddy 连接器]");
await test("没装 WorkBuddy 时来源不可用", async () => {
  const home = process.env.HOME;
  const profile = process.env.USERPROFILE;
  process.env.HOME = join(ROOT, "empty-home");
  process.env.USERPROFILE = join(ROOT, "empty-home");
  try {
    const status = await workbuddy.workbuddyStatus();
    assert.equal(status.available, false);
    assert.equal(status.count, 0);
  } finally {
    process.env.HOME = home;
    process.env.USERPROFILE = profile;
  }
});

await test("映射本机市场：MCP 可安装、CLI 仅展示", async () => {
  const catalog = await workbuddy.loadWorkBuddyCatalog();
  assert.equal(catalog.available, true);
  assert.equal(catalog.count, 2);
  assert.equal(catalog.installable, 1);

  const demo = catalog.items.find((item) => item.id === "connector:demo");
  assert.ok(demo);
  assert.equal(demo.source, "workbuddy");
  assert.equal(demo.transport, "http");
  assert.equal(demo.installTarget, "workbuddy-connectors");
  // WorkBuddy 保留 ${VAR} 占位符，凭据由 WorkBuddy 的 key store 注入，插件不落明文
  assert.deepEqual(demo.headers, { "X-Demo-Key": "${DEMO_KEY}", client: "WorkBuddy" });
  assert.equal(demo.extra.timeout, 30000);
  assert.deepEqual(demo.extra.disabledTools, ["danger"]);
  assert.deepEqual(demo.examples, ["用演示连接器做点事"]);
  assert.deepEqual(demo.fields, []);
  assert.ok(demo.warning.includes("DEMO_KEY"));
  assert.equal(demo.docUrl, "https://demo.example.com/keys");

  const cli = catalog.items.find((item) => item.id === "cli:demo-cli");
  assert.ok(cli);
  assert.equal(cli.installable, false);
});

await test("展开 WorkBuddy 模板并安装到 workbuddy-connectors", async () => {
  const wbCatalog = await workbuddy.loadWorkBuddyCatalog();
  const demo = wbCatalog.items.find((item) => item.id === "connector:demo");
  const spec = catalog.expandCatalogSpec(demo, {});
  assert.equal(spec.headers["X-Demo-Key"], "${DEMO_KEY}");
  assert.equal(spec.headers.client, "WorkBuddy");
  assert.equal(spec.extra.timeout, 30000);

  const installed = await core.installCatalogServers({
    name: demo.id, targets: ["workbuddy-connectors"], spec,
  }, log);
  assert.equal(installed.results[0].ok, true);
  const file = JSON.parse(await readFile(join(HOME, ".workbuddy", "connectors", "default", "mcp.json"), "utf8"));
  assert.equal(file.mcpServers["connector:demo"].headers["X-Demo-Key"], "${DEMO_KEY}");
  assert.equal(file.mcpServers["connector:demo"].timeout, 30000);
  assert.deepEqual(file.mcpServers["connector:demo"].disabledTools, ["danger"]);

  await core.uninstallCatalogServers({ name: demo.id, targets: ["workbuddy-connectors"] }, log);
  const after = JSON.parse(await readFile(join(HOME, ".workbuddy", "connectors", "default", "mcp.json"), "utf8"));
  assert.equal(after.mcpServers["connector:demo"], undefined);
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
