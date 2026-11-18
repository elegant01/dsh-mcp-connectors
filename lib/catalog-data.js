const REFERENCE_WARNING = "\u5B98\u65B9\u53C2\u8003\u5B9E\u73B0\uFF0C\u7528\u6765\u6F14\u793A MCP \u80FD\u529B\uFF0C\u4E0D\u5EFA\u8BAE\u76F4\u63A5\u7528\u4E8E\u751F\u4EA7\u73AF\u5883\uFF1B\u8BF7\u81EA\u884C\u8BC4\u4F30\u6743\u9650\u4E0E\u5B89\u5168\u8FB9\u754C\u3002";
const OFFICIAL_CATALOG = [
  {
    id: "filesystem",
    title: "Filesystem",
    description: "Secure file operations with configurable access controls.",
    descriptionZh: "\u5E26\u8BBF\u95EE\u63A7\u5236\u7684\u5B89\u5168\u6587\u4EF6\u8BFB\u5199\u3001\u641C\u7D22\u4E0E\u7F16\u8F91\u3002",
    source: "official",
    transport: "stdio",
    packageId: "@modelcontextprotocol/server-filesystem",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "{{dirs}}"],
    fields: [
      {
        key: "dirs",
        label: "\u5141\u8BB8\u8BBF\u95EE\u7684\u76EE\u5F55",
        labelEn: "Allowed directories",
        description: "\u6BCF\u884C\u4E00\u4E2A\u7EDD\u5BF9\u8DEF\u5F84\uFF1B\u670D\u52A1\u5668\u53EA\u80FD\u8BBF\u95EE\u8FD9\u4E9B\u76EE\u5F55\u3002",
        required: true,
        kind: "lines",
        placeholder: "F:\\centos\\my-project"
      }
    ],
    repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
    tags: ["files"],
    warning: REFERENCE_WARNING
  },
  {
    id: "git",
    title: "Git",
    description: "Tools to read, search, and manipulate Git repositories.",
    descriptionZh: "\u8BFB\u53D6\u3001\u641C\u7D22\u548C\u64CD\u4F5C Git \u4ED3\u5E93\u3002",
    source: "official",
    transport: "stdio",
    packageId: "mcp-server-git",
    command: "uvx",
    args: ["mcp-server-git", "--repository", "{{repo}}"],
    fields: [
      {
        key: "repo",
        label: "\u4ED3\u5E93\u8DEF\u5F84",
        labelEn: "Repository path",
        required: true,
        kind: "path",
        default: ".",
        placeholder: "F:\\centos\\my-project"
      }
    ],
    repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/git",
    tags: ["git"],
    warning: REFERENCE_WARNING
  },
  {
    id: "memory",
    title: "Memory",
    description: "Knowledge graph-based persistent memory system.",
    descriptionZh: "\u57FA\u4E8E\u77E5\u8BC6\u56FE\u8C31\u7684\u6301\u4E45\u8BB0\u5FC6\u7CFB\u7EDF\u3002",
    source: "official",
    transport: "stdio",
    packageId: "@modelcontextprotocol/server-memory",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
    env: { MEMORY_FILE_PATH: "{{MEMORY_FILE_PATH}}" },
    fields: [
      {
        key: "MEMORY_FILE_PATH",
        label: "\u8BB0\u5FC6\u6587\u4EF6\u8DEF\u5F84\uFF08\u53EF\u9009\uFF09",
        labelEn: "Memory file path (optional)",
        description: "\u7559\u7A7A\u5219\u4F7F\u7528\u670D\u52A1\u5668\u9ED8\u8BA4\u4F4D\u7F6E\u3002",
        kind: "path",
        placeholder: "F:\\centos\\.mcp\\memory.json"
      }
    ],
    repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
    tags: ["memory"],
    warning: REFERENCE_WARNING
  },
  {
    id: "sequential-thinking",
    title: "Sequential Thinking",
    description: "Dynamic and reflective problem-solving through thought sequences.",
    descriptionZh: "\u901A\u8FC7\u9010\u6B65\u601D\u8003\u5E8F\u5217\u8FDB\u884C\u52A8\u6001\u63A8\u7406\u3002",
    source: "official",
    transport: "stdio",
    packageId: "@modelcontextprotocol/server-sequential-thinking",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
    fields: [],
    repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking",
    tags: ["reasoning"],
    warning: REFERENCE_WARNING
  },
  {
    id: "time",
    title: "Time",
    description: "Time and timezone conversion capabilities.",
    descriptionZh: "\u65F6\u95F4\u4E0E\u65F6\u533A\u8F6C\u6362\u3002",
    source: "official",
    transport: "stdio",
    packageId: "mcp-server-time",
    command: "uvx",
    args: ["mcp-server-time", "--local-timezone={{tz}}"],
    fields: [
      {
        key: "tz",
        label: "\u672C\u5730\u65F6\u533A\uFF08\u53EF\u9009\uFF09",
        labelEn: "Local timezone (optional)",
        placeholder: "Asia/Shanghai"
      }
    ],
    repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/time",
    tags: ["time"],
    warning: REFERENCE_WARNING
  },
  {
    id: "fetch",
    title: "Fetch",
    description: "Web content fetching and conversion for efficient LLM usage.",
    descriptionZh: "\u6293\u53D6\u7F51\u9875\u5E76\u8F6C\u6210\u9002\u5408 LLM \u4F7F\u7528\u7684\u6587\u672C\u3002",
    source: "official",
    transport: "stdio",
    packageId: "mcp-server-fetch",
    command: "uvx",
    args: ["mcp-server-fetch"],
    fields: [],
    repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch",
    tags: ["web"],
    warning: REFERENCE_WARNING
  },
  {
    id: "everything",
    title: "Everything",
    description: "Reference / test server with prompts, resources, and tools.",
    descriptionZh: "\u53C2\u8003/\u6D4B\u8BD5\u670D\u52A1\u5668\uFF0C\u8986\u76D6 prompts\u3001resources\u3001tools \u5168\u90E8\u80FD\u529B\u3002",
    source: "official",
    transport: "stdio",
    packageId: "@modelcontextprotocol/server-everything",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-everything"],
    fields: [],
    repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/everything",
    tags: ["test"],
    warning: REFERENCE_WARNING
  }
];
function expandCatalogSpec(entry, values) {
  const val = (key) => values[key] ?? "";
  const fieldByKey = Object.fromEntries(entry.fields.map((field) => [field.key, field]));
  const placeholders = (text) => [...text.matchAll(/\{\{([\w-]+)\}\}/g)].map((match) => match[1]);
  const expand = (text) => text.replace(/\{\{([\w-]+)\}\}/g, (_, key) => val(key));
  const args = [];
  for (const template of entry.args ?? []) {
    const keys = placeholders(template);
    if (keys.length && keys.every((key) => !val(key).trim())) continue;
    const linesKey = keys.length === 1 && fieldByKey[keys[0]]?.kind === "lines" ? keys[0] : null;
    if (linesKey) {
      for (const line of val(linesKey).split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) args.push(line);
    } else {
      args.push(expand(template));
    }
  }
  const env = {};
  for (const [key, template] of Object.entries(entry.env ?? {})) {
    const keys = placeholders(template);
    if (keys.length && keys.every((field) => !val(field).trim())) continue;
    env[key] = expand(template);
  }
  const headers = {};
  for (const [key, template] of Object.entries(entry.headers ?? {})) {
    const keys = placeholders(template);
    if (keys.length && keys.every((field) => !val(field).trim())) continue;
    headers[key] = expand(template);
  }
  const spec = {};
  if (entry.command) spec.command = entry.command;
  if (args.length) spec.args = args;
  if (Object.keys(env).length) spec.env = env;
  if (entry.url) spec.url = entry.url;
  if (Object.keys(headers).length) spec.headers = headers;
  if (entry.extra && Object.keys(entry.extra).length) spec.extra = entry.extra;
  return spec;
}
function matchesCatalogEntry(entry, name, spec) {
  if (name === entry.id) return true;
  if (entry.url && spec.url === entry.url) return true;
  if (entry.packageId) {
    const needle = entry.packageId;
    if (spec.command === needle) return true;
    if (spec.args?.some((arg) => arg === needle)) return true;
    if (spec.url?.includes(needle)) return true;
  }
  return false;
}
export {
  OFFICIAL_CATALOG,
  expandCatalogSpec,
  matchesCatalogEntry
};
