import { appendFile, rename, rm, stat } from "node:fs/promises";
import {
  snapshot,
  setServerEnabled,
  upsertServer,
  deleteServer,
  restoreBackup,
  deleteBackup,
  setRootPath,
  addCustomSource,
  removeCustomSource,
  openFolder,
  setOrder,
  installCatalogServers,
  uninstallCatalogServers,
  managerDir
} from "./core.js";
import { fetchGitHubReadme, searchRegistry } from "./registry.js";
import { fetchRankingDetail, fetchRankings } from "./mcpso.js";
import { findWorkBuddyIcon, loadWorkBuddyCatalog, workbuddyStatus } from "./workbuddy.js";
import { fetchQoderDetail, loadQoderCatalog } from "./qoder.js";
import { fetchTraeReadme, loadTraeCatalog } from "./trae.js";
import { checkReachability } from "./reachability.js";
import { join } from "node:path";
const name = "mcp-manager";
const inject = ["connection"];
const CLIENT_MARKER_HEADER = "x-dsh-mcp-connectors";
const MAX_LOG_BYTES = 1 << 20;
function logPath() {
  return join(managerDir(), "mcp-manager.log");
}
function makeLog() {
  const file = logPath();
  let queue = Promise.resolve();
  return async (event, detail) => {
    queue = queue.then(async () => {
      try {
        const current = await stat(file).catch(() => null);
        if (current && current.size >= MAX_LOG_BYTES) {
          await rm(`${file}.1`, { force: true });
          await rename(file, `${file}.1`);
        }
        await appendFile(file, `${JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), event, detail })}
`, "utf8");
      } catch {
      }
    });
    await queue;
  };
}
async function readJsonBody(request, limit = 4 << 20) {
  const text = await request.text();
  if (Buffer.byteLength(text) > limit) {
    const error = new Error("body too large");
    error.statusCode = 413;
    error.code = "error.proto.bodyTooLarge";
    throw error;
  }
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    const error = new Error("invalid JSON body");
    error.statusCode = 400;
    error.code = "error.proto.invalidJson";
    throw error;
  }
}
function validateMutationRequest(req) {
  const marker = req.headers.get(CLIENT_MARKER_HEADER);
  if (marker !== "1") return { statusCode: 403, code: "error.proto.forbidden", error: "forbidden mutation request" };
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      const reqHost = req.headers.get("host") || new URL(req.url).host;
      if (originHost !== reqHost) {
        return { statusCode: 403, code: "error.proto.forbidden", error: "forbidden cross-origin mutation request" };
      }
    } catch {
      return { statusCode: 403, code: "error.proto.forbidden", error: "forbidden origin" };
    }
  }
  const contentType = String(req.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") return { statusCode: 415, code: "error.proto.contentType", error: "content-type must be application/json" };
  return null;
}
function jsonResponse(code, payload, headOnly = false) {
  const body = JSON.stringify(payload);
  return new Response(headOnly ? null : body, {
    status: code,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "content-length": String(Buffer.byteLength(body))
    }
  });
}
async function runFetch(task, headOnly = false) {
  try {
    const r = await task();
    if (r && typeof r === "object" && "ok" in r && r.ok === false) {
      return jsonResponse(400, r, headOnly);
    }
    return jsonResponse(200, { ok: true, data: r }, headOnly);
  } catch (caught) {
    const e = caught;
    const status = Number.isInteger(e && e.statusCode) ? e.statusCode : 500;
    return jsonResponse(status, {
      ok: false,
      ...e && typeof e.code === "string" ? { code: e.code } : {},
      error: String(e && e.message ? e.message : e)
    }, headOnly);
  }
}
function apply(ctx) {
  const log = makeLog();
  let mutationQueue = Promise.resolve();
  const enqueueMutation = (task) => {
    const queued = mutationQueue.then(task, task);
    mutationQueue = queued.catch(() => void 0);
    return queued;
  };
  const API_PREFIX = "/api/dsh-mcp-connectors";
  void checkReachability().catch(() => void 0);
  const handlePost = (req, action) => {
    const mutationError = validateMutationRequest(req);
    if (mutationError) {
      return Promise.resolve(jsonResponse(mutationError.statusCode, { ok: false, code: mutationError.code, error: mutationError.error }));
    }
    return runFetch(async () => {
      const body = await readJsonBody(req);
      return enqueueMutation(() => action(body));
    });
  };
  const routes = [
    {
      path: `${API_PREFIX}/state`,
      methods: ["GET", "HEAD"],
      fetch: (req) => runFetch(() => snapshot(), req.method === "HEAD")
    },
    {
      // 只读：代理官方 MCP Registry 搜索（固定域名 + 10 分钟缓存 + 游标分页）
      path: `${API_PREFIX}/catalog/search`,
      methods: ["GET"],
      fetch: (req) => runFetch(() => {
        let q = "";
        let cursor = "";
        try {
          const url = new URL(req.url);
          q = url.searchParams.get("q") ?? "";
          cursor = url.searchParams.get("cursor") ?? "";
        } catch {
        }
        return searchRegistry(q, cursor || void 0);
      })
    },
    {
      // 只读：目录来源可达性（断外网时前端隐藏「在线发现」「mcp.so 热门」Tab）
      path: `${API_PREFIX}/catalog/reachability`,
      methods: ["GET"],
      fetch: () => runFetch(() => checkReachability())
    },
    {
      // 只读：按需抓取仓库 README（只允许 github.com，固定转到 raw.githubusercontent.com）
      path: `${API_PREFIX}/catalog/readme`,
      methods: ["GET"],
      fetch: (req) => runFetch(async () => {
        let repo = "";
        try {
          repo = new URL(req.url).searchParams.get("repo") ?? "";
        } catch {
        }
        const readme = await fetchGitHubReadme(repo);
        if (!readme) {
          const error = new Error("\u6CA1\u6709\u627E\u5230\u8BE5\u4ED3\u5E93\u7684 README\uFF08\u6216\u4E0D\u662F GitHub \u4ED3\u5E93\uFF09");
          error.statusCode = 404;
          error.code = "error.catalog.readme";
          throw error;
        }
        return readme;
      })
    },
    {
      // 只读：mcp.so 热门 Top 100（只抓排行榜页，遵守 robots.txt 不碰 /search）
      path: `${API_PREFIX}/catalog/rankings`,
      methods: ["GET"],
      fetch: () => runFetch(() => fetchRankings())
    },
    {
      // 只读：mcp.so 详情页（按需解析 mcpServers 配置，支持一键安装）
      path: `${API_PREFIX}/catalog/ranking-detail`,
      methods: ["GET"],
      fetch: (req) => runFetch(async () => {
        let slug = "";
        try {
          slug = new URL(req.url).searchParams.get("slug") ?? "";
        } catch {
        }
        if (!slug) {
          const error = new Error("\u7F3A\u5C11 slug \u53C2\u6570");
          error.statusCode = 400;
          error.code = "error.catalog.slug";
          throw error;
        }
        return fetchRankingDetail(slug);
      })
    },
    {
      // 只读：WorkBuddy 连接器本地图标（只读 icons 目录，文件名做严格校验）
      path: `${API_PREFIX}/catalog/workbuddy/icon`,
      methods: ["GET"],
      fetch: async (req) => {
        let name2 = "";
        try {
          name2 = new URL(req.url).searchParams.get("name") ?? "";
        } catch {
        }
        const icon = await findWorkBuddyIcon(name2);
        if (!icon) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
        return new Response(new Uint8Array(icon.data), {
          status: 200,
          headers: {
            "content-type": icon.contentType,
            "cache-control": "public, max-age=86400"
          }
        });
      }
    },
    {
      // 只读：本机 WorkBuddy 连接器市场是否可用（没装 WorkBuddy 时面板不显示来源）
      path: `${API_PREFIX}/catalog/workbuddy/status`,
      methods: ["GET"],
      fetch: () => runFetch(() => workbuddyStatus())
    },
    {
      // 只读：本机 WorkBuddy 连接器列表
      path: `${API_PREFIX}/catalog/workbuddy`,
      methods: ["GET"],
      fetch: () => runFetch(() => loadWorkBuddyCatalog())
    },
    {
      // 只读：Qoder 官方连接器市场目录（公开接口 + 30 分钟缓存 + 断网快照）
      path: `${API_PREFIX}/catalog/qoder`,
      methods: ["GET"],
      fetch: () => runFetch(() => loadQoderCatalog())
    },
    {
      // 只读：Qoder 连接器详情（安装表单与"能否直接写回"的判定都在这里）
      path: `${API_PREFIX}/catalog/qoder/detail`,
      methods: ["GET"],
      fetch: (req) => runFetch(async () => {
        let id = "";
        try {
          id = new URL(req.url).searchParams.get("id") ?? "";
        } catch {
        }
        if (!id) {
          const error = new Error("\u7F3A\u5C11 id \u53C2\u6570");
          error.statusCode = 400;
          error.code = "error.catalog.qoderId";
          throw error;
        }
        return fetchQoderDetail(id);
      })
    },
    {
      // 只读：TraeWork 内置 MCP 市场目录（公开接口 + 30 分钟缓存 + 断网快照）
      path: `${API_PREFIX}/catalog/trae`,
      methods: ["GET"],
      fetch: () => runFetch(() => loadTraeCatalog())
    },
    {
      // 只读：TraeWork 市场条目 README（只允许市场自己的 direct-download 地址）
      path: `${API_PREFIX}/catalog/trae/readme`,
      methods: ["GET"],
      fetch: (req) => runFetch(async () => {
        let id = "";
        try {
          id = new URL(req.url).searchParams.get("id") ?? "";
        } catch {
        }
        if (!id) {
          const error = new Error("\u7F3A\u5C11 id \u53C2\u6570");
          error.statusCode = 400;
          error.code = "error.catalog.traeId";
          throw error;
        }
        return fetchTraeReadme(id);
      })
    },
    {
      path: `${API_PREFIX}/catalog/install`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => installCatalogServers({
        name: String(b.name || ""),
        targets: Array.isArray(b.targets) ? b.targets : [],
        spec: b.spec && typeof b.spec === "object" ? b.spec : void 0
      }, log))
    },
    {
      path: `${API_PREFIX}/catalog/uninstall`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => uninstallCatalogServers({
        name: String(b.name || ""),
        targets: Array.isArray(b.targets) ? b.targets : []
      }, log))
    },
    {
      path: `${API_PREFIX}/enable`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => setServerEnabled(String(b.source || ""), String(b.name || ""), true, log))
    },
    {
      path: `${API_PREFIX}/disable`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => setServerEnabled(String(b.source || ""), String(b.name || ""), false, log))
    },
    {
      path: `${API_PREFIX}/upsert`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => upsertServer(b, log))
    },
    {
      path: `${API_PREFIX}/delete`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => deleteServer(String(b.source || ""), String(b.name || ""), log))
    },
    {
      path: `${API_PREFIX}/backup-restore`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => restoreBackup(String(b.id || ""), log))
    },
    {
      path: `${API_PREFIX}/backup-delete`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => deleteBackup(String(b.id || "")))
    },
    {
      path: `${API_PREFIX}/root-path`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => setRootPath(String(b.key || ""), b.path === void 0 || b.path === null ? null : String(b.path)))
    },
    {
      path: `${API_PREFIX}/open-folder`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => openFolder(String(b.source || "")))
    },
    {
      path: `${API_PREFIX}/reorder`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => setOrder(String(b.group || ""), Array.isArray(b.items) ? b.items : []))
    },
    {
      path: `${API_PREFIX}/custom-source-add`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => addCustomSource(String(b.label || ""), String(b.path || "")))
    },
    {
      path: `${API_PREFIX}/custom-source-remove`,
      methods: ["POST"],
      fetch: (req) => handlePost(req, (b) => removeCustomSource(String(b.key || "")))
    }
  ];
  const register = () => {
    if (ctx.connection?.fetch?.register) {
      const disposers = routes.map(
        (route) => ctx.connection.fetch.register({
          path: route.path,
          methods: route.methods,
          requestBody: "buffered",
          fetch: route.fetch
        })
      );
      return () => {
        for (const disposer of disposers) {
          try {
            disposer();
          } catch {
          }
        }
      };
    }
    ctx.logger?.warn?.("MCP Manager routes require authenticated connection.fetch");
    return () => {
    };
  };
  if (typeof ctx.effect === "function") {
    ctx.effect(register, "mcp-manager: API routes");
  } else {
    register();
  }
}
export {
  apply,
  inject,
  name
};
