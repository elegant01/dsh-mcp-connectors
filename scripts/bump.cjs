// 一次性版本号同步脚本（package.json + lockfile + CHANGELOG）。用 node scripts/bump.cjs 0.1.1
const fs = require("node:fs");
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || "")) {
  console.error("usage: node scripts/bump.cjs <x.y.z>");
  process.exit(1);
}
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const prev = pkg.version;
pkg.version = version;
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");

const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
lock.version = version;
if (lock.packages && lock.packages[""]) lock.packages[""].version = version;
fs.writeFileSync("package-lock.json", JSON.stringify(lock, null, 2) + "\n");

const today = new Date().toISOString().slice(0, 10);
for (const [file, heading] of [["CHANGELOG.md", "## ["], ["CHANGELOG.zh-CN.md", "## ["]]) {
  let text = fs.readFileSync(file, "utf8");
  const marker = "## [Unreleased]\n";
  const idx = text.indexOf(marker);
  const entry = `\n## [${version}] - ${today}\n\n### 变更\n\n- （待补充）\n`;
  if (idx >= 0) {
    text = text.slice(0, idx + marker.length) + entry + text.slice(idx + marker.length);
    fs.writeFileSync(file, text);
  }
  void heading;
}
console.log(`${prev} -> ${version}`);
