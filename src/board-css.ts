// BoardUI 语义 token 体系（参照 boardui.com 公布值）：基元 → 语义两层，
// 换主题只重指语义变量。全部样式挂在 .dmm 根类下，与 DSH 宿主隔离。

export const BOARD_CSS = `
.dmm {
  --n-50:#fafafa; --n-100:#f5f5f5; --n-200:#e5e5e5; --n-300:#d4d4d4;
  --n-400:#a3a3a3; --n-500:#737373; --n-600:#525252; --n-700:#404040;
  --n-800:#262626; --n-900:#171717; --n-925:#121212; --n-950:#0a0a0a;
  /* 主题色：直接继承 DSH 宿主的主强调色（--dsw-alias-state-business-primary，浅色为
     --dsw-static-deepseek-500 = rgb(65,118,230)），宿主没定义时回退 BoardUI 蓝。
     整套 accent 色阶用 color-mix 从一个基色推导，因此换主题只动一个变量就能全局跟随。 */
  --dmm-accent: var(--dsw-alias-state-business-primary, #4176e6);
  --accent-50:color-mix(in srgb, var(--dmm-accent) 12%, #fff);
  --accent-100:color-mix(in srgb, var(--dmm-accent) 22%, #fff);
  --accent-200:color-mix(in srgb, var(--dmm-accent) 40%, #fff);
  --accent-300:color-mix(in srgb, var(--dmm-accent) 62%, #fff);
  --accent-400:color-mix(in srgb, var(--dmm-accent) 82%, #fff);
  --accent-500:var(--dmm-accent);
  --accent-600:color-mix(in srgb, var(--dmm-accent) 84%, #000);
  --accent-700:color-mix(in srgb, var(--dmm-accent) 68%, #000);
  --bg-full:#ffffff;
  --bg-canvas:#fafafa;
  --bg-primary-default:#ffffff;
  --bg-primary-hover:var(--n-100);
  --bg-secondary-default:var(--n-100);
  --bg-secondary-hover:var(--n-200);
  --bg-tertiary-default:var(--n-200);
  --text-primary:var(--n-950);
  --text-secondary:var(--n-500);
  --text-tertiary:var(--n-400);
  --text-disabled:var(--n-300);
  --text-error:#ef4444;
  --border-button-default:var(--n-200);
  --border-button-hover:var(--n-300);
  --border-button-active:var(--n-400);
  --border-table:var(--n-200);
  --border-focus-ring:var(--accent-500);
  --status-success-bg:#d9f99d; --status-success-text:#3f6212;
  --status-error-bg:#fecdd3;   --status-error-text:#9f1239;
  --status-yellow-bg:#fef08a;  --status-yellow-text:#854d0e;
  --status-blue-bg:#bfdbfe;    --status-blue-text:#1e40af;
  --status-cyan-bg:#a5f3fc;    --status-cyan-text:#155e75;
  --status-purple-bg:#f3e8ff;  --status-purple-text:#9333ea;
  --r-card:16px;
  --r-ctl:10px;
  --r-chip:6px;
  --r-pill:999px;
  --card-shadow:0 1px 2px rgba(10,10,10,.04);
  --font: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  --mono: ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace;
  --ease: cubic-bezier(.4,0,.2,1);

  box-sizing:border-box;
  font-family:var(--font);
  font-size:14px; line-height:20px;
  color:var(--text-primary);
  background:var(--bg-canvas);
  min-height:100%;
  -webkit-font-smoothing:antialiased;
}
.dmm[data-theme="dark"] {
  --bg-full:#121212;
  --bg-canvas:#0a0a0a;
  --bg-primary-default:#262626;
  --bg-primary-hover:#404040;
  --bg-secondary-default:#171717;
  --bg-secondary-hover:#262626;
  --bg-tertiary-default:#262626;
  --text-primary:var(--n-50);
  --text-secondary:var(--n-500);
  --text-tertiary:var(--n-600);
  --text-disabled:var(--n-800);
  --text-error:#f87171;
  --border-button-default:#404040;
  --border-button-hover:var(--n-500);
  --border-button-active:var(--n-600);
  --border-table:#262626;
  --status-success-bg:rgba(63,98,18,.6); --status-success-text:#84cc16;
  --status-error-bg:rgba(159,18,57,.6);  --status-error-text:#fb7185;
  --status-yellow-bg:rgba(113,63,18,.6); --status-yellow-text:#eab308;
  --status-blue-bg:rgba(30,64,175,.6);   --status-blue-text:#93c5fd;
  --status-cyan-bg:rgba(21,94,117,.6);   --status-cyan-text:#22d3ee;
  --status-purple-bg:rgba(88,28,135,.5); --status-purple-text:#d8b4fe;
  --card-shadow:0 1px 2px rgba(0,0,0,.4);
}
.dmm *, .dmm *::before, .dmm *::after { box-sizing:border-box; }
.dmm button { font-family:inherit; }

/* ---------- 应用外壳：竖向单列（适配设置页窄面板） ---------- */
.dmm-app {
  display:flex;
  flex-direction:column;
  gap:16px;
  padding:16px 4px;
  min-height:60vh;
}

/* ---------- 顶部筛选下拉（紧凑，与搜索框同排） ----------
   双类名提高优先级：必须压过后面 .dmm-select{width:100%} 的通用规则。 */
.dmm .dmm-filter-select {
  width:auto; min-width:0; height:34px;
  padding:0 8px;
  border-radius:var(--r-ctl);
  cursor:pointer;
  font-size:13px;
  flex:0 1 auto;
}

/* ---------- 主区 ---------- */
.dmm-main { min-width:0; display:flex; flex-direction:column; gap:16px; }
.dmm-topbar { display:flex; align-items:center; gap:10px; padding:0 2px; flex-wrap:wrap; }
.dmm-topbar .grow { flex:1; }

.dmm-search {
  display:flex; align-items:center; gap:8px;
  flex:1 1 180px; min-width:140px; height:34px; padding:0 10px;
  background:var(--bg-primary-default);
  border:1px solid var(--border-button-default);
  border-radius:var(--r-ctl);
  color:var(--text-tertiary);
  transition:border-color .12s var(--ease), box-shadow .12s var(--ease);
}
.dmm-search:focus-within { border-color:var(--border-focus-ring); box-shadow:0 0 0 3px color-mix(in srgb, var(--accent-500) 22%, transparent); }
.dmm-search input {
  flex:1; border:0; outline:0; background:transparent; min-width:0;
  font-family:inherit; font-size:14px; color:var(--text-primary);
}
.dmm-search input::placeholder { color:var(--text-tertiary); }

.dmm-icon-btn {
  width:34px; height:34px; flex:none;
  display:grid; place-items:center;
  border-radius:var(--r-ctl);
  border:1px solid var(--border-button-default);
  background:var(--bg-primary-default);
  color:var(--text-secondary);
  cursor:pointer;
  transition:background .12s var(--ease), color .12s var(--ease), border-color .12s var(--ease);
}
.dmm-icon-btn:hover { background:var(--bg-primary-hover); color:var(--text-primary); border-color:var(--border-button-hover); }

/* ---------- 按钮 ---------- */
.dmm-btn {
  display:inline-flex; align-items:center; justify-content:center; gap:6px;
  height:34px; padding:0 14px;
  border-radius:var(--r-ctl);
  border:1px solid transparent;
  font-family:inherit; font-size:14px; line-height:20px; font-weight:500;
  cursor:pointer; white-space:nowrap;
  transition:background .12s var(--ease), border-color .12s var(--ease), box-shadow .12s var(--ease), transform .06s var(--ease);
}
.dmm-btn:active { transform:translateY(.5px); }
.dmm-btn:disabled { opacity:.5; cursor:not-allowed; transform:none; }
.dmm-btn-primary {
  color:#fff;
  background:linear-gradient(135deg, var(--accent-500), var(--accent-600));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.18), 0 1px 2px rgba(10,10,10,.12);
}
.dmm-btn-primary:hover { box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 2px 6px rgba(10,10,10,.18); }
.dmm-btn-secondary {
  background:var(--bg-primary-default);
  border-color:var(--border-button-default);
  color:var(--text-primary);
}
.dmm-btn-secondary:hover { background:var(--bg-primary-hover); border-color:var(--border-button-hover); }
.dmm-btn-danger { background:var(--bg-primary-default); border-color:var(--border-button-default); color:var(--text-error); }
.dmm-btn-danger:hover { background:var(--status-error-bg); border-color:transparent; }
.dmm-btn-sm { height:28px; padding:0 10px; font-size:13px; border-radius:var(--r-chip); }

/* ---------- 页头 ---------- */
.dmm-page-head { display:flex; align-items:flex-end; gap:12px; padding:4px 2px 0; }
.dmm-page-head .grow { flex:1; min-width:0; }
.dmm-page-title { font-size:24px; line-height:32px; font-weight:600; letter-spacing:-0.02em; }
.dmm-page-sub { color:var(--text-secondary); font-size:14px; line-height:20px; margin-top:4px; }

/* ---------- KPI（紧凑横排：左标签右数字） ---------- */
.dmm-kpi-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
.dmm-kpi {
  display:flex; align-items:baseline; justify-content:space-between; gap:10px;
  padding:12px 16px;
  background:var(--bg-primary-default);
  border:1px solid var(--border-button-default);
  border-radius:var(--r-ctl);
  box-shadow:var(--card-shadow);
}
.dmm-kpi-label { color:var(--text-secondary); font-size:13px; line-height:18px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dmm-kpi-n { font-size:22px; line-height:28px; font-weight:600; letter-spacing:-0.01em; font-variant-numeric:tabular-nums; flex:none; }

/* ---------- 折叠箭头 ---------- */
.dmm-chevron { display:inline-flex; transition:transform .18s var(--ease); }
.dmm-chevron.folded { transform:rotate(-90deg); }

/* ---------- agent 品牌图标 ---------- */
.dmm-agent-icon { display:inline-flex; align-items:center; flex:none; color:var(--text-primary); line-height:0; }
.dmm-agent-icon svg { width:1em; height:1em; }

/* ---------- 计数 pill（卡片头部用） ---------- */
.dmm-nav-count {
  min-width:20px; height:18px; padding:0 6px; flex:none;
  border-radius:var(--r-pill); background:var(--bg-tertiary-default);
  color:var(--text-secondary); font-size:11px; line-height:18px; text-align:center;
  font-variant-numeric:tabular-nums;
}

/* ---------- 卡片 ---------- */
.dmm-card {
  background:var(--bg-primary-default);
  border:1px solid var(--border-button-default);
  border-radius:var(--r-card);
  box-shadow:var(--card-shadow);
}
/* ---------- 卡片头（滚动时吸附在面板顶部，后一个顶走前一个） ---------- */
.dmm-card { position:relative; }
.dmm-card-head {
  position:sticky; top:-1px; z-index:20;
  display:flex; align-items:center; gap:10px; padding:16px 16px 12px;
  background:var(--bg-primary-default);
  border-radius:var(--r-card) var(--r-card) 0 0;
  cursor:pointer;
  user-select:none;
  transition:background .12s var(--ease);
}
.dmm-card-head:hover { background:var(--bg-primary-hover); }
.dmm-card-head:focus-visible { outline:2px solid var(--border-focus-ring); outline-offset:-2px; }
.dmm-card-head .grow { flex:1; min-width:0; }
.dmm-card-head .dmm-tag { flex:none; }
.dmm-card-title { font-size:16px; line-height:22px; font-weight:600; }
.dmm-card-sub {
  font-size:12px; line-height:16px; letter-spacing:.15px; color:var(--text-tertiary); margin-top:2px;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}

/* ---------- 折叠动画（grid-rows 0fr↔1fr 技巧） ---------- */
/* 不做高度过渡：grid-template-rows 的 fr 过渡在部分 Chromium 上会卡在展开高度，导致收不起来 */
.dmm-collapse { display:grid; grid-template-rows:1fr; }
.dmm-collapse.closed { grid-template-rows:0fr; }
.dmm-collapse-inner { overflow:hidden; min-height:0; }

/* ---------- 服务器卡片网格 ---------- */
.dmm-server-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:12px; padding:0 16px 16px; }
.dmm-server {
  display:flex; flex-direction:column; gap:10px;
  padding:14px;
  border:1px solid var(--border-button-default);
  border-radius:var(--r-ctl);
  background:var(--bg-primary-default);
  transition:border-color .12s var(--ease), box-shadow .12s var(--ease);
}
.dmm-server:hover { border-color:var(--border-button-hover); box-shadow:var(--card-shadow); }
.dmm-server.off { opacity:.62; }
.dmm-server[draggable="true"] { cursor:grab; }
.dmm-server.dragging { opacity:.45; cursor:grabbing; border-style:dashed; }
.dmm-server.drag-over { border-color:var(--accent-500); }
.dmm-server-top { display:flex; align-items:center; gap:8px; min-width:0; }
.dmm-server-name { font-size:14px; font-weight:600; line-height:20px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; min-width:0; }
.dmm-server-cmd {
  font-family:var(--mono); font-size:12px; line-height:18px;
  color:var(--text-secondary);
  background:var(--bg-secondary-default);
  border-radius:var(--r-chip);
  padding:6px 8px;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.dmm-server-foot { display:flex; align-items:center; gap:8px; }

/* ---------- 标签 ---------- */
.dmm-tag {
  display:inline-flex; align-items:center; gap:5px; flex:none;
  padding:2px 8px; border-radius:var(--r-pill);
  font-size:12px; line-height:16px; letter-spacing:.15px; font-weight:500;
}
.dmm-tag .dots { width:5px; height:5px; border-radius:50%; background:currentColor; }
.dmm-tag.green { background:var(--status-success-bg); color:var(--status-success-text); }
.dmm-tag.red { background:var(--status-error-bg); color:var(--status-error-text); }
.dmm-tag.yellow { background:var(--status-yellow-bg); color:var(--status-yellow-text); }
.dmm-tag.blue { background:var(--status-blue-bg); color:var(--status-blue-text); }
.dmm-tag.cyan { background:var(--status-cyan-bg); color:var(--status-cyan-text); }
.dmm-tag.purple { background:var(--status-purple-bg); color:var(--status-purple-text); }
.dmm-tag.gray { background:var(--bg-secondary-default); color:var(--text-secondary); }
.dmm-tag.accent { background:var(--accent-50); color:var(--accent-700); }

/* ---------- 开关 ---------- */
.dmm-switch {
  width:38px; height:22px; border-radius:var(--r-pill); flex:none;
  background:var(--bg-tertiary-default);
  border:0; padding:0; cursor:pointer; position:relative;
  transition:background .2s var(--ease);
}
.dmm-switch::after {
  content:""; position:absolute; top:2px; left:2px;
  width:18px; height:18px; border-radius:50%; background:#fff;
  box-shadow:0 1px 3px rgba(10,10,10,.28);
  transition:transform .24s cubic-bezier(.34,1.56,.64,1);
}
.dmm-switch[aria-checked="true"] { background:var(--accent-500); }
.dmm-switch[aria-checked="true"]::after { transform:translateX(16px); }
.dmm-switch:disabled { opacity:.5; cursor:not-allowed; }

/* ---------- 备份列表 ---------- */
.dmm-backup-list { display:flex; flex-direction:column; padding:0 16px 16px; }
.dmm-backup-row {
  display:flex; align-items:center; gap:12px;
  padding:12px 0;
  border-bottom:1px solid var(--border-table);
}
.dmm-backup-row:last-child { border-bottom:0; }
.dmm-backup-row .grow { flex:1; min-width:0; }
.dmm-backup-path { font-family:var(--mono); font-size:12px; color:var(--text-tertiary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* ---------- 空态 / 加载 ---------- */
.dmm-empty { padding:48px 16px; text-align:center; color:var(--text-tertiary); font-size:13px; }
.dmm-loading { padding:48px 16px; text-align:center; color:var(--text-secondary); font-size:13px; }

/* ---------- 警告条 ---------- */
.dmm-warn {
  display:flex; gap:8px; align-items:flex-start;
  padding:10px 14px;
  border-radius:var(--r-ctl);
  background:var(--status-yellow-bg); color:var(--status-yellow-text);
  font-size:13px; line-height:18px;
}

/* ---------- 弹窗 ---------- */
.dmm-overlay {
  position:fixed; inset:0; z-index:1000;
  background:rgba(10,10,10,.45);
  display:flex; align-items:center; justify-content:center;
  padding:24px;
}
.dmm-modal {
  width:560px; max-width:100%; max-height:calc(100vh - 96px);
  display:flex; flex-direction:column;
  background:var(--bg-primary-default);
  border:1px solid var(--border-button-default);
  border-radius:var(--r-card);
  box-shadow:0 12px 40px rgba(10,10,10,.2);
  overflow:hidden;
}
/* 目录弹层固定高度：加载 / 结果切换时窗口不伸缩，列表在内部滚动 */
.dmm-modal.dmm-modal-fixed { height:min(760px, calc(100vh - 96px)); }
.dmm-modal-fixed .dmm-modal-body { flex:1; min-height:0; }
.dmm-modal-head { display:flex; align-items:center; gap:10px; padding:16px 16px 12px; }
.dmm-modal-title { font-size:16px; line-height:22px; font-weight:600; flex:1; }
.dmm-modal-body { padding:0 16px 16px; overflow-y:auto; display:flex; flex-direction:column; gap:12px; }
.dmm-modal-foot { display:flex; justify-content:flex-end; gap:8px; padding:12px 16px 16px; border-top:1px solid var(--border-table); }
.dmm-close { border:0; background:transparent; cursor:pointer; color:var(--text-tertiary); width:28px; height:28px; display:grid; place-items:center; border-radius:var(--r-chip); }
.dmm-close:hover { background:var(--bg-primary-hover); color:var(--text-primary); }

/* ---------- 表单 ---------- */
.dmm-field { display:flex; flex-direction:column; gap:6px; }
.dmm-field-label { font-size:13px; line-height:18px; font-weight:500; color:var(--text-primary); }
.dmm-field-hint { font-size:12px; line-height:16px; color:var(--text-tertiary); }
.dmm-input, .dmm-textarea, .dmm-select {
  width:100%;
  border:1px solid var(--border-button-default);
  border-radius:var(--r-ctl);
  background:var(--bg-primary-default);
  color:var(--text-primary);
  font-family:inherit; font-size:14px; line-height:20px;
  padding:7px 10px;
  outline:0;
  transition:border-color .12s var(--ease), box-shadow .12s var(--ease);
}
.dmm-input:focus, .dmm-textarea:focus, .dmm-select:focus { border-color:var(--border-focus-ring); box-shadow:0 0 0 3px color-mix(in srgb, var(--accent-500) 22%, transparent); }
.dmm-textarea { font-family:var(--mono); font-size:12px; line-height:18px; min-height:120px; resize:vertical; }
.dmm-kv-row { display:flex; gap:8px; align-items:center; }
.dmm-kv-row .dmm-input { flex:1; }

/* ---------- 分段控件 ---------- */
.dmm-segmented {
  position:relative; display:inline-flex; align-items:center;
  padding:3px; gap:2px;
  background:var(--bg-secondary-default);
  border-radius:var(--r-ctl);
}
.dmm-segmented button {
  border:0; background:transparent; cursor:pointer;
  font-family:inherit; font-size:13px; line-height:18px; font-weight:500;
  color:var(--text-secondary);
  padding:4px 12px; border-radius:calc(var(--r-ctl) - 3px);
  transition:color .15s var(--ease), background .15s var(--ease);
}
.dmm-segmented button[aria-selected="true"] {
  color:var(--text-primary);
  background:var(--bg-primary-default);
  box-shadow:0 1px 3px rgba(10,10,10,.1);
}

/* ---------- 回到顶部悬浮按钮 ---------- */
.dmm-totop {
  position:fixed; bottom:20px; right:20px; z-index:900;
  width:38px; height:38px; border-radius:var(--r-pill);
  display:grid; place-items:center;
  border:1px solid var(--border-button-default);
  background:var(--bg-primary-default);
  color:var(--text-secondary);
  cursor:pointer;
  box-shadow:0 4px 16px rgba(10,10,10,.14);
  opacity:0; pointer-events:none; transform:translateY(8px);
  transition:opacity .2s var(--ease), transform .2s var(--ease), background .12s var(--ease), color .12s var(--ease);
}
.dmm-totop.show { opacity:1; pointer-events:auto; transform:translateY(0); }
.dmm-totop:hover { background:var(--accent-500); border-color:transparent; color:#fff; }

/* ---------- toast ---------- */
.dmm-toast-wrap { position:fixed; bottom:20px; left:50%; transform:translateX(-50%); z-index:1200; display:flex; flex-direction:column; gap:8px; align-items:center; }
.dmm-toast {
  padding:8px 14px; border-radius:var(--r-pill);
  background:var(--n-900); color:var(--n-50);
  font-size:13px; line-height:18px;
  box-shadow:0 6px 24px rgba(10,10,10,.2);
  max-width:70vw; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.dmm[data-theme="dark"] .dmm-toast { background:var(--n-100); color:var(--n-900); }
.dmm-toast.err { background:var(--status-error-text); color:#fff; }

/* ---------- 连接器目录 ---------- */
.dmm-catalog-subtitle { font-size:13px; color:var(--text-secondary); margin-bottom:10px; }
.dmm-catalog-search { display:flex; gap:8px; margin-bottom:6px; }
.dmm-catalog-search .dmm-input { flex:1; }
.dmm-catalog-list { display:flex; flex-direction:column; gap:10px; margin-top:10px; }
.dmm-catalog-card {
  display:flex; gap:12px; align-items:flex-start;
  padding:12px; border:1px solid var(--border-table); border-radius:var(--r-ctl);
  background:var(--bg-primary-default);
}
.dmm-catalog-main { flex:1; min-width:0; }
/* 加载骨架屏：脉冲占位，不做整卡透明 */
.dmm-skel { background:var(--bg-secondary-default); border-radius:6px; animation:dmm-skel-pulse 1.3s ease-in-out infinite; }
.dmm-skel-icon { flex:none; width:38px; height:38px; border-radius:9px; }
.dmm-skel-line { height:12px; }
@keyframes dmm-skel-pulse { 0%,100% { opacity:.55; } 50% { opacity:1; } }
@media (prefers-reduced-motion: reduce) { .dmm-skel { animation:none; } }
.dmm-catalog-icon {
  flex:none; width:38px; height:38px; border-radius:9px;
  position:relative; overflow:hidden;
  display:flex; align-items:center; justify-content:center;
  background:var(--bg-secondary-default); border:1px solid var(--border-table);
  color:var(--text-secondary); font-weight:600; font-size:15px;
}
.dmm-catalog-icon img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.dmm-catalog-title { display:flex; align-items:center; gap:6px; flex-wrap:wrap; font-weight:600; font-size:14px; }
.dmm-catalog-desc { font-size:13px; line-height:19px; color:var(--text-secondary); margin-top:4px; }
.dmm-catalog-meta { margin-top:4px; font-size:12px; color:var(--text-tertiary); }
.dmm-catalog-meta code { font-family:var(--mono); }
.dmm-catalog-warn {
  margin-top:6px; padding:6px 8px; border-radius:var(--r-chip);
  background:var(--status-yellow-bg); color:var(--status-yellow-text);
  font-size:12px; line-height:17px;
}
.dmm-catalog-installs { display:flex; flex-direction:column; gap:6px; margin-top:8px; }
.dmm-catalog-install {
  display:flex; align-items:center; gap:8px;
  padding:6px 8px; border-radius:var(--r-chip);
  background:var(--bg-secondary-default);
}
.dmm-catalog-install-name { font-size:12.5px; color:var(--text-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dmm-catalog-actions { flex:none; display:flex; flex-direction:row; gap:6px; align-items:flex-start; }
.dmm-detail-section { margin-top:14px; }
.dmm-detail-section-title { font-size:12px; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:.04em; margin-bottom:6px; }
.dmm-detail-grid, .dmm-detail-list { display:flex; flex-direction:column; gap:6px; }
.dmm-detail-row { display:flex; gap:10px; align-items:flex-start; font-size:13px; line-height:18px; }
.dmm-detail-label { flex:0 0 124px; color:var(--text-secondary); }
.dmm-detail-value { flex:1; min-width:0; word-break:break-all; }
.dmm-code-block {
  margin:0; padding:8px 10px; border-radius:var(--r-chip);
  background:var(--bg-secondary-default); color:var(--text-primary);
  font-family:var(--mono); font-size:12px; line-height:18px;
  white-space:pre-wrap; word-break:break-all;
}
.dmm-readme {
  height:min(340px, 46vh); overflow:auto;
  padding:8px 10px;
  border:1px solid var(--border-table); border-radius:var(--r-chip);
  background:var(--bg-primary-default);
  font-size:13px; line-height:20px;
}
.dmm-readme-skel { display:flex; flex-direction:column; gap:10px; padding-top:2px; }
.dmm-md-p { margin:4px 0; white-space:pre-wrap; }
.dmm-md-h1 { font-size:16px; font-weight:600; margin:12px 0 6px; }
.dmm-md-h2 { font-size:15px; font-weight:600; margin:10px 0 5px; }
.dmm-md-h3 { font-size:14px; font-weight:600; margin:8px 0 4px; }
.dmm-md-list { margin:4px 0; padding-left:18px; }
.dmm-md-list li { margin:2px 0; }
.dmm-md-code {
  font-family:var(--mono); font-size:12px;
  padding:1px 4px; border-radius:4px;
  background:var(--bg-secondary-default);
}
.dmm-catalog-more { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:10px; }
.dmm-modal-head .dmm-segmented { flex-wrap:nowrap; overflow-x:auto; min-width:0; max-width:100%; scrollbar-width:thin; }
.dmm-modal-head .dmm-segmented button { flex:none; white-space:nowrap; }
.dmm-rank-card {
  display:flex; gap:12px; align-items:flex-start;
  padding:12px; border:1px solid var(--border-table); border-radius:var(--r-ctl);
  background:var(--bg-primary-default);
}
.dmm-rank-no {
  flex:none; width:30px; height:30px; border-radius:50%;
  display:flex; align-items:center; justify-content:center;
  font-size:13px; font-weight:600; font-variant-numeric:tabular-nums;
  background:var(--bg-secondary-default); color:var(--text-secondary);
}
.dmm-rank-card:nth-child(-n+3) .dmm-rank-no { background:var(--status-yellow-bg); color:var(--status-yellow-text); }
.dmm-rank-author { font-size:12px; color:var(--text-secondary); }
.dmm-rank-metrics { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:6px; }
.dmm-link { color:var(--accent-600); text-decoration:none; }
.dmm-link:hover { text-decoration:underline; }
.dmm[data-theme="dark"] .dmm-link { color:var(--accent-300); }
.dmm[data-theme="dark"] .dmm-tag.accent { background:var(--accent-700); color:var(--n-50); }
.dmm-catalog-meta .dmm-link { margin-left:8px; }
.dmm-check-list { display:flex; flex-direction:column; gap:6px; }
.dmm-check { display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer; }
.dmm-check input { accent-color:var(--accent-500); width:15px; height:15px; }
.dmm-req { color:var(--text-error); }

/* ---------- 响应式 ---------- */
@media (max-width:1080px) { .dmm-kpi-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width:640px) {
  .dmm-app { padding:12px 2px; }
  .dmm-kpi-grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
  .dmm-topbar { gap:6px; }
  .dmm-search { min-width:0; flex:1; }
}
@media (prefers-reduced-motion:reduce) {
  .dmm * { transition:none !important; animation:none !important; }
}
`;

/* ---------- 会话输入区连接器快捷选择（conversation.input.left） ----------
   挂在 composer 左排：覆盖 .dmm 外壳的背景/最小高度，只保留变量与控件样式。
   弹层 portal 到 document.body（composer 容器会裁剪 fixed 浮层），自带 .dmm 作用域。 */
export const PICKER_CSS = `
.dmm.dmm-cp {
  background:transparent; min-height:0;
  display:inline-flex; align-items:center; gap:3px;
  font-size:12px; line-height:18px;
}
.dmm-cp-btn {
  width:28px; height:28px; flex:none; padding:0; position:relative;
  display:inline-flex; align-items:center; justify-content:center;
  border-radius:8px; border:1px solid transparent; background:transparent;
  color:var(--text-secondary); cursor:pointer;
  transition:background .12s var(--ease), color .12s var(--ease);
}
.dmm-cp-btn:hover, .dmm-cp-btn.on { background:var(--bg-primary-hover); color:var(--text-primary); }
.dmm-cp-badge {
  position:absolute; top:-2px; right:-4px; min-width:14px; height:14px; padding:0 3px;
  display:inline-flex; align-items:center; justify-content:center;
  border-radius:7px; border:1.5px solid var(--bg-full);
  background:var(--dmm-accent); color:#fff;
  font-size:9px; font-weight:700; line-height:1;
  pointer-events:none;
}

.dmm.dmm-cp-pop {
  position:fixed; z-index:1000; width:304px; max-height:calc(100vh - 16px); min-height:0;
  display:flex; flex-direction:column;
  background:var(--bg-full); border:1px solid var(--border-table);
  border-radius:12px; box-shadow:0 10px 32px rgba(10,10,10,.16);
  overflow:hidden; font-size:13px;
  /* 浮层滚动条契约（ui-theme styles/scrollbar.css）：抬升面的 thumb 重绑到 l2，
     全局 ::-webkit-scrollbar 规则负责画 5px 细条与配色 */
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2, rgba(0,0,0,.2));
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2, rgba(0,0,0,.34));
}
.dmm-cp-pop-head {
  padding:10px 12px 8px; display:flex; align-items:center; gap:6px;
  font-size:12px; font-weight:600; color:var(--text-secondary);
  border-bottom:1px solid var(--border-table);
}
.dmm-cp-pop-head .grow { flex:1; }
.dmm-cp-search { padding:8px 10px 2px; }
.dmm-cp-search input {
  width:100%; height:28px; padding:0 8px;
  border:1px solid var(--border-button-default); border-radius:8px;
  background:var(--bg-secondary-default); color:var(--text-primary);
  font-family:inherit; font-size:12px; outline:none;
  transition:border-color .12s var(--ease), background .12s var(--ease);
}
.dmm-cp-search input:focus { border-color:var(--border-focus-ring); background:var(--bg-full); }
.dmm-cp-search input::placeholder { color:var(--text-tertiary); }
/* 4 行封顶：一行 55px + 列表上下内边距 12px；再多就上下滚动 */
.dmm-cp-list { overflow-y:auto; padding:6px; max-height:232px; }
.dmm-cp-row { display:flex; align-items:center; gap:8px; padding:7px 8px; border-radius:8px; }
.dmm-cp-row:hover, .dmm-cp-row.active { background:var(--bg-primary-hover); }
.dmm-cp-row-main { flex:1; min-width:0; }
.dmm-cp-row-name {
  font-size:13px; color:var(--text-primary);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  display:flex; align-items:center; gap:6px;
}
.dmm-cp-row-sub {
  font-size:11px; color:var(--text-tertiary); margin-top:1px;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.dmm-cp-row.off .dmm-cp-row-name { color:var(--text-secondary); }
.dmm-cp-empty, .dmm-cp-err { padding:18px 14px; font-size:12px; color:var(--text-secondary); text-align:center; }
.dmm-cp-err { color:var(--text-error); }
.dmm-cp-hint {
  padding:7px 12px; font-size:11px; color:var(--text-tertiary);
  border-top:1px solid var(--border-table);
}
.dmm-cp-foot { display:flex; align-items:stretch; border-top:1px solid var(--border-table); }
.dmm-cp-act {
  flex:1; display:flex; align-items:center; justify-content:center; gap:5px;
  padding:9px 8px; border:0; background:transparent; color:var(--accent-600);
  font-family:inherit; font-size:12px; cursor:pointer;
  transition:background .12s var(--ease);
}
.dmm-cp-act + .dmm-cp-act { border-left:1px solid var(--border-table); }
.dmm-cp-act:hover { background:var(--bg-primary-hover); }
.dmm[data-theme="dark"] .dmm-cp-act { color:var(--accent-300); }
.dmm-cp-skel-row { display:flex; align-items:center; gap:8px; padding:9px 8px; }
`;
