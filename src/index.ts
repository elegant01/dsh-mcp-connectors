// dsh-mcp-connectors host half：设置面板的 HTTP 后端（connection.fetch 路由）
// - 路由：状态快照、启停、增删改、备份回退、来源路径覆盖、自定义来源
// - 写接口要求自定义头 + JSON content-type + 同源 Origin，借用宿主 connection.admit / owner 门禁
// - 所有写操作串行（enqueueMutation），写配置前必备份

import { appendFile, rename, rm, stat } from "node:fs/promises";
import type { CodedError, Log, ServerInput } from "./types.js";
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
  managerDir,
} from "./core.js";
import { join } from "node:path";

interface HostContext {
  connection?: {
    fetch?: {
      register(route: {
        path: string;
        methods: string[];
        requestBody?: "buffered" | "streaming";
        fetch: (request: Request) => Promise<Response>;
      }): () => void;
    };
  };
  logger?: { warn?: (msg: string) => void; info?: (msg: string) => void };
  effect?: (fn: () => () => void, label?: string) => void;
}

const name = "mcp-manager";
const inject = ["connection"];
const CLIENT_MARKER_HEADER = "x-dsh-mcp-connectors";
const MAX_LOG_BYTES = 1 << 20;

function logPath(): string {
  return join(managerDir(), "mcp-manager.log");
}

function makeLog(): Log {
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
        await appendFile(file, `${JSON.stringify({ ts: new Date().toISOString(), event, detail })}\n`, "utf8");
      } catch { /* 日志失败不阻塞主流程 */ }
    });
    await queue;
  };
}

async function readJsonBody(request: Request, limit = 4 << 20): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (Buffer.byteLength(text) > limit) {
    const error: CodedError = new Error("body too large");
    error.statusCode = 413;
    error.code = "error.proto.bodyTooLarge";
    throw error;
  }
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    const error: CodedError = new Error("invalid JSON body");
    error.statusCode = 400;
    error.code = "error.proto.invalidJson";
    throw error;
  }
}

function validateMutationRequest(req: Request) {
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

function jsonResponse(code: number, payload: unknown, headOnly = false): Response {
  const body = JSON.stringify(payload);
  return new Response(headOnly ? null : body, {
    status: code,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "content-length": String(Buffer.byteLength(body)),
    },
  });
}

async function runFetch(task: () => unknown, headOnly = false): Promise<Response> {
  try {
    const r = await task();
    if (r && typeof r === "object" && "ok" in r && (r as { ok: unknown }).ok === false) {
      return jsonResponse(400, r, headOnly);
    }
    return jsonResponse(200, { ok: true, data: r }, headOnly);
  } catch (caught) {
    const e = caught as CodedError;
    const status = Number.isInteger(e && e.statusCode) ? e.statusCode! : 500;
    return jsonResponse(status, {
      ok: false,
      ...(e && typeof e.code === "string" ? { code: e.code } : {}),
      error: String(e && e.message ? e.message : e),
    }, headOnly);
  }
}

export function apply(ctx: HostContext) {
  const log = makeLog();
  let mutationQueue: Promise<unknown> = Promise.resolve();
  const enqueueMutation = <T>(task: () => Promise<T>): Promise<T> => {
    const queued = mutationQueue.then(task, task);
    mutationQueue = queued.catch(() => undefined);
    return queued;
  };

  const API_PREFIX = "/api/dsh-mcp-connectors";

  const handlePost = (
    req: Request,
    action: (body: Record<string, unknown>) => Promise<unknown>,
  ): Promise<Response> => {
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
      fetch: (req: Request) => runFetch(() => snapshot(), req.method === "HEAD"),
    },
    {
      path: `${API_PREFIX}/enable`,
      methods: ["POST"],
      fetch: (req: Request) => handlePost(req, (b) => setServerEnabled(String(b.source || ""), String(b.name || ""), true, log)),
    },
    {
      path: `${API_PREFIX}/disable`,
      methods: ["POST"],
      fetch: (req: Request) => handlePost(req, (b) => setServerEnabled(String(b.source || ""), String(b.name || ""), false, log)),
    },
    {
      path: `${API_PREFIX}/upsert`,
      methods: ["POST"],
      fetch: (req: Request) => handlePost(req, (b) => upsertServer(b as ServerInput, log)),
    },
    {
      path: `${API_PREFIX}/delete`,
      methods: ["POST"],
      fetch: (req: Request) => handlePost(req, (b) => deleteServer(String(b.source || ""), String(b.name || ""), log)),
    },
    {
      path: `${API_PREFIX}/backup-restore`,
      methods: ["POST"],
      fetch: (req: Request) => handlePost(req, (b) => restoreBackup(String(b.id || ""), log)),
    },
    {
      path: `${API_PREFIX}/backup-delete`,
      methods: ["POST"],
      fetch: (req: Request) => handlePost(req, (b) => deleteBackup(String(b.id || ""))),
    },
    {
      path: `${API_PREFIX}/root-path`,
      methods: ["POST"],
      fetch: (req: Request) => handlePost(req, (b) => setRootPath(String(b.key || ""), b.path === undefined || b.path === null ? null : String(b.path))),
    },
    {
      path: `${API_PREFIX}/open-folder`,
      methods: ["POST"],
      fetch: (req: Request) => handlePost(req, (b) => openFolder(String(b.source || ""))),
    },
    {
      path: `${API_PREFIX}/reorder`,
      methods: ["POST"],
      fetch: (req: Request) => handlePost(req, (b) => setOrder(String(b.group || ""), Array.isArray(b.items) ? (b.items as string[]) : [])),
    },
    {
      path: `${API_PREFIX}/custom-source-add`,
      methods: ["POST"],
      fetch: (req: Request) => handlePost(req, (b) => addCustomSource(String(b.label || ""), String(b.path || ""))),
    },
    {
      path: `${API_PREFIX}/custom-source-remove`,
      methods: ["POST"],
      fetch: (req: Request) => handlePost(req, (b) => removeCustomSource(String(b.key || ""))),
    },
  ];

  const register = () => {
    if (ctx.connection?.fetch?.register) {
      const disposers = routes.map((route) =>
        ctx.connection!.fetch!.register({
          path: route.path,
          methods: route.methods,
          requestBody: "buffered",
          fetch: route.fetch,
        }),
      );
      return () => {
        for (const disposer of disposers) {
          try { disposer(); } catch { /* ignore */ }
        }
      };
    }
    ctx.logger?.warn?.("MCP Manager routes require authenticated connection.fetch");
    return () => {};
  };

  if (typeof ctx.effect === "function") {
    ctx.effect(register, "mcp-manager: API routes");
  } else {
    register();
  }
}

export { name, inject };
