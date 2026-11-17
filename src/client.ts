// dsh-mcp-connectors client half：BoardUI 风格的跨 Agent MCP 管理面板。
// 布局：左侧 Agent 导航（浮动卡片）+ 右侧 KPI/服务器卡片网格；与 skills-manager 的表格布局无关。
// 纯 React.createElement，无 JSX 依赖；样式全部来自 board-css.ts 的 .dmm 作用域。

import * as React from "react";
import { BOARD_CSS } from "./board-css.js";
import { AGENT_ICONS } from "./agent-icons.js";

const h = React.createElement;
const { useCallback, useEffect, useMemo, useRef, useState } = React;

// ---------- 类型（与 host 端对齐） ----------
type TransportKind = "stdio" | "http" | "sse";
interface McpServerSpec {
  command?: string; args?: string[]; env?: Record<string, string>;
  url?: string; headers?: Record<string, string>; extra?: Record<string, unknown>;
}
interface ServerView { name: string; transport: TransportKind; summary: string; spec: McpServerSpec; enabled: boolean; }
interface SourceView {
  key: string; label: string; path: string | null; exists: boolean; writable: boolean;
  format: string; error?: string; servers: ServerView[]; overridden?: boolean; discovered?: boolean;
  group?: string; groupLabel?: string;
}
interface BackupEntry { id: string; sourceKey: string; sourceLabel: string; file: string; targetPath: string; createdAt: string; reason: string; size: number; }
interface Snapshot {
  sources: SourceView[]; backups: BackupEntry[]; warnings: { code: string; error: string }[];
  order?: Record<string, string[]>;
}

interface SlotsService {
  register(meta: Record<string, unknown>, component?: unknown): (() => void) | unknown;
  inject(name: string, declareFn: () => unknown): (() => void) | unknown;
}
interface LocaleService { bind(ns: string): (key: string, params?: Record<string, unknown>) => string; }
interface ClientContext { slots?: SlotsService; locale?: LocaleService; }

// ---------- 词典 ----------
type Dict = Record<string, string>;
export const ZH: Dict = {
  title: "连接器",
  subtitle: "统一管理本机各 Agent 的 MCP 服务器配置",
  brandSub: "跨 Agent 配置中心",
  navAll: "全部服务器",
  navBackups: "备份与回退",
  navSources: "AGENT 来源",
  navGeneral: "总览",
  searchPlaceholder: "搜索服务器名、命令或地址…",
  refresh: "刷新",
  addServer: "添加服务器",
  kpiAgents: "Agent 来源",
  kpiServers: "服务器总数",
  kpiEnabled: "已启用",
  kpiBackups: "配置备份",
  filterStatus: "状态",
  statusAll: "全部状态",
  statusOn: "运行中",
  statusOff: "已停用",
  collapse: "收起",
  expand: "展开",
  collapseAll: "全部收起",
  expandAll: "全部展开",
  filterAgentAll: "全部 Agent",
  switchEnable: "启用",
  switchDisable: "停用",
  empty: "没有匹配的服务器。",
  emptySource: "该来源还没有 MCP 服务器。",
  loading: "正在读取各 Agent 配置…",
  loadFailed: "读取失败",
  serversUnit: "台",
  detailEdit: "编辑",
  detailDelete: "删除",
  detailJson: "JSON",
  enabledTag: "运行中",
  disabledTag: "已停用",
  readonlyTag: "只读",
  customTag: "自定义",
  autoTag: "自动发现",
  overriddenTag: "路径已改",
  errorTag: "解析失败",
  configPath: "配置文件",
  addSource: "添加来源",
  editPath: "改路径",
  restore: "回退到此版本",
  deleteBackup: "删除备份",
  backupReason: "操作",
  backupEmpty: "还没有备份。每次写配置前会自动留存一份。",
  modalAddTitle: "添加 MCP 服务器",
  modalEditTitle: "编辑 MCP 服务器",
  fieldSource: "写入目标",
  fieldName: "名称",
  fieldTransport: "类型",
  fieldCommand: "启动命令",
  fieldArgs: "参数（每行一个）",
  fieldEnv: "环境变量（KEY=VALUE 每行一个）",
  fieldUrl: "服务地址",
  fieldHeaders: "请求头（KEY=VALUE 每行一个）",
  fieldRaw: "完整 JSON 定义",
  modeForm: "表单",
  modeRaw: "JSON",
  cancel: "取消",
  save: "保存",
  confirmDeleteTitle: "删除服务器？",
  confirmDeleteDesc: "将从配置文件中移除，删除前会自动备份。",
  confirmDelete: "删除",
  confirmRestoreTitle: "回退配置？",
  confirmRestoreDesc: "配置文件将恢复到此备份的内容。回退前会先备份当前内容。",
  confirmRestore: "回退",
  rootPathTitle: "修改配置文件路径",
  rootPathSave: "保存",
  rootPathReset: "恢复默认",
  customSourceTitle: "添加自定义来源",
  customSourcePath: "配置文件路径",
  customSourceLabel: "显示名（可选）",
  toastSaved: "已保存",
  toastDeleted: "已删除",
  toastEnabled: "已启用",
  toastDisabled: "已停用",
  toastRestored: "已回退",
  toastFailed: "操作失败",
  themeToggle: "切换主题",
  openFolder: "打开所在文件夹",
  backToTop: "回到顶部",
};
const EN: Dict = {
  title: "Connectors",
  subtitle: "Manage MCP server configs across local AI agents",
  brandSub: "Cross-agent config hub",
  navAll: "All servers",
  navBackups: "Backups & rollback",
  navSources: "AGENT SOURCES",
  navGeneral: "Overview",
  searchPlaceholder: "Search name, command or URL…",
  refresh: "Refresh",
  addServer: "Add server",
  kpiAgents: "Agent sources",
  kpiServers: "Total servers",
  kpiEnabled: "Enabled",
  kpiBackups: "Config backups",
  filterStatus: "Status",
  statusAll: "All status",
  statusOn: "Active",
  statusOff: "Disabled",
  collapse: "Collapse",
  expand: "Expand",
  collapseAll: "Collapse all",
  expandAll: "Expand all",
  filterAgentAll: "All agents",
  switchEnable: "Enable",
  switchDisable: "Disable",
  empty: "No matching servers.",
  emptySource: "No MCP servers in this source yet.",
  loading: "Reading agent configs…",
  loadFailed: "Failed to load",
  serversUnit: "",
  detailEdit: "Edit",
  detailDelete: "Delete",
  detailJson: "JSON",
  enabledTag: "Active",
  disabledTag: "Disabled",
  readonlyTag: "Read-only",
  customTag: "Custom",
  autoTag: "Auto-detected",
  overriddenTag: "Path changed",
  errorTag: "Parse error",
  configPath: "Config file",
  addSource: "Add source",
  editPath: "Edit path",
  restore: "Restore this version",
  deleteBackup: "Delete backup",
  backupReason: "Action",
  backupEmpty: "No backups yet. One is saved automatically before every write.",
  modalAddTitle: "Add MCP server",
  modalEditTitle: "Edit MCP server",
  fieldSource: "Target source",
  fieldName: "Name",
  fieldTransport: "Type",
  fieldCommand: "Command",
  fieldArgs: "Args (one per line)",
  fieldEnv: "Env (KEY=VALUE per line)",
  fieldUrl: "Server URL",
  fieldHeaders: "Headers (KEY=VALUE per line)",
  fieldRaw: "Full JSON definition",
  modeForm: "Form",
  modeRaw: "JSON",
  cancel: "Cancel",
  save: "Save",
  confirmDeleteTitle: "Delete server?",
  confirmDeleteDesc: "It will be removed from the config file. A backup is saved first.",
  confirmDelete: "Delete",
  confirmRestoreTitle: "Restore config?",
  confirmRestoreDesc: "The config file will be restored to this backup. The current content is backed up first.",
  confirmRestore: "Restore",
  rootPathTitle: "Change config file path",
  rootPathSave: "Save",
  rootPathReset: "Reset to default",
  customSourceTitle: "Add custom source",
  customSourcePath: "Config file path",
  customSourceLabel: "Label (optional)",
  toastSaved: "Saved",
  toastDeleted: "Deleted",
  toastEnabled: "Enabled",
  toastDisabled: "Disabled",
  toastRestored: "Restored",
  toastFailed: "Operation failed",
  themeToggle: "Toggle theme",
  openFolder: "Open folder",
  backToTop: "Back to top",
};

function makeT(ctx: ClientContext): (key: string) => string {
  let hostT: ((key: string) => string) | null = null;
  try {
    if (ctx.locale && typeof ctx.locale.bind === "function") hostT = ctx.locale.bind("mcp-manager");
  } catch { /* 宿主词典缺失时回退内置 */ }
  const zh = typeof navigator !== "undefined" && (navigator.language || "zh").toLowerCase().startsWith("zh");
  const fallback = zh ? ZH : EN;
  return (key: string) => {
    if (hostT) {
      try {
        const v = hostT(key);
        if (v && v !== key) return v;
      } catch { /* ignore */ }
    }
    return fallback[key] ?? key;
  };
}

// ---------- API ----------
const API_PREFIX = "/api/dsh-mcp-connectors";
const MUTATION_HEADERS = { "content-type": "application/json", "x-dsh-mcp-connectors": "1" };

function resolveApiUrl(path: string): string {
  let base = "/";
  try {
    base = document.baseURI || "/";
  } catch { /* ignore */ }
  return new URL(`${API_PREFIX}${path}`, base).toString();
}

async function callApi<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(resolveApiUrl(path), options);
  let payload: { ok?: boolean; data?: T; error?: string } | null = null;
  try {
    payload = await res.json();
  } catch {
    throw new Error(`non-JSON response (HTTP ${res.status})`);
  }
  if (!payload || payload.ok !== true) throw new Error(payload?.error || `HTTP ${res.status}`);
  return payload.data as T;
}

// ---------- agent 品牌图标 ----------
const NORMALIZED_ICONS: Array<[string, string]> = Object.keys(AGENT_ICONS)
  .filter((k) => k !== "fallback")
  .map((k) => [k.replace(/[^a-z0-9]/g, ""), k]);

function agentIcon(key: string, size = 14, label?: string) {
  let iconKey = AGENT_ICONS[key] ? key : null;
  // 自动发现的来源没有固定图标：按显示名归一化后包含匹配（如 "kimi-code" → kimicode）
  if (!iconKey && label) {
    const norm = label.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (norm.length >= 4) {
      const hit = NORMALIZED_ICONS.find(([nk]) => norm.includes(nk) || (nk.length >= 4 && nk.includes(norm)));
      if (hit) iconKey = hit[1];
    }
  }
  const svg = AGENT_ICONS[iconKey ?? "fallback"] ?? AGENT_ICONS.fallback;
  return h("span", {
    className: "dmm-agent-icon",
    style: { fontSize: size },
    dangerouslySetInnerHTML: { __html: svg },
  });
}

// ---------- 小图标 ----------
function icon(path: string, size = 14) {
  return h("svg", { viewBox: "0 0 16 16", width: size, height: size, fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true },
    h("path", { d: path }));
}
const ICONS = {
  search: "M7 12.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM11 11l3.5 3.5",
  refresh: "M13.5 8a5.5 5.5 0 1 1-1.61-3.89M13.5 1.5v3h-3",
  plus: "M8 3v10M3 8h10",
  edit: "M11.3 2.7a1.4 1.4 0 0 1 2 2L5 13l-2.6.6L3 11z",
  trash: "M3 4h10M6.5 4V2.8a.8.8 0 0 1 .8-.8h1.4a.8.8 0 0 1 .8.8V4m2.5 0v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4",
  sun: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 1.5v1.2M8 13.3v1.2M14.5 8h-1.2M2.7 8H1.5M12.6 3.4l-.9.9M4.3 11.7l-.9.9M12.6 12.6l-.9-.9M4.3 4.3l-.9-.9",
  moon: "M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z",
  restore: "M2.5 8a5.5 5.5 0 1 0 1.61-3.89M2.5 1.5v3h3",
  close: "M4 4l8 8M12 4l-8 8",
  folder: "M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6a1.5 1.5 0 0 1 1.06.44L8.3 4.6a1.5 1.5 0 0 0 1.06.44h3.14A1.5 1.5 0 0 1 14 6.55v5.95a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5z",
  chevron: "M4 6l4 4 4-4",
  fold: "M4 8h8M4 12h8M4 4h8",
  bolt: "M9 1.5L3.5 9H8l-1 5.5L12.5 7H8z",
};

// ---------- 主题：跟随 DSH 宿主，不做自己的开关 ----------
function detectHostTheme(): "light" | "dark" {
  try {
    const probes = [document.documentElement, document.body].filter(Boolean) as HTMLElement[];
    for (const el of probes) {
      const dt = (el.getAttribute("data-theme") || el.getAttribute("data-mode") || "").toLowerCase();
      if (dt.includes("dark")) return "dark";
      if (dt.includes("light")) return "light";
      const cls = String(el.className || "");
      if (/(^|[\s_-])dark([\s_-]|$)/i.test(cls)) return "dark";
      if (/(^|[\s_-])light([\s_-]|$)/i.test(cls)) return "light";
    }
    // 属性里找不到就按宿主背景亮度判
    if (document.body) {
      const bg = getComputedStyle(document.body).backgroundColor;
      const m = bg.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/);
      if (m && (m[4] === undefined || Number(m[4]) > 0.1)) {
        const lum = 0.299 * Number(m[1]) + 0.587 * Number(m[2]) + 0.114 * Number(m[3]);
        if (lum < 128) return "dark";
        if (lum > 200) return "light";
      }
    }
  } catch { /* 落到系统偏好 */ }
  if (typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
}

function useHostTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">(() => detectHostTheme());
  useEffect(() => {
    const update = () => setTheme(detectHostTheme());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "data-mode", "style"] });
    if (document.body) {
      observer.observe(document.body, { attributes: true, attributeFilter: ["class", "data-theme", "data-mode", "style"] });
    }
    const mq = typeof matchMedia !== "undefined" ? matchMedia("(prefers-color-scheme: dark)") : null;
    mq?.addEventListener?.("change", update);
    return () => {
      observer.disconnect();
      mq?.removeEventListener?.("change", update);
    };
  }, []);
  return theme;
}

// ---------- 弹窗外壳：ESC 只关最上层弹窗，不透传给宿主（宿主 ESC 会关整个设置页） ----------
function ModalShell(props: { onClose: () => void; wide?: boolean; children?: React.ReactNode }) {
  const { onClose, wide, children } = props;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    // capture + stopImmediatePropagation：抢在宿主的 ESC 处理之前，并把同目标的监听也挡掉
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onClose]);
  return h("div", {
    className: "dmm-overlay",
    onMouseDown: (e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose(); },
  }, h("div", { className: "dmm-modal", style: wide ? { width: 680 } : undefined }, children));
}

// ---------- Modal ----------
type ModalState =
  | { type: "edit"; source: string; name?: string; spec?: McpServerSpec }
  | { type: "delete"; source: string; name: string }
  | { type: "restore"; backup: BackupEntry }
  | { type: "deleteBackup"; backup: BackupEntry }
  | { type: "rootPath"; source: SourceView }
  | { type: "customSource" }
  | { type: "json"; name: string; spec: McpServerSpec }
  | null;

interface Toast { id: number; text: string; err?: boolean; }

// ---------- 主组件 ----------
export function McpManagerApp(props: { t: (k: string) => string }) {
  const { t } = props;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [nav, setNav] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "on" | "off">("all");
  const [modal, setModal] = useState<ModalState>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("dmm-collapsed") || "{}");
    } catch {
      return {};
    }
  });
  const theme = useHostTheme();
  const toastSeq = useRef(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const [showTop, setShowTop] = useState(false);
  const [topPos, setTopPos] = useState<{ right: number; bottom: number }>({ right: 24, bottom: 24 });

  // 回到顶部：滚动容器在设置页里可能是任意一层，且挂载时页面还没撑开，
  // 所以不做一次性探测 —— 用 document 捕获阶段接住所有 scroll 事件（scroll 不冒泡但能被捕获），
  // 每次滚动时重新找「当前滚动量最大的可滚动祖先」，按钮位置也随面板矩形实时计算。
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const update = () => {
      let top = document.scrollingElement?.scrollTop ?? window.scrollY ?? 0;
      let scroller: HTMLElement | null = null;
      let el: HTMLElement | null = root.parentElement;
      while (el) {
        const style = getComputedStyle(el);
        if ((style.overflowY === "auto" || style.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1) {
          if (el.scrollTop > top) {
            top = el.scrollTop;
            scroller = el;
          }
        }
        el = el.parentElement;
      }
      scrollerRef.current = scroller;
      setShowTop(top > 300);
      // 用「可见滚动区」的矩形来定位，而不是内容根节点：
      // 内容根通常比视口长，按它算会把按钮顶到视口最底部（跑到设置弹窗外面）。
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const host = scroller ?? root;
      const rect = host.getBoundingClientRect();
      const boundRight = Math.min(rect.right, vw);
      const boundBottom = Math.min(rect.bottom, vh);
      setTopPos({
        right: Math.max(16, vw - boundRight + 16),
        bottom: Math.max(16, vh - boundBottom + 16),
      });
    };

    update();
    document.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    // 面板内容变化（数据加载完、展开收起）后重新量一次
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(update);
      observer.observe(root);
    }
    return () => {
      document.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, []);

  const scrollToTop = useCallback(() => {
    const root = rootRef.current;
    // 把所有可滚动祖先一起滚回顶部（不知道哪个才是真正的滚动层）
    let el: HTMLElement | null = root?.parentElement ?? null;
    while (el) {
      const style = getComputedStyle(el);
      if ((style.overflowY === "auto" || style.overflowY === "scroll") && el.scrollTop > 0) {
        el.scrollTo({ top: 0, behavior: "smooth" });
      }
      el = el.parentElement;
    }
    document.scrollingElement?.scrollTo?.({ top: 0, behavior: "smooth" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const toast = useCallback((text: string, err?: boolean) => {
    const id = ++toastSeq.current;
    setToasts((list) => [...list, { id, text, err }]);
    setTimeout(() => setToasts((list) => list.filter((item) => item.id !== id)), 2600);
  }, []);

  const setCollapsedPersist = useCallback((updater: (cur: Record<string, boolean>) => Record<string, boolean>) => {
    setCollapsed((cur) => {
      const next = updater(cur);
      try { localStorage.setItem("dmm-collapsed", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await callApi<Snapshot>("/state");
      setSnapshot(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(String(err instanceof Error ? err.message : err));
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const mutate = useCallback(async (path: string, body: Record<string, unknown>, done: string) => {
    const busyKey = `${path}:${String(body.source ?? body.id ?? "")}:${String(body.name ?? "")}`;
    setBusy(busyKey);
    try {
      await callApi(path, { method: "POST", headers: MUTATION_HEADERS, body: JSON.stringify(body) });
      toast(done);
      setModal(null);
      await refresh();
    } catch (err) {
      toast(`${t("toastFailed")}: ${err instanceof Error ? err.message : String(err)}`, true);
    } finally {
      setBusy(null);
    }
  }, [refresh, t, toast]);

  // ---------- 派生数据 ----------
  const sources = snapshot?.sources ?? [];
  const backups = snapshot?.backups ?? [];
  const warnings = snapshot?.warnings ?? [];

  /** 只展示有服务器的来源（解析失败的也留着，方便看到错误）。 */
  const visibleSources = useMemo(
    () => sources.filter((s) => s.servers.length > 0 || Boolean(s.error)),
    [sources],
  );

  /** 产品归组：同 group 的多个配置文件合成一张卡片。 */
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; sources: SourceView[] }>();
    for (const source of visibleSources) {
      const key = source.group || source.key;
      let group = map.get(key);
      if (!group) {
        group = { key, label: source.groupLabel || source.label, sources: [] };
        map.set(key, group);
      }
      group.sources.push(source);
    }
    return [...map.values()];
  }, [sources]);

  const allServers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows: Array<{ source: SourceView; server: ServerView }> = [];
    for (const source of visibleSources) {
      if (nav !== "all" && nav !== "backups" && (source.group || source.key) !== nav) continue;
      for (const server of source.servers) {
        if (statusFilter === "on" && !server.enabled) continue;
        if (statusFilter === "off" && server.enabled) continue;
        if (q && !`${server.name} ${server.summary} ${source.label}`.toLowerCase().includes(q)) continue;
        rows.push({ source, server });
      }
    }
    return rows;
  }, [visibleSources, nav, query, statusFilter]);

  const totals = useMemo(() => {
    let servers = 0;
    let enabled = 0;
    for (const source of visibleSources) {
      servers += source.servers.length;
      enabled += source.servers.filter((s) => s.enabled).length;
    }
    // Agent 数按产品归组计（WorkBuddy 两个配置文件算一个 agent）
    const agentKeys = new Set(visibleSources.map((s) => s.group || s.key));
    return { agents: agentKeys.size, servers, enabled, backups: backups.length };
  }, [visibleSources, backups]);

  const grouped = useMemo(() => {
    const map = new Map<string, { key: string; label: string; sources: SourceView[]; servers: Array<{ source: SourceView; server: ServerView }> }>();
    for (const row of allServers) {
      const groupKey = row.source.group || row.source.key;
      let group = map.get(groupKey);
      if (!group) {
        group = { key: groupKey, label: row.source.groupLabel || row.source.label, sources: [], servers: [] };
        map.set(groupKey, group);
      }
      if (!group.sources.some((s) => s.key === row.source.key)) group.sources.push(row.source);
      group.servers.push(row);
    }
    // 应用面板内手动排序（纯展示层，没排过的按名字，排在已排序项之后）
    const orderMap = snapshot?.order ?? {};
    for (const group of map.values()) {
      const rank = orderMap[group.key];
      if (!Array.isArray(rank) || !rank.length) continue;
      const indexOf = (row: { source: SourceView; server: ServerView }) => {
        const i = rank.indexOf(`${row.source.key}/${row.server.name}`);
        return i < 0 ? Number.MAX_SAFE_INTEGER : i;
      };
      group.servers.sort((a, b) => indexOf(a) - indexOf(b));
    }
    return [...map.values()];
  }, [allServers, snapshot]);

  // ---------- 渲染 ----------
  const kpiCard = (label: string, value: number, key: string) =>
    h("div", { className: "dmm-kpi", key, title: `${label}: ${value}` },
      h("span", { className: "dmm-kpi-label" }, label),
      h("span", { className: "dmm-kpi-n" }, value));

  /** 拖拽排序：把 draggedKey 移到 targetKey 的位置，顺序存进管理器 state（不改配置文件）。 */
  const applyReorder = useCallback(async (groupKey: string, rows: Array<{ source: SourceView; server: ServerView }>, draggedKey: string, targetKey: string) => {
    const keys = rows.map((row) => `${row.source.key}/${row.server.name}`);
    if (!keys.includes(draggedKey) || !keys.includes(targetKey) || draggedKey === targetKey) return;
    const rest = keys.filter((k) => k !== draggedKey);
    rest.splice(rest.indexOf(targetKey), 0, draggedKey);
    try {
      await callApi("/reorder", { method: "POST", headers: MUTATION_HEADERS, body: JSON.stringify({ group: groupKey, items: rest }) });
      await refresh();
    } catch (err) {
      toast(`${t("toastFailed")}: ${err instanceof Error ? err.message : String(err)}`, true);
    }
  }, [refresh, t, toast]);

  const serverCard = (source: SourceView, server: ServerView, drag: { groupKey: string; rows: Array<{ source: SourceView; server: ServerView }> }) => {
    const busyKey = `:${source.key}:${server.name}`;
    const rowKey = `${source.key}/${server.name}`;
    const isBusy = busy !== null && busy.endsWith(busyKey);
    const transportTone = server.transport === "stdio" ? "gray" : server.transport === "sse" ? "purple" : "blue";
    return h("div", {
      className: `dmm-server${server.enabled ? "" : " off"}${draggingKey === rowKey ? " dragging" : ""}`,
      key: rowKey,
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        setDraggingKey(rowKey);
        e.dataTransfer.setData("text/plain", rowKey);
        e.dataTransfer.effectAllowed = "move";
      },
      onDragEnd: () => setDraggingKey(null),
      onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const dragged = e.dataTransfer.getData("text/plain") || draggingKey;
        setDraggingKey(null);
        if (dragged) applyReorder(drag.groupKey, drag.rows, dragged, rowKey);
      },
    },
      h("div", { className: "dmm-server-top" },
        h("span", { className: `dmm-tag ${transportTone}` }, h("span", { className: "dots" }), server.transport),
        h("span", { className: "dmm-server-name", title: server.name }, server.name),
        h("button", {
          className: "dmm-switch", role: "switch", "aria-checked": server.enabled,
          disabled: !source.writable || isBusy,
          title: server.enabled ? t("switchDisable") : t("switchEnable"),
          onClick: () => mutate(server.enabled ? "/disable" : "/enable", { source: source.key, name: server.name }, server.enabled ? t("toastDisabled") : t("toastEnabled")),
        })),
      h("div", { className: "dmm-server-cmd", title: server.summary }, server.summary),
      h("div", { className: "dmm-server-foot" },
        h("span", { className: `dmm-tag ${server.enabled ? "green" : "gray"}` }, h("span", { className: "dots" }), server.enabled ? t("enabledTag") : t("disabledTag")),
        h("span", { style: { flex: 1 } }),
        h("button", { className: "dmm-btn dmm-btn-secondary dmm-btn-sm", onClick: () => setModal({ type: "json", name: server.name, spec: server.spec }) }, t("detailJson")),
        h("button", { className: "dmm-btn dmm-btn-secondary dmm-btn-sm", disabled: !source.writable, onClick: () => setModal({ type: "edit", source: source.key, name: server.name, spec: server.spec }) }, t("detailEdit")),
        h("button", { className: "dmm-btn dmm-btn-danger dmm-btn-sm", disabled: !source.writable, onClick: () => setModal({ type: "delete", source: source.key, name: server.name }) }, t("detailDelete"))));
  };

  const sourceSection = (group: { key: string; label: string; sources: SourceView[]; servers: Array<{ source: SourceView; server: ServerView }> }) => {
    const { key, label, sources: groupSources, servers } = group;
    const isCollapsed = collapsed[key] !== false; // 默认收起，显式展开过才是 false
    const primary = groupSources[0];
    const hasError = groupSources.some((s) => s.error);
    const readonly = groupSources.every((s) => !s.writable);
    const toggle = () => setCollapsedPersist((cur) => ({ ...cur, [key]: !isCollapsed }));
    return h("section", { className: "dmm-card", key },
      h("div", {
        className: "dmm-card-head", role: "button", tabIndex: 0, "aria-expanded": !isCollapsed,
        onClick: toggle,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        },
      },
        agentIcon(primary.group ? primary.group : primary.key, 34, label),
        h("div", { className: "grow" },
          h("div", { className: "dmm-card-title" }, label),
          h("div", { className: "dmm-card-sub", title: groupSources.map((s) => s.path ?? "").join("\n") },
            groupSources.map((s) => s.path ?? "—").join("  ·  "))),
        hasError ? h("span", { className: "dmm-tag red" }, h("span", { className: "dots" }), t("errorTag")) : null,
        groupSources.some((s) => s.overridden) ? h("span", { className: "dmm-tag yellow" }, t("overriddenTag")) : null,
        readonly ? h("span", { className: "dmm-tag gray" }, t("readonlyTag")) : null,
        primary.key.startsWith("custom-") ? h("span", { className: "dmm-tag cyan" }, t("customTag")) : null,
        primary.discovered ? h("span", { className: "dmm-tag cyan" }, t("autoTag")) : null,
        h("span", { className: "dmm-nav-count" }, servers.length),
        h("button", {
          className: "dmm-icon-btn", title: t("editPath"),
          onClick: (e: React.MouseEvent) => { e.stopPropagation(); setModal({ type: "rootPath", source: primary }); },
        }, icon(ICONS.folder)),
        h("button", {
          className: "dmm-icon-btn",
          title: isCollapsed ? t("expand") : t("collapse"),
          onClick: (e: React.MouseEvent) => { e.stopPropagation(); toggle(); },
        }, h("span", { className: `dmm-chevron${isCollapsed ? " folded" : ""}`, style: { display: "inline-flex" } }, icon(ICONS.chevron)))),
      h("div", { className: `dmm-collapse${isCollapsed ? " closed" : ""}` },
        h("div", { className: "dmm-collapse-inner" },
          servers.length
            ? h("div", { className: "dmm-server-grid" }, servers.map((row) => serverCard(row.source, row.server, { groupKey: key, rows: servers })))
            : h("div", { className: "dmm-empty" }, primary.error ?? t("emptySource")))));
  };

  const backupRow = (backup: BackupEntry) =>
    h("div", { className: "dmm-backup-row", key: backup.id },
      h("span", { className: "dmm-tag blue" }, backup.sourceLabel),
      h("div", { className: "grow" },
        h("div", null, `${new Date(backup.createdAt).toLocaleString()} · ${backup.reason}`),
        h("div", { className: "dmm-backup-path", title: backup.targetPath }, backup.targetPath)),
      h("span", { className: "dmm-tag gray" }, `${(backup.size / 1024).toFixed(1)} KB`),
      h("button", { className: "dmm-btn dmm-btn-secondary dmm-btn-sm", onClick: () => setModal({ type: "restore", backup }) }, t("restore")),
      h("button", { className: "dmm-btn dmm-btn-danger dmm-btn-sm", onClick: () => setModal({ type: "deleteBackup", backup }) }, t("deleteBackup")));

  return h("div", { className: "dmm", "data-theme": theme, ref: rootRef },
    h("style", null, BOARD_CSS),
    h("div", { className: "dmm-app" },
      h("div", { className: "dmm-topbar" },
        h("div", { className: "dmm-search" },
          icon(ICONS.search),
          h("input", { value: query, placeholder: t("searchPlaceholder"), onChange: (e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value) })),
        h("select", {
          className: "dmm-select dmm-filter-select", value: statusFilter, title: t("filterStatus"),
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value as "all" | "on" | "off"),
        },
          h("option", { value: "all" }, t("statusAll")),
          h("option", { value: "on" }, t("statusOn")),
          h("option", { value: "off" }, t("statusOff"))),
        h("select", {
          className: "dmm-select dmm-filter-select", value: nav,
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setNav(e.target.value),
        },
          h("option", { value: "all" }, t("filterAgentAll")),
          groups.map((g) => h("option", { key: g.key, value: g.key }, `${g.label} (${g.sources.reduce((n, s) => n + s.servers.length, 0)})`)),
          h("option", { value: "backups" }, `${t("navBackups")} (${totals.backups})`)),
        h("button", { className: "dmm-icon-btn", title: t("addSource"), onClick: () => setModal({ type: "customSource" }) }, icon(ICONS.plus)),
        h("div", { className: "grow" }),
        h("button", { className: "dmm-icon-btn", title: t("refresh"), onClick: () => refresh() }, icon(ICONS.refresh)),
        h("button", { className: "dmm-btn dmm-btn-primary", onClick: () => setModal({ type: "edit", source: nav !== "all" && nav !== "backups" ? nav : (sources[0]?.key ?? "") }) },
          icon(ICONS.plus), t("addServer"))),
      h("div", { className: "dmm-page-head" },
        h("div", { className: "grow" },
          h("div", { className: "dmm-page-title" }, t("title")),
          h("div", { className: "dmm-page-sub" }, t("subtitle"))),
        h("button", {
          className: "dmm-btn dmm-btn-secondary dmm-btn-sm",
          onClick: () => {
            const allCollapsedNow = grouped.every((g) => collapsed[g.key] !== false);
            setCollapsedPersist((cur) => {
              const next = { ...cur };
              for (const g of grouped) next[g.key] = !allCollapsedNow ? true : false;
              return next;
            });
          },
        }, icon(ICONS.fold, 12), grouped.every((g) => collapsed[g.key] !== false) ? t("expandAll") : t("collapseAll"))),
      warnings.length ? h("div", { className: "dmm-warn" }, warnings.map((w, i) => h("div", { key: i }, w.error))) : null,
      h("div", { className: "dmm-kpi-grid" },
        kpiCard(t("kpiAgents"), totals.agents, "a"),
        kpiCard(t("kpiServers"), totals.servers, "s"),
        kpiCard(t("kpiEnabled"), totals.enabled, "e"),
        kpiCard(t("kpiBackups"), totals.backups, "b")),
      loadError ? h("div", { className: "dmm-card" }, h("div", { className: "dmm-empty" }, `${t("loadFailed")}: ${loadError}`))
        : !snapshot ? h("div", { className: "dmm-card" }, h("div", { className: "dmm-loading" }, t("loading")))
        : nav === "backups"
          ? h("section", { className: "dmm-card" },
              h("div", { className: "dmm-card-head" }, h("div", { className: "dmm-card-title" }, t("navBackups"))),
              backups.length ? h("div", { className: "dmm-backup-list" }, backups.map(backupRow)) : h("div", { className: "dmm-empty" }, t("backupEmpty")))
          : grouped.length
            ? grouped.map(sourceSection)
            : h("div", { className: "dmm-card" }, h("div", { className: "dmm-empty" }, t("empty")))),
    // ---------- toast ----------
    toasts.length ? h("div", { className: "dmm-toast-wrap" }, toasts.map((item) => h("div", { key: item.id, className: `dmm-toast${item.err ? " err" : ""}` }, item.text))) : null,
    // ---------- 回到顶部 ----------
    h("button", {
      className: `dmm-totop${showTop ? " show" : ""}`, title: t("backToTop"), onClick: scrollToTop,
      style: { right: topPos.right, bottom: topPos.bottom },
    }, h("span", { style: { display: "inline-flex", transform: "rotate(180deg)" } }, icon(ICONS.chevron, 16))),
    // ---------- 弹窗 ----------
    modal ? renderModal(modal, { t, sources, busy, setModal, mutate, toast }) : null);
}

// ---------- 弹窗渲染 ----------
function renderModal(
  modal: NonNullable<ModalState>,
  ctx: {
    t: (k: string) => string;
    sources: SourceView[];
    busy: string | null;
    setModal: (m: ModalState) => void;
    mutate: (path: string, body: Record<string, unknown>, done: string) => Promise<void>;
    toast: (text: string, err?: boolean) => void;
  },
) {
  const { t, setModal, mutate } = ctx;
  const close = () => setModal(null);
  const overlay = (children: React.ReactNode, wide = false) =>
    h(ModalShell, { onClose: close, wide }, children);
  const head = (title: string) =>
    h("div", { className: "dmm-modal-head" },
      h("div", { className: "dmm-modal-title" }, title),
      h("button", { className: "dmm-close", onClick: close }, icon(ICONS.close)));

  switch (modal.type) {
    case "json":
      return overlay([
        head(`${modal.name} · JSON`),
        h("div", { className: "dmm-modal-body", key: "b" },
          h("textarea", { className: "dmm-textarea", readOnly: true, style: { minHeight: 260 }, value: JSON.stringify(modal.spec, null, 2) })),
        h("div", { className: "dmm-modal-foot", key: "f" },
          h("button", { className: "dmm-btn dmm-btn-secondary", onClick: close }, t("cancel"))),
      ], true);

    case "delete":
      return overlay([
        head(t("confirmDeleteTitle")),
        h("div", { className: "dmm-modal-body", key: "b" }, h("div", null, `${modal.name} — ${t("confirmDeleteDesc")}`)),
        h("div", { className: "dmm-modal-foot", key: "f" },
          h("button", { className: "dmm-btn dmm-btn-secondary", onClick: close }, t("cancel")),
          h("button", { className: "dmm-btn dmm-btn-danger", onClick: () => mutate("/delete", { source: modal.source, name: modal.name }, t("toastDeleted")) }, t("confirmDelete"))),
      ]);

    case "restore":
      return overlay([
        head(t("confirmRestoreTitle")),
        h("div", { className: "dmm-modal-body", key: "b" },
          h("div", null, `${modal.backup.sourceLabel} · ${new Date(modal.backup.createdAt).toLocaleString()}`),
          h("div", { className: "dmm-backup-path" }, modal.backup.targetPath),
          h("div", null, t("confirmRestoreDesc"))),
        h("div", { className: "dmm-modal-foot", key: "f" },
          h("button", { className: "dmm-btn dmm-btn-secondary", onClick: close }, t("cancel")),
          h("button", { className: "dmm-btn dmm-btn-primary", onClick: () => mutate("/backup-restore", { id: modal.backup.id }, t("toastRestored")) }, t("confirmRestore"))),
      ]);

    case "deleteBackup":
      return overlay([
        head(t("deleteBackup")),
        h("div", { className: "dmm-modal-body", key: "b" },
          h("div", null, `${modal.backup.sourceLabel} · ${new Date(modal.backup.createdAt).toLocaleString()}`),
          h("div", { className: "dmm-backup-path" }, modal.backup.file)),
        h("div", { className: "dmm-modal-foot", key: "f" },
          h("button", { className: "dmm-btn dmm-btn-secondary", onClick: close }, t("cancel")),
          h("button", { className: "dmm-btn dmm-btn-danger", onClick: () => mutate("/backup-delete", { id: modal.backup.id }, t("toastDeleted")) }, t("confirmDelete"))),
      ]);

    case "rootPath":
      return h(RootPathModal, { modal, t, close, mutate, toast: ctx.toast });

    case "customSource":
      return h(CustomSourceModal, { t, close, mutate });

    case "edit":
      return h(EditServerModal, { modal, t, sources: ctx.sources, close, mutate });
  }
}

// ---------- 编辑/新增服务器弹窗 ----------
function EditServerModal(props: {
  modal: { type: "edit"; source: string; name?: string; spec?: McpServerSpec };
  t: (k: string) => string;
  sources: SourceView[];
  close: () => void;
  mutate: (path: string, body: Record<string, unknown>, done: string) => Promise<void>;
}) {
  const { modal, t, sources, close, mutate } = props;
  const spec = modal.spec ?? {};
  const [source, setSource] = useState(modal.source);
  const [name, setName] = useState(modal.name ?? "");
  const [mode, setMode] = useState<"form" | "raw">("form");
  const [transport, setTransport] = useState<TransportKind>(spec.url ? (/sse/i.test(spec.url) ? "sse" : "http") : "stdio");
  const [command, setCommand] = useState(spec.command ?? "");
  const [args, setArgs] = useState((spec.args ?? []).join("\n"));
  const [env, setEnv] = useState(Object.entries(spec.env ?? {}).map(([k, v]) => `${k}=${v}`).join("\n"));
  const [url, setUrl] = useState(spec.url ?? "");
  const [headers, setHeaders] = useState(Object.entries(spec.headers ?? {}).map(([k, v]) => `${k}=${v}`).join("\n"));
  const [raw, setRaw] = useState(() => JSON.stringify(spec, null, 2));
  const isEdit = modal.name !== undefined;

  const kvParse = (text: string): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const line of text.split("\n")) {
      const eq = line.indexOf("=");
      if (eq > 0) out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
    return out;
  };

  const submit = () => {
    const body: Record<string, unknown> = { source, name: name.trim() };
    if (mode === "raw") {
      body.raw = raw;
    } else if (isEdit) {
      // 编辑时以「原始定义」为底，只覆盖表单里改的字段，未识别字段（如 note、type）原样保留
      const merged: Record<string, unknown> = { ...(modal.spec ?? {}) };
      delete merged.command;
      delete merged.args;
      delete merged.env;
      delete merged.url;
      delete merged.headers;
      delete merged.serverUrl;
      if (transport === "stdio") {
        merged.command = command;
        const argList = args.split("\n").map((s) => s.trim()).filter(Boolean);
        if (argList.length) merged.args = argList;
        const envObj = kvParse(env);
        if (Object.keys(envObj).length) merged.env = envObj;
      } else {
        merged.url = url;
        const headerObj = kvParse(headers);
        if (Object.keys(headerObj).length) merged.headers = headerObj;
      }
      body.raw = JSON.stringify(merged);
    } else if (transport === "stdio") {
      body.transport = "stdio";
      body.command = command;
      body.args = args.split("\n").map((s) => s.trim()).filter(Boolean);
      const envObj = kvParse(env);
      if (Object.keys(envObj).length) body.env = envObj;
    } else {
      body.transport = transport;
      body.url = url;
      const headerObj = kvParse(headers);
      if (Object.keys(headerObj).length) body.headers = headerObj;
    }
    mutate("/upsert", body, t("toastSaved"));
  };

  return h(ModalShell, { onClose: close },
      h("div", { className: "dmm-modal-head" },
        h("div", { className: "dmm-modal-title" }, isEdit ? t("modalEditTitle") : t("modalAddTitle")),
        h("div", { className: "dmm-segmented" },
          h("button", { "aria-selected": mode === "form", onClick: () => setMode("form") }, t("modeForm")),
          h("button", { "aria-selected": mode === "raw", onClick: () => setMode("raw") }, t("modeRaw"))),
        h("button", { className: "dmm-close", onClick: close }, icon(ICONS.close))),
      h("div", { className: "dmm-modal-body" },
        h("div", { className: "dmm-field" },
          h("label", { className: "dmm-field-label" }, t("fieldSource")),
          h("select", { className: "dmm-select", value: source, disabled: isEdit, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setSource(e.target.value) },
            sources.filter((s) => s.writable).map((s) => h("option", { key: s.key, value: s.key }, s.label)))),
        h("div", { className: "dmm-field" },
          h("label", { className: "dmm-field-label" }, t("fieldName")),
          h("input", { className: "dmm-input", value: name, disabled: isEdit, placeholder: "my-mcp-server", onChange: (e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value) })),
        mode === "form"
          ? [
              h("div", { className: "dmm-field", key: "tr" },
                h("label", { className: "dmm-field-label" }, t("fieldTransport")),
                h("div", { className: "dmm-segmented" },
                  (["stdio", "http", "sse"] as const).map((kind) =>
                    h("button", { key: kind, "aria-selected": transport === kind, onClick: () => setTransport(kind) }, kind)))),
              transport === "stdio"
                ? [
                    h("div", { className: "dmm-field", key: "cmd" },
                      h("label", { className: "dmm-field-label" }, t("fieldCommand")),
                      h("input", { className: "dmm-input", value: command, placeholder: "npx", onChange: (e: React.ChangeEvent<HTMLInputElement>) => setCommand(e.target.value) })),
                    h("div", { className: "dmm-field", key: "args" },
                      h("label", { className: "dmm-field-label" }, t("fieldArgs")),
                      h("textarea", { className: "dmm-textarea", style: { minHeight: 72 }, value: args, placeholder: "-y\n@modelcontextprotocol/server-filesystem", onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => setArgs(e.target.value) })),
                    h("div", { className: "dmm-field", key: "env" },
                      h("label", { className: "dmm-field-label" }, t("fieldEnv")),
                      h("textarea", { className: "dmm-textarea", style: { minHeight: 72 }, value: env, onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => setEnv(e.target.value) })),
                  ]
                : [
                    h("div", { className: "dmm-field", key: "url" },
                      h("label", { className: "dmm-field-label" }, t("fieldUrl")),
                      h("input", { className: "dmm-input", value: url, placeholder: "https://example.com/mcp", onChange: (e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value) })),
                    h("div", { className: "dmm-field", key: "hd" },
                      h("label", { className: "dmm-field-label" }, t("fieldHeaders")),
                      h("textarea", { className: "dmm-textarea", style: { minHeight: 72 }, value: headers, placeholder: "Authorization=Bearer …", onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => setHeaders(e.target.value) })),
                  ],
            ]
          : h("div", { className: "dmm-field" },
              h("label", { className: "dmm-field-label" }, t("fieldRaw")),
              h("textarea", { className: "dmm-textarea", style: { minHeight: 240 }, value: raw, onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => setRaw(e.target.value) }))),
      h("div", { className: "dmm-modal-foot" },
        h("button", { className: "dmm-btn dmm-btn-secondary", onClick: close }, t("cancel")),
        h("button", { className: "dmm-btn dmm-btn-primary", onClick: submit }, t("save"))));
}

// ---------- 改路径弹窗 ----------
function RootPathModal(props: {
  modal: { type: "rootPath"; source: SourceView };
  t: (k: string) => string;
  close: () => void;
  mutate: (path: string, body: Record<string, unknown>, done: string) => Promise<void>;
  toast: (text: string, err?: boolean) => void;
}) {
  const { modal, t, close, mutate, toast } = props;
  const [path, setPath] = useState(modal.source.path ?? "");
  return h(ModalShell, { onClose: close },
      h("div", { className: "dmm-modal-head" },
        h("div", { className: "dmm-modal-title" }, `${t("rootPathTitle")} · ${modal.source.label}`),
        h("button", { className: "dmm-close", onClick: close }, icon(ICONS.close))),
      h("div", { className: "dmm-modal-body" },
        h("div", { className: "dmm-field" },
          h("label", { className: "dmm-field-label" }, t("configPath")),
          h("input", { className: "dmm-input", value: path, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setPath(e.target.value) }),
          h("div", { className: "dmm-field-hint" }, modal.source.path ?? ""))),
      h("div", { className: "dmm-modal-foot" },
        h("button", {
          className: "dmm-btn dmm-btn-secondary", style: { marginRight: "auto" },
          onClick: () => callApi("/open-folder", { method: "POST", headers: MUTATION_HEADERS, body: JSON.stringify({ source: modal.source.key }) })
            .catch((err) => toast(`${t("toastFailed")}: ${err instanceof Error ? err.message : String(err)}`, true)),
        }, icon(ICONS.folder, 13), t("openFolder")),
        modal.source.overridden
          ? h("button", { className: "dmm-btn dmm-btn-secondary", onClick: () => mutate("/root-path", { key: modal.source.key, path: null }, t("toastSaved")) }, t("rootPathReset"))
          : null,
        h("button", { className: "dmm-btn dmm-btn-secondary", onClick: close }, t("cancel")),
        h("button", { className: "dmm-btn dmm-btn-primary", onClick: () => mutate("/root-path", { key: modal.source.key, path }, t("toastSaved")) }, t("rootPathSave"))));
}

// ---------- 自定义来源弹窗 ----------
function CustomSourceModal(props: {
  t: (k: string) => string;
  close: () => void;
  mutate: (path: string, body: Record<string, unknown>, done: string) => Promise<void>;
}) {
  const { t, close, mutate } = props;
  const [path, setPath] = useState("");
  const [label, setLabel] = useState("");
  return h(ModalShell, { onClose: close },
      h("div", { className: "dmm-modal-head" },
        h("div", { className: "dmm-modal-title" }, t("customSourceTitle")),
        h("button", { className: "dmm-close", onClick: close }, icon(ICONS.close))),
      h("div", { className: "dmm-modal-body" },
        h("div", { className: "dmm-field" },
          h("label", { className: "dmm-field-label" }, t("customSourcePath")),
          h("input", { className: "dmm-input", value: path, placeholder: "C:\\Users\\you\\tool\\mcp.json", onChange: (e: React.ChangeEvent<HTMLInputElement>) => setPath(e.target.value) })),
        h("div", { className: "dmm-field" },
          h("label", { className: "dmm-field-label" }, t("customSourceLabel")),
          h("input", { className: "dmm-input", value: label, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setLabel(e.target.value) }))),
      h("div", { className: "dmm-modal-foot" },
        h("button", { className: "dmm-btn dmm-btn-secondary", onClick: close }, t("cancel")),
        h("button", { className: "dmm-btn dmm-btn-primary", onClick: () => mutate("/custom-source-add", { path, label }, t("toastSaved")) }, t("save"))));
}

// ---------- 入口 ----------
const NS = "mcp-manager";

// ---------- 设置侧栏导航图标（用户提供的双 C 环线稿，用 currentColor 适配明暗主题） ----------
function McpNavIcon(props?: { size?: number }) {
  const size = props?.size ?? 16;
  // viewBox 收紧到图形实际边界（含描边），否则在 16px 图标里图形只占一半、显得偏小偏左
  return h("svg", {
    xmlns: "http://www.w3.org/2000/svg", viewBox: "8 14 72 72", width: size, height: size, "aria-hidden": true,
  },
    h("path", { d: "M50 22 A 24 24 0 1 0 50 78", stroke: "currentColor", strokeWidth: 8, fill: "none", strokeLinecap: "round" }),
    h("path", { d: "M50 34 A 16 16 0 1 1 50 66", stroke: "currentColor", strokeWidth: 8, fill: "none", strokeLinecap: "round" }),
  );
}

export function apply(ctx: ClientContext) {
  const t = makeT(ctx);

  const renderPanel = () => h(McpManagerApp, { t });

  // 设置页入口
  if (ctx.slots && typeof ctx.slots.inject === "function") {
    try {
      ctx.slots.inject("settings.section", () => {
        try {
          return ctx.slots!.register(
            { name: "settings.section", id: "mcp-manager", order: 26, label: () => t("title"), locale: NS },
            () => h("div", { style: { minHeight: "70vh" } }, renderPanel()),
          );
        } catch (reason) {
          console.warn("mcp-manager: register settings.section failed:", reason);
          return () => {};
        }
      });
    } catch (reason) {
      console.warn("mcp-manager: inject settings.section failed:", reason);
    }

    // 设置侧栏的专属图标：宿主声明该槽位时才注册，老宿主不声明则自动跳过
    try {
      ctx.slots.inject("settings.section.icon", () => {
        try {
          return ctx.slots!.register(
            { name: "settings.section.icon", id: "mcp-manager", locale: NS },
            McpNavIcon as React.ComponentType<{ size?: number }>,
          );
        } catch (reason) {
          console.warn("mcp-manager: register settings.section.icon failed:", reason);
          return () => {};
        }
      });
    } catch (reason) {
      console.warn("mcp-manager: inject settings.section.icon failed:", reason);
    }
  }
}

export const inject = ["slots", "locale"];
export const name = "mcp-manager";
