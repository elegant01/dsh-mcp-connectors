// 生成 README 截图用的预览页（真实组件 + 假数据），输出到 docs/preview.html。
// 仅开发工具，不参与 npm 发布。
import { build } from "esbuild";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";

const result = await build({
  entryPoints: ["scripts/preview-entry.ts"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  write: false,
  define: { "process.env.NODE_ENV": "\"production\"" },
  logLevel: "warning",
});
const js = result.outputFiles[0].text;

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"/><title>DSH MCP Connectors — 面板预览</title>
<style>html,body{margin:0;background:#fafafa;font-family:Inter,system-ui,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}#root{max-width:980px;margin:0 auto}</style>
</head>
<body><div id="root"></div><script>${js}</script></body></html>`;

const outDir = resolve("docs");
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, "preview.html"), html, "utf8");
console.log("docs/preview.html 已生成");
