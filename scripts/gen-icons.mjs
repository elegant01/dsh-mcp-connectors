// 把 assets/agent-icons/ 下的品牌 SVG 内联成 src/agent-icons.ts。
// 图标来源:@lobehub/icons 静态包（经 agent-acta 本地化，已拷贝进本仓库 assets/agent-icons/，
//   本插件不再依赖 agent-acta 目录）；单色图标用 currentColor 跟随主题。
// 用法:node scripts/gen-icons.mjs [svg源目录，默认 assets/agent-icons]
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const VENDOR = process.argv[2] || fileURLToPath(new URL("../assets/agent-icons", import.meta.url));

// source key -> svg 文件名(与 agent-acta/page/shared.js 的 AGENT_ICONS 对齐)
const MAP = {
  dsh: "deepseek-harness-whale.svg",
  claude: "claudecode-color.svg",
  codex: "codex-color.svg",
  cursor: "cursor.svg",
  gemini: "gemini-color.svg",
  antigravity: "google-color.svg",
  qwen: "qwen-color.svg",
  kimicode: "kimi.svg",
  atomcode: "logo-AtomGit-G-red.svg",
  codearts: "huawei-color.svg",
  codeartswork: "huawei-color.svg",
  opencode: "opencode.svg",
  windsurf: "windsurf.svg",
  trae: "trae-color.svg",
  traecn: "trae-color.svg",
  qoder: "qoder-color.svg",
  codebuddy: "codebuddy-color.svg",
  codebuddycn: "codebuddy-color.svg",
  workbuddy: "workbuddy-color.svg",
  factory: "droid.svg",
  openclaw: "openclaw-color.svg",
  roo: "cline.svg",
  ccswitch: "cline.svg",
};

// 兜底:roo / ccswitch / 自定义来源用通用插头图标(currentColor,手绘)
const FALLBACK = `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 1.5v3M10 1.5v3M4 4.5h8v3a4 4 0 0 1-8 0v-3zM8 11.5v3"/></svg>`;

function normalize(svg) {
  return svg
    .replace(/<\?xml[^>]*\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<svg([^>]*)>/, (m, attrs) => {
      const cleaned = attrs
        .replace(/\s(width|height)="[^"]*"/g, "")
        .replace(/\s+/g, " ")
        .trim();
      return `<svg ${cleaned} width="1em" height="1em" aria-hidden="true" style="vertical-align:-0.15em">`;
    })
    .trim();
}

const out = [
  "// 本文件由 scripts/gen-icons.mjs 生成,请勿手改。图标来自 agent-acta vendor/svg(@lobehub/icons)。",
  "export const AGENT_ICONS: Record<string, string> = {",
];
for (const [key, file] of Object.entries(MAP)) {
  const raw = await readFile(join(VENDOR, file), "utf8");
  out.push(`  ${JSON.stringify(key)}: ${JSON.stringify(normalize(raw))},`);
}
out.push(`  fallback: ${JSON.stringify(normalize(FALLBACK))},`);
out.push("};");
out.push("");

await writeFile(new URL("../src/agent-icons.ts", import.meta.url), out.join("\n"), "utf8");
console.log(`agent-icons.ts generated (${Object.keys(MAP).length} icons + fallback)`);
