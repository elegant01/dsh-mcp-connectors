const TTL_MS = 6e4;
const TIMEOUT_MS = 3e3;
const REGISTRY_PROBE = "https://registry.modelcontextprotocol.io/v0/servers?limit=1";
const MCPSO_PROBE = "https://mcp.so/";
const USER_AGENT = "dsh-mcp-connectors (+https://github.com/elegant01/dsh-mcp-connectors)";
let memo = null;
let inflight = null;
async function probe(url, method) {
  try {
    const response = await fetch(url, {
      method,
      headers: { accept: "*/*", "user-agent": USER_AGENT },
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    return response.status < 500;
  } catch {
    return false;
  }
}
async function checkReachability() {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.data;
  if (inflight) return inflight;
  inflight = (async () => {
    const [registry, mcpso] = await Promise.all([
      probe(REGISTRY_PROBE, "GET"),
      probe(MCPSO_PROBE, "HEAD")
    ]);
    const data = { registry, mcpso, checkedAt: (/* @__PURE__ */ new Date()).toISOString() };
    memo = { at: Date.now(), data };
    return data;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
export {
  checkReachability
};
