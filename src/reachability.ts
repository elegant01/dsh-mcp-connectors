// 目录来源可达性：用来在断外网时隐藏「在线发现」「mcp.so 热门」两个 Tab。
// 只做轻量探测（每条 3 秒超时），结果缓存 60 秒，避免每次开弹层都等。

const TTL_MS = 60_000;
const TIMEOUT_MS = 3_000;
const REGISTRY_PROBE = "https://registry.modelcontextprotocol.io/v0/servers?limit=1";
const MCPSO_PROBE = "https://mcp.so/";
const USER_AGENT = "dsh-mcp-connectors (+https://github.com/elegant01/dsh-mcp-connectors)";

export interface Reachability {
  registry: boolean;
  mcpso: boolean;
  checkedAt: string;
}

let memo: { at: number; data: Reachability } | null = null;
let inflight: Promise<Reachability> | null = null;

async function probe(url: string, method: "GET" | "HEAD"): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method,
      headers: { accept: "*/*", "user-agent": USER_AGENT },
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return response.status < 500;
  } catch {
    return false;
  }
}

export async function checkReachability(): Promise<Reachability> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.data;
  if (inflight) return inflight;
  inflight = (async () => {
    const [registry, mcpso] = await Promise.all([
      probe(REGISTRY_PROBE, "GET"),
      probe(MCPSO_PROBE, "HEAD"),
    ]);
    const data: Reachability = { registry, mcpso, checkedAt: new Date().toISOString() };
    memo = { at: Date.now(), data };
    return data;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
