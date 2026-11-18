const REGISTRY_BASE = "https://registry.modelcontextprotocol.io/v0/servers";
const CACHE_TTL_MS = 10 * 6e4;
const CACHE_LIMIT = 128;
const cache = /* @__PURE__ */ new Map();
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function str(value) {
  return typeof value === "string" && value.trim() ? value : void 0;
}
function slugify(input) {
  const slug = input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  return slug || "mcp";
}
function argsFrom(list, prefix, fields) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list) {
    const arg = asRecord(raw);
    if (!arg) continue;
    let value = str(arg.value);
    const variables = asRecord(arg.variables);
    if (value && variables) {
      for (const [name, rawVar] of Object.entries(variables)) {
        const variable = asRecord(rawVar) ?? {};
        const key = `${prefix}-${name}`.replace(/[^\w-]/g, "_");
        fields.push({
          key,
          label: name,
          description: str(variable.description),
          required: variable.isRequired === true,
          secret: variable.isSecret === true
        });
        value = value.replace(new RegExp(`\\{${name}\\}`, "g"), `{{${key}}}`);
      }
    }
    const type = str(arg.type) ?? "positional";
    if (type === "named") {
      const name = str(arg.name);
      if (!name) continue;
      if (value !== void 0) out.push(name, value);
      else out.push(name);
    } else if (value !== void 0) {
      out.push(value);
    }
  }
  return out;
}
function fieldsFromEnv(list) {
  const fields = [];
  const env = {};
  if (!Array.isArray(list)) return { fields, env };
  for (const raw of list) {
    const item = asRecord(raw);
    if (!item) continue;
    const name = str(item.name);
    if (!name) continue;
    fields.push({
      key: name,
      label: name,
      description: str(item.description),
      required: item.isRequired === true,
      secret: item.isSecret === true,
      default: typeof item.default === "string" ? item.default : item.default !== void 0 ? String(item.default) : void 0
    });
    env[name] = `{{${name}}}`;
  }
  return { fields, env };
}
function mapServer(raw) {
  const item = asRecord(raw);
  if (!item) return null;
  const meta = asRecord(item._meta);
  const official = meta ? asRecord(meta["io.modelcontextprotocol.registry/official"]) : null;
  if (official && official.isLatest === false) return null;
  const server = asRecord(item.server);
  if (!server) return null;
  const registryName = str(server.name) ?? "";
  if (!registryName) return null;
  const title = str(server.title) ?? registryName;
  const description = str(server.description) ?? "";
  const repository = asRecord(server.repository);
  const base = {
    title,
    description,
    source: "registry",
    repository: str(repository?.url),
    websiteUrl: str(server.websiteUrl),
    registryName,
    warning: void 0
  };
  const packages = Array.isArray(server.packages) ? server.packages.map(asRecord).filter(Boolean) : [];
  const npm = packages.find((p) => p.registryType === "npm");
  const pypi = packages.find((p) => p.registryType === "pypi");
  const pkg = npm ?? pypi;
  if (pkg) {
    const identifier = str(pkg.identifier);
    if (!identifier) return null;
    const registryType = str(pkg.registryType);
    const fields2 = [];
    const runtimeArgs = argsFrom(pkg.runtimeArguments, "rt", fields2);
    const packageArgs = argsFrom(pkg.packageArguments, "pkg", fields2);
    const envInfo = fieldsFromEnv(pkg.environmentVariables);
    const command = str(pkg.runtimeHint) ?? (registryType === "pypi" ? "uvx" : "npx");
    const args = [...runtimeArgs];
    if (/^(npx|npm)$/i.test(command) && !args.includes("-y") && !args.includes("--yes")) args.unshift("-y");
    args.push(identifier, ...packageArgs);
    return {
      ...base,
      id: slugify(title || registryName),
      transport: "stdio",
      packageId: identifier,
      command,
      args,
      env: envInfo.env,
      fields: [...fields2, ...envInfo.fields],
      tags: [registryType ?? "package"]
    };
  }
  const remotes = Array.isArray(server.remotes) ? server.remotes.map(asRecord).filter(Boolean) : [];
  const remote = remotes.find((r) => str(r.url));
  if (!remote) return null;
  const url = str(remote.url);
  const fields = [];
  const headers = {};
  if (Array.isArray(remote.headers)) {
    let index = 0;
    for (const rawHeader of remote.headers) {
      const header = asRecord(rawHeader);
      if (!header) continue;
      const headerName = str(header.name);
      if (!headerName) continue;
      const key = `hdr_${index++}`;
      fields.push({
        key,
        label: headerName,
        description: str(header.description),
        required: header.isRequired === true,
        secret: header.isSecret === true,
        default: str(header.value)
      });
      headers[headerName] = `{{${key}}}`;
    }
  }
  return {
    ...base,
    id: slugify(title || registryName),
    transport: "http",
    url,
    headers,
    fields,
    tags: [str(remote.type) ?? "remote"]
  };
}
function mapRegistryPayload(payload, limit = 30) {
  const record = asRecord(payload);
  const list = Array.isArray(record?.servers) ? record.servers : [];
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const raw of list) {
    const entry = mapServer(raw);
    if (!entry) continue;
    const dedupeKey = entry.registryName ?? entry.id;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    let id = entry.id;
    for (let n = 2; out.some((item) => item.id === id); n++) id = `${entry.id}-${n}`;
    entry.id = id;
    out.push(entry);
    if (out.length >= limit) break;
  }
  return out;
}
async function searchRegistry(query, cursor) {
  const key = `${query.trim().toLowerCase()}\0${cursor ?? ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  const url = new URL(REGISTRY_BASE);
  url.searchParams.set("limit", "50");
  if (query.trim()) url.searchParams.set("search", query.trim());
  if (cursor) url.searchParams.set("cursor", cursor);
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "dsh-mcp-connectors" },
    signal: AbortSignal.timeout(15e3)
  });
  if (!response.ok) throw new Error(`MCP Registry \u8FD4\u56DE HTTP ${response.status}`);
  const payload = await response.json();
  const meta = asRecord(asRecord(payload)?.metadata);
  const data = {
    items: mapRegistryPayload(payload),
    nextCursor: str(meta?.nextCursor)
  };
  cache.set(key, { at: Date.now(), data });
  if (cache.size > CACHE_LIMIT) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  return data;
}
const README_TTL_MS = 30 * 6e4;
const README_MAX_BYTES = 512 * 1024;
const README_CACHE_LIMIT = 128;
const readmeCache = /* @__PURE__ */ new Map();
function githubReadmeCandidates(repoUrl) {
  let url;
  try {
    url = new URL(repoUrl);
  } catch {
    return [];
  }
  if (url.protocol !== "https:") return [];
  const host = url.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") return [];
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return [];
  const [owner, repo] = parts;
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return [];
  let rest = parts.slice(2);
  let branch = null;
  if (rest[0] === "tree" || rest[0] === "blob") {
    branch = rest[1] ?? null;
    rest = rest.slice(2);
  }
  const isFile = Boolean(rest.length && /\.(md|markdown)$/i.test(rest[rest.length - 1]));
  const branches = branch ? [branch] : ["HEAD", "main", "master"];
  const names = ["README.md", "README.zh-CN.md", "README.zh.md", "readme.md", "README.markdown"];
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const target of branches) {
    const paths = isFile ? [rest.join("/")] : [...names.map((name) => [...rest, name].join("/"))];
    for (const path of paths) {
      const raw = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(target)}/${path}`;
      if (seen.has(raw)) continue;
      seen.add(raw);
      out.push(raw);
    }
  }
  return out;
}
async function fetchGitHubReadme(repoUrl) {
  const key = repoUrl.trim();
  const hit = readmeCache.get(key);
  if (hit && Date.now() - hit.at < README_TTL_MS) return hit.data;
  let result = null;
  for (const candidate of githubReadmeCandidates(key)) {
    try {
      const response = await fetch(candidate, {
        headers: { accept: "text/plain, text/markdown;q=0.9, */*;q=0.1", "user-agent": "dsh-mcp-connectors" },
        redirect: "follow",
        signal: AbortSignal.timeout(12e3)
      });
      if (!response.ok) continue;
      const finalHost = new URL(response.url).hostname.toLowerCase();
      if (finalHost !== "raw.githubusercontent.com") continue;
      const text = await response.text();
      const truncated = text.length > README_MAX_BYTES;
      result = { text: truncated ? text.slice(0, README_MAX_BYTES) : text, url: candidate, truncated };
      break;
    } catch {
    }
  }
  readmeCache.set(key, { at: Date.now(), data: result });
  if (readmeCache.size > README_CACHE_LIMIT) {
    const oldest = [...readmeCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) readmeCache.delete(oldest[0]);
  }
  return result;
}
export {
  fetchGitHubReadme,
  githubReadmeCandidates,
  mapRegistryPayload,
  searchRegistry
};
