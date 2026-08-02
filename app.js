/* ============================================================
   碎知识工作台 · 个人私密知识收纳
   纯前端 / 本地 IndexedDB 存储 / 无任何网络上传
   ============================================================ */

/* ---------- PDF.js worker ---------- */
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

/* ---------- 工具 ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const uid = (p) => p + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
const TYPE_META = {
  pdf: { icon: "📄", label: "PDF" },
  image: { icon: "🖼️", label: "图片" },
  text: { icon: "📝", label: "文字" },
};

/* ---------- 本地内容分析与概括（不上传你的内容） ---------- */
function terms(str) {
  const out = [];
  const en = (str || "").match(/[A-Za-z][A-Za-z0-9+#.\-]{2,}/g);
  if (en) out.push(...en.map((w) => w.toLowerCase()));
  const cn = (str || "").replace(/[^\u4e00-\u9fa5]/g, "");
  for (let i = 0; i < cn.length - 1; i++) out.push(cn.slice(i, i + 2));
  return out;
}
function topKeywords(text, n) {
  const stop = new Set("的了是我在你他她它们这那有和与之及也都为以而其个中是上与就而并被把让从对很更最这个们了我你了他她它那有和将够".split(""));
  const freq = {};
  for (const t of terms(text)) {
    if (t.length < 2) continue;
    if (/^[0-9]+$/.test(t)) continue;
    if (/^[a-z]/i.test(t)) { freq[t] = (freq[t] || 0) + 1; continue; }
    if (stop.has(t[0]) || stop.has(t[1])) continue;
    freq[t] = (freq[t] || 0) + 1;
  }
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}
function summarizeText(raw, maxSentences = 4) {
  const text = (raw || "").replace(/\s+/g, " ").trim();
  const stats = { chars: text.length, sentences: 0, pageCount: null };
  if (!text) return { summary: "", keywords: [], stats };
  const sentences = text
    .split(/[。！？!?；;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6);
  if (sentences.length === 0) {
    return { summary: text.slice(0, 220), keywords: topKeywords(text, 6), stats };
  }
  stats.sentences = sentences.length;
  const freq = {};
  for (const s of sentences) for (const t of terms(s)) freq[t] = (freq[t] || 0) + 1;
  const scored = sentences
    .map((s) => {
      const ts = terms(s);
      const score = ts.reduce((a, t) => a + (freq[t] || 0), 0) / Math.max(1, ts.length);
      return { s, score };
    })
    .sort((a, b) => b.score - a.score);
  const top = scored.slice(0, Math.min(maxSentences, scored.length)).map((x) => x.s);
  const ordered = sentences
    .map((s, i) => ({ s, i }))
    .filter((x) => top.includes(x.s))
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s);
  const summaryText = ordered.join("　");
  return { summary: summaryText, keywords: topKeywords(summaryText, 6), stats };
}
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => res();
    s.onerror = () => rej(new Error("脚本加载失败"));
    document.head.appendChild(s);
  });
}
async function extractPdfText(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const pdf = await pdfjsLib.getDocument(url).promise;
    let text = "";
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const c = await page.getTextContent();
      text += c.items.map((i) => i.str).join(" ") + "\n";
    }
    return { text, pageCount: pdf.numPages };
  } finally { URL.revokeObjectURL(url); }
}
async function extractImageText(blob) {
  if (!window.Tesseract) await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js");
  const url = URL.createObjectURL(blob);
  try {
    const { data } = await Tesseract.recognize(url, "chi_sim+eng");
    return data.text || "";
  } finally { URL.revokeObjectURL(url); }
}
/* 本地 AI 解析：纯前端摘要 + 关键词，不上传任何内容 */
async function summarizeWithDoubao(text) {
  const trimmed = (text || "").slice(0, 8000);
  const body = JSON.stringify({
    model: state.doubaoModel || "doubao-seed-1-6-250615",
    temperature: 0.3,
    max_tokens: 400,
    messages: [
      { role: "system", content: "你是专业的知识整理助手，善于提炼要点与生成标签。只输出要求的字段，不要多余解释。" },
      { role: "user", content: "请总结下面这段内容，并给出 3-6 个关键词。\n用如下 JSON 格式返回（不要包含代码块标记）：\n{\"summary\":\"一段话摘要，不超过 120 字\",\"keywords\":[\"关键词1\",\"关键词2\"]}\n\n文本内容：\n" + trimmed },
    ],
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  let resp;
  try {
    // 直连火山方舟：浏览器直连大概率被跨域(CORS)拦截，失败会自动回退本地
    if (!state.doubaoApiKey) throw new Error("未配置豆包 API Key");
    resp = await fetch("https://ark.cn-beijing.volces.com/api/v3/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + state.doubaoApiKey,
      },
      body,
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    throw new Error("网络/CORS 错误：" + (e.message || e));
  }
  clearTimeout(timer);
  if (!resp.ok) throw new Error("豆包返回 " + resp.status);
  const data = await resp.json();
  const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
  const jsonStr = content.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  let parsed;
  try { parsed = JSON.parse(jsonStr); } catch (_) { parsed = { summary: content.trim(), keywords: [] }; }
  return {
    summary: (parsed.summary || content.trim()).slice(0, 300),
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 8).map((k) => String(k).trim()).filter(Boolean) : [],
  };
}

async function analyzeBlob(blob, fileType) {
  let text = "", pageCount = null;
  if (fileType === "pdf") { const r = await extractPdfText(blob); text = r.text; pageCount = r.pageCount; }
  else if (fileType === "text") text = await blob.text();
  else if (fileType === "image") text = await extractImageText(blob);
  let sum, source = "local";
  const useKey = !!state.doubaoApiKey && text.trim();
  if (useKey) {
    try {
      const ai = await summarizeWithDoubao(text);
      sum = { summary: ai.summary, keywords: ai.keywords, stats: {} };
      source = "doubao";
    } catch (e) {
      console.warn("豆包概括失败，回退本地：", e);
      sum = summarizeText(text);
    }
  } else {
    sum = summarizeText(text);
  }
  sum.source = source;
  sum.stats.pageCount = pageCount;
  return sum;
}

/* ---------- IndexedDB ---------- */
const DB_NAME = "pkWorkbench", DB_VERSION = 1;
let db;
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = (e) => {
      const d = e.target.result;
      ["sections", "modules", "records"].forEach((s) => {
        if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: "id" });
      });
    };
    r.onsuccess = (e) => { db = e.target.result; res(db); };
    r.onerror = (e) => rej(e.target.error);
  });
}
const store = (name, mode) => db.transaction(name, mode).objectStore(name);
const put_ = (name, v) => new Promise((res, rej) => {
  const r = store(name, "readwrite").put(v);
  r.onsuccess = () => { res(v); };
  r.onerror = () => rej(r.error);
});
const del_ = (name, id) => new Promise((res, rej) => {
  const r = store(name, "readwrite").delete(id);
  r.onsuccess = () => { res(); };
  r.onerror = () => rej(r.error);
});
const all_ = (name) => new Promise((res, rej) => {
  const r = store(name, "readonly").getAll();
  r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error);
});
const get_ = (name, id) => new Promise((res, rej) => {
  const r = store(name, "readonly").get(id);
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});

async function persistToIDB() {
  for (const n of ["sections", "modules", "records"]) {
    const all = await all_(n);
    for (const x of all) await del_(n, x.id);
  }
  for (const s of state.sections) await put_("sections", s);
  for (const m of state.modules) await put_("modules", m);
  for (const r of state.records) await put_("records", r);
}

/* ---------- 状态 ---------- */
const PRESETS = [
  { name: "公考知识", icon: "📚", modules: ["行测技巧", "申论积累", "面试素材"] },
  { name: "公文写作", icon: "📝", modules: [] },
  { name: "生活小常识", icon: "🏡", modules: ["烹饪技巧", "买菜经验", "社保知识"] },
  { name: "驾车技巧", icon: "🚗", modules: [] },
  { name: "穿搭思路", icon: "👗", modules: [] },
  { name: "法律实务", icon: "⚖️", modules: [] },
  { name: "效率工具", icon: "⚡", modules: [] },
];

  const state = {
  sections: [], modules: [], records: [],
  activeSectionId: null,
  view: "splash",        // "splash" | "home" | "section" | "trash"
  sidebarWidth: 260,
  sidebarHidden: false,
  moduleCollapsed: {},
  globalCollapsed: false,
  gdGroupCollapsed: {},   // 全局目录分组折叠态
  recentIds: [],          // 最近浏览的记录 id（最近在前，最多 10 条）
  searchQuery: "",
  timeFilter: "all",      // 时间筛选：all | 7d | 30d | year
  doubaoApiKey: "",       // 用户自填的火山方舟 API Key（仅存本机 localStorage，直连模式用）
  doubaoModel: "doubao-seed-1-6-250615",  // 豆包模型 ID
  theme: "cream",         // 风格主题：cream | spring | summer | autumn | winter
};

/* UI 偏好持久化（不存知识内容，仅界面状态） */
function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem("pk_prefs") || "{}");
    if (typeof p.sidebarWidth === "number") state.sidebarWidth = p.sidebarWidth;
    if (typeof p.sidebarHidden === "boolean") state.sidebarHidden = p.sidebarHidden;
    if (p.moduleCollapsed) state.moduleCollapsed = p.moduleCollapsed;
    if (typeof p.globalCollapsed === "boolean") state.globalCollapsed = p.globalCollapsed;
    if (typeof p.activeSectionId === "string") state.activeSectionId = p.activeSectionId;
    if (p.view === "splash" || p.view === "home" || p.view === "section" || p.view === "trash") state.view = p.view;
    if (p.gdGroupCollapsed) state.gdGroupCollapsed = p.gdGroupCollapsed;
    if (Array.isArray(p.recentIds)) state.recentIds = p.recentIds;
    if (typeof p.doubaoApiKey === "string") state.doubaoApiKey = p.doubaoApiKey;
    if (typeof p.doubaoModel === "string") state.doubaoModel = p.doubaoModel;
    if (["cream","spring","summer","autumn","winter"].includes(p.theme)) state.theme = p.theme;
  } catch (_) {}
}
function savePrefs() {
  localStorage.setItem("pk_prefs", JSON.stringify({
    sidebarWidth: state.sidebarWidth,
    sidebarHidden: state.sidebarHidden,
    moduleCollapsed: state.moduleCollapsed,
    globalCollapsed: state.globalCollapsed,
    gdGroupCollapsed: state.gdGroupCollapsed,
    recentIds: state.recentIds,
    activeSectionId: state.activeSectionId,
    view: state.view,
    doubaoApiKey: state.doubaoApiKey,
    doubaoModel: state.doubaoModel,
    theme: state.theme,
  }));
}

/* 应用主题：同步到 <html> data-theme，供 CSS 变量读取 */
function applyTheme() {
  const t = ["cream","spring","summer","autumn","winter"].includes(state.theme) ? state.theme : "cream";
  document.documentElement.dataset.theme = t === "cream" ? "" : t;
  const btn = $("#themeBtn");
  if (btn) btn.classList.toggle("active", t !== "cream");
}

/* 打开风格选择面板 */
function openThemePicker() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal form-modal">
      <div class="modal-head">
        <div class="modal-title">🎨 切换风格</div>
        <button class="modal-close" data-close>✕</button>
      </div>
      <div class="modal-body form-body">
        <div class="theme-picker" id="themePicker"></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector(".modal").onclick = (e) => e.stopPropagation();
  overlay.onclick = () => overlay.remove();
  overlay.querySelector("[data-close]").onclick = () => overlay.remove();

  const themes = [
    { id: "cream", name: "奶油浅系", sub: "当前默认 · 软萌裸粉", cls: "tp-cream" },
    { id: "spring", name: "春日桃粉", sub: "桃花 · 柔粉", cls: "tp-spring" },
    { id: "summer", name: "夏日荷绿", sub: "荷叶 · 清绿", cls: "tp-summer" },
    { id: "autumn", name: "秋日枫红", sub: "枫叶 · 暖红", cls: "tp-autumn" },
    { id: "winter", name: "冬日雪蓝", sub: "落雪 · 雾蓝", cls: "tp-winter" },
  ];
  const picker = $("#themePicker", overlay);
  themes.forEach((th) => {
    const btn = document.createElement("button");
    btn.className = "theme-opt" + (state.theme === th.id ? " active" : "");
    btn.innerHTML = `<span class="tp-dot ${th.cls}"></span><div><div class="tp-name">${th.name}</div><div class="tp-sub">${th.sub}</div></div>`;
    btn.onclick = () => {
      state.theme = th.id;
      applyTheme();
      savePrefs();
      overlay.remove();
      toast(`已切换到「${th.name}」`);
    };
    picker.appendChild(btn);
  });
}

/* ---------- 初始化 ---------- */
async function init() {
  // 1. 打开本地数据库（失败则后续只能跑在内存模式，尽量不影响界面）
  try { await openDB(); } catch (e) { console.warn("IndexedDB 打开失败：", e); }
  try { loadPrefs(); } catch (e) { console.warn("读取偏好失败：", e); }
  // 刷新后保留上次停留的视图（loadPrefs 已恢复 state.view），不强制跳回首页
  try { applyTheme(); } catch (e) { console.warn("应用主题失败：", e); }

  // 2. 先以本地 IndexedDB 加载（离线 / file:// 也能用）
  try {
    state.sections = await all_("sections");
    state.modules = await all_("modules");
    state.records = await all_("records");
  } catch (e) {
    console.warn("读取本地数据失败：", e);
    state.sections = []; state.modules = []; state.records = [];
  }

  // 3. 没有数据时注入预设板块
  if (state.sections.length === 0) {
    try {
      await seedPresets();
      state.sections = await all_("sections");
      state.modules = await all_("modules");
    } catch (e) { console.warn("写入预设数据失败：", e); }
  }
  if (!state.activeSectionId || !state.sections.find((s) => s.id === state.activeSectionId)) {
    state.activeSectionId = state.sections[0]?.id || null;
  }

  // 6. 渲染界面 + 绑定事件（即使某一步报错也要尽量继续）
  // 移动端默认收起抽屉（避免桌面端展开的偏好盖住页面）；只在初始化时做一次，绝不打断用户点击「☰」展开
  if (window.innerWidth <= 820) state.sidebarHidden = true;
  try { applySidebar(); } catch (e) { console.warn("应用侧边栏状态失败：", e); }
  try { bindGlobalEvents(); } catch (e) { console.warn("绑定全局事件失败：", e); }
  try { renderSidebar(); } catch (e) { console.warn("渲染侧边栏失败：", e); }
  try { renderMain(); } catch (e) { console.warn("渲染主内容失败：", e); }

  // 7. 自动清理
  try { purgeExpired(); } catch (e) { console.warn("清理过期记录失败：", e); }
  setInterval(() => { try { purgeExpired(); } catch (_) {} }, 3600000);
}

async function seedPresets() {
  let order = 0;
  for (const p of PRESETS) {
    const sid = uid("sec");
    await put_("sections", { id: sid, name: p.name, icon: p.icon, order: order++, custom: false });
    let morder = 0;
    for (const m of p.modules) {
      await put_("modules", { id: uid("mod"), sectionId: sid, name: m, order: morder++, custom: false });
    }
  }
}

/* ---------- 数据查询辅助 ---------- */
const modulesOf = (sid) =>
  state.modules.filter((m) => m.sectionId === sid).sort((a, b) => a.order - b.order);
const recordsOfModule = (mid) =>
  state.records.filter((r) => r.moduleId === mid && !r.deleted);
const recordsOfSection = (sid) =>
  state.records.filter((r) => r.sectionId === sid && !r.deleted);
const sectionById = (id) => state.sections.find((s) => s.id === id);
const moduleById = (id) => state.modules.find((m) => m.id === id);
const recordById = (id) => state.records.find((r) => r.id === id);

// 星标优先：收藏的排最前，其余按更新时间倒序
const sortRecords = (recs) =>
  recs.slice().sort((a, b) => ((b.starred ? 1 : 0) - (a.starred ? 1 : 0)) || ((b.updatedAt || 0) - (a.updatedAt || 0)));

/* 二期需求：按创建时间筛选（记录已自动保存 createdAt） */
function applyTimeFilter(recs) {
  if (state.timeFilter === "all") return recs;
  const now = Date.now(), day = 86400000;
  let start;
  if (state.timeFilter === "7d") start = now - 7 * day;
  else if (state.timeFilter === "30d") start = now - 30 * day;
  else if (state.timeFilter === "year") start = new Date(new Date().getFullYear(), 0, 1).getTime();
  else return recs;
  return recs.filter((r) => (r.createdAt || 0) >= start);
}

/* ============================================================
   侧边栏
   ============================================================ */
function applySidebar() {
  // 仅根据当前 state.sidebarHidden 渲染，绝不在本函数内改写它，
  // 否则点击「☰」展开时会被立刻重新收起（移动端侧栏打不开的根因）。
  const sb = $("#sidebar");
  if (window.innerWidth > 820) sb.style.width = state.sidebarWidth + "px"; // 仅桌面端用内联宽度，移动端交给 CSS 媒体查询
  sb.classList.toggle("collapsed", state.sidebarHidden);
  $("#showSidebar").classList.toggle("hidden", !state.sidebarHidden);
  $("#resizeHandle").classList.toggle("hidden", state.sidebarHidden);
  $("#drawerBackdrop").classList.toggle("hidden", state.sidebarHidden);
}

function renderSidebar() {
  const list = $("#sectionList");
  list.innerHTML = "";
  const secs = [...state.sections].sort((a, b) => a.order - b.order);
  for (const s of secs) {
    const count = recordsOfSection(s.id).length;
    const item = document.createElement("div");
    item.className = "section-item" + (s.id === state.activeSectionId && state.view === "section" ? " active" : "");
    item.draggable = true;
    item.dataset.id = s.id;
    item.innerHTML = `
      <span class="sec-icon">${esc(s.icon || "📁")}</span>
      <span class="sec-name">${esc(s.name)}</span>
      <span class="sec-count">${count}</span>`;
    item.onclick = () => {
      state.activeSectionId = s.id; state.view = "section"; savePrefs();
      if (window.innerWidth <= 820) { state.sidebarHidden = true; applySidebar(); }
      renderSidebar(); renderMain();
    };
    bindSectionDnD(item, s.id);
    bindSectionLongPress(item, s.id);
    list.appendChild(item);
  }
  // 最近删除
  const trashCount = state.records.filter((r) => r.deleted).length;
  const trash = document.createElement("div");
  trash.className = "section-item trash-item" + (state.view === "trash" ? " active" : "");
  trash.innerHTML = `<span class="sec-icon">🗑️</span><span class="sec-name">最近删除</span><span class="sec-count">${trashCount}</span>`;
  trash.onclick = () => {
    state.view = "trash"; savePrefs();
    if (window.innerWidth <= 820) { state.sidebarHidden = true; applySidebar(); }
    renderSidebar(); renderMain();
  };
  list.appendChild(trash);
}

/* 板块拖拽排序 */
let dragId = null;
function bindSectionDnD(item, id) {
  item.addEventListener("dragstart", (e) => { dragId = id; item.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; });
  item.addEventListener("dragend", () => { dragId = null; $$(".section-item").forEach((i) => i.classList.remove("dragging", "drop-before", "drop-after")); });
  item.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (!dragId || dragId === id) return;
    const r = item.getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    item.classList.toggle("drop-after", after);
    item.classList.toggle("drop-before", !after);
  });
  item.addEventListener("dragleave", () => item.classList.remove("drop-before", "drop-after"));
  item.addEventListener("drop", (e) => {
    e.preventDefault();
    if (!dragId || dragId === id) return;
    const r = item.getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    reorderSections(dragId, id, after);
  });
}
function reorderSections(fromId, toId, after) {
  const secs = [...state.sections].sort((a, b) => a.order - b.order);
  const from = secs.find((s) => s.id === fromId);
  const idx = secs.findIndex((s) => s.id === toId);
  secs.splice(secs.indexOf(from), 1);
  secs.splice(after ? idx + 1 : idx, 0, from);
  secs.forEach((s, i) => { s.order = i; put_("sections", s); });
  renderSidebar();
}

/* 板块长按删除 */
/* 通用长按：带移动阈值（过滤手指抖动）+ 拦截原生右键/选择菜单，桌面与移动端通用 */
function attachLongPress(el, onTrigger, opts = {}) {
  let timer = null, pid = null, sx = 0, sy = 0, triggered = false;
  const THRESH = 12;                  // 移动超过该像素才算「滚动」，否则视为停留（防手指抖动误取消）
  const DUR = opts.duration || 550;   // 触发时长
  const fire = () => {
    if (triggered) return;
    triggered = true;
    el.classList.add("long-pressing");
    if (navigator.vibrate) navigator.vibrate(40);
    onTrigger();
    setTimeout(() => el.classList.remove("long-pressing"), 200);
  };
  const onDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return; // 鼠标仅左键
    if (opts.ignoreSelector && e.target.closest(opts.ignoreSelector)) return; // 操作按钮等不触发
    pid = e.pointerId; sx = e.clientX; sy = e.clientY; triggered = false;
    clearTimeout(timer);
    timer = setTimeout(fire, DUR);
  };
  const onMove = (e) => {
    if (pid === null) return;
    if (Math.abs(e.clientX - sx) > THRESH || Math.abs(e.clientY - sy) > THRESH) {
      clearTimeout(timer); timer = null;
    }
  };
  const onUp = () => { clearTimeout(timer); timer = null; };
  const onClick = (e) => {
    if (triggered) { e.preventDefault(); e.stopPropagation(); triggered = false; }
  };
  const onCtx = (e) => { e.preventDefault(); fire(); return false; }; // 移动端长按原生菜单 → 改为我们的菜单
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onUp);
  el.addEventListener("pointerleave", onUp);
  el.addEventListener("click", onClick, true);      // 捕获阶段：先于其它点击处理
  el.addEventListener("contextmenu", onCtx);         // 桌面右键 / 移动端长按系统菜单
}

function bindSectionLongPress(item, sid) {
  attachLongPress(item, () => {
    const s = sectionById(sid);
    openItemActionMenu({ title: s ? s.name : "板块", onRename: () => renameSection(sid), onDelete: () => deleteSection(sid) });
  });
}

/* 子模块长按：弹出「重命名 / 删除」菜单（与板块长按一致） */
let moduleClickSuppressUntil = 0;
function bindModuleLongPress(head, mid) {
  attachLongPress(head, () => {
    moduleClickSuppressUntil = Date.now() + 800;   // 抑制长按后的释放点击误触折叠
    const m = moduleById(mid);
    openItemActionMenu({ title: m ? m.name : "子模块", onRename: () => renameModule(mid), onDelete: () => deleteModule(mid) });
  }, { ignoreSelector: ".mh-actions" });
}

/* 长按菜单：重命名 / 删除（板块与子模块共用） */
function openItemActionMenu({ title, onRename, onDelete }) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal form-modal" style="max-width:340px">
      <div class="modal-head">
        <span class="mh-emoji">⚙️</span>
        <span class="mh-title">${esc(title)}</span>
        <button class="modal-close">×</button>
      </div>
      <div class="form-body" style="padding:16px;display:flex;flex-direction:column;gap:10px">
        <button class="act-menu-btn rename" data-act="rename">✏️ 重命名</button>
        <button class="act-menu-btn delete" data-act="delete">🗑 删除</button>
      </div>
    </div>`;
  $("#modalRoot").appendChild(overlay);
  $(".modal-close", overlay).onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  $("[data-act=rename]", overlay).onclick = () => { overlay.remove(); onRename(); };
  $("[data-act=delete]", overlay).onclick = () => { overlay.remove(); onDelete(); };
}

/* 模块拖拽排序（仅限同板块内） */
let dragModId = null;
function bindModuleDnD(head, id) {
  head.addEventListener("dragstart", (e) => {
    if (e.target.closest(".mh-actions")) { e.preventDefault(); return; }
    dragModId = id;
    head.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });
  head.addEventListener("dragend", () => {
    dragModId = null;
    $$(".module-head").forEach((h) => h.classList.remove("dragging", "drop-before", "drop-after"));
  });
  head.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (!dragModId || dragModId === id) return;
    const r = head.getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    head.classList.toggle("drop-after", after);
    head.classList.toggle("drop-before", !after);
  });
  head.addEventListener("dragleave", () => head.classList.remove("drop-before", "drop-after"));
  head.addEventListener("drop", (e) => {
    e.preventDefault();
    if (!dragModId || dragModId === id) return;
    const r = head.getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    reorderModules(dragModId, id, after);
  });
}
function reorderModules(fromId, toId, after) {
  const a = moduleById(fromId), b = moduleById(toId);
  if (!a || !b || a.sectionId !== b.sectionId) return; // 仅同板块内排序
  const mods = modulesOf(a.sectionId);
  mods.splice(mods.indexOf(a), 1);
  const idx = mods.findIndex((m) => m.id === toId);
  mods.splice(after ? idx + 1 : idx, 0, a);
  mods.forEach((m, i) => { m.order = i; put_("modules", m); });
  renderMain();
}

/* ============================================================
   主内容区
   ============================================================ */
function renderSplash() {
  const content = $("#content");
  content.innerHTML = `
    <div class="splash-view">
      <div class="splash-frame">
        <div class="splash-img-wrap">
          <img src="assets/bg.jpg" alt="小琦的 Hello Kitty 星球" />
        </div>
        <button class="splash-enter">🎀 小琦的 Hello Kitty 星球</button>
      </div>
    </div>`;
  $(".splash-enter", content).onclick = () => {
    state.view = "home";
    savePrefs();
    renderMain();
  };
}

function renderHome() {
  const content = $("#content");
  const secs = [...state.sections].sort((a, b) => a.order - b.order);
  const tiles = secs.map((s) => {
    const mods = modulesOf(s.id);
    const recs = recordsOfSection(s.id);
    return `<button class="home-tile" data-sec="${s.id}">
      <span class="ht-icon">${esc(s.icon || "📁")}</span>
      <span class="ht-name">${esc(s.name)}</span>
      <span class="ht-meta">${mods.length} 个子模块 · ${recs.length} 条记录</span>
    </button>`;
  }).join("");
  content.innerHTML = `
    <div class="home-view">
      <div class="home-hero">
        <div class="home-title">🌸 小琦的碎片库</div>
        <div class="home-sub">私人知识收纳 · 点一下进入对应模块</div>
      </div>
      <div class="home-grid">${tiles}</div>
      <div class="recents-block" id="recentsBlock">${recentsInnerHTML()}</div>
    </div>`;
  $$(".home-tile", content).forEach((t) =>
    t.addEventListener("click", () => {
      state.activeSectionId = t.dataset.sec;
      state.view = "section";
      savePrefs();
      renderSidebar();
      renderMain();
    })
  );
  bindRecentsRows($("#recentsBlock", content));
}

/* 「最近浏览」：目录形式展示最近点击的 10 条记录，仅在大模块首页底部 */
function recentsInnerHTML() {
  if (!state.recentIds.length) {
    return `<div class="empty-hint" style="padding:14px">还没有浏览记录，点开任意记录就会出现在这里</div>`;
  }
  const rows = state.recentIds
    .map((id) => recordById(id))
    .filter((r) => r && !r.deleted)
    .map((r) => {
      const m = moduleById(r.moduleId);
      const sec = sectionById(r.sectionId);
      const sub = [m ? m.name : "", sec ? sec.name : ""].filter(Boolean).join(" · ");
      return `<div class="dir-row" data-rec="${r.id}"><span class="dr-dot"></span><span class="dr-title">${esc(r.title)}</span>${sub ? `<span class="dr-sub">${esc(sub)}</span>` : ""}</div>`;
    }).join("");
  return `<div class="dir-list recents-list">${rows}</div>`;
}

function bindRecentsRows(box) {
  if (!box) return;
  $$(".dir-row", box).forEach((el) => {
    const rid = el.dataset.rec;
    bindRecordLongPress(el, rid);   // 与记录卡片一致：长按可进入多选
    el.addEventListener("click", () => {
      if (recordSelection.size > 0) { toggleRecordSelection(rid); return; }
      openRecord(rid);
    });
  });
}

function updateRecents() {
  const box = $("#recentsBlock");
  if (!box) return;                // 仅首页可见时就地刷新
  box.innerHTML = recentsInnerHTML();
  bindRecentsRows(box);
}

function markViewed(rid) {
  state.recentIds = [rid, ...state.recentIds.filter((x) => x !== rid)].slice(0, 10);
  savePrefs();
  updateRecents();                 // 若首页「最近浏览」可见则即时更新
}

function renderMain() {
  recordSelection.clear(); hideBatchBar();
  // 顶部工具栏只在内容页（板块/回收站）显示；首页/闪屏隐藏，保持干净
  $("#mainHeader").classList.toggle("hidden", state.view === "splash" || state.view === "home");
  if (state.view === "splash") { renderSplash(); return; }
  if (state.view === "home") { renderHome(); return; }
  if (state.view === "trash") { renderTrash(); return; }
  const sec = sectionById(state.activeSectionId);
  const content = $("#content");
  if (!sec) { content.innerHTML = `<div class="empty-hint"><span class="eh-emoji">🌸</span>还没有板块，点左侧「＋ 新增一级板块」开始吧</div>`; return; }
  const allRecs = applyTimeFilter(recordsOfSection(sec.id));
  const mods = modulesOf(sec.id);

  let html = `
    <div class="content-head">
      <div class="ch-icon">${esc(sec.icon || "📁")}</div>
      <div>
        <div class="ch-title">${esc(sec.name)}</div>
        <div class="ch-sub">共 ${mods.length} 个子模块 · ${allRecs.length} 条知识记录</div>
      </div>
      <button class="ch-export" data-exportsec="${sec.id}" title="导出本板块（摘要+文件）">⬇ 导出本板块</button>
      <button class="ch-delsec" data-delsec="${sec.id}" title="删除板块（含全部内容）">🗑 删板块</button>
      <select class="ch-timefilter" id="timeFilter" title="按时间筛选资料">
        <option value="all">全部时间</option>
        <option value="7d">近 7 天</option>
        <option value="30d">近 30 天</option>
        <option value="year">今年</option>
      </select>
    </div>`;

  /* 一级板块全局总目录 */
  html += panelHTML({
    id: "globalDir",
    icon: "🗂️",
    title: "全局总目录",
    count: allRecs.length,
    collapsed: state.globalCollapsed,
    body: globalDirBody(allRecs, sec.id),
  });

  /* 各二级模块卡片 + 局部目录 */
  if (mods.length === 0) {
    html += `<div class="empty-hint"><span class="eh-emoji">📂</span>该板块还没有子模块，点右上角「＋ 子模块」新增</div>`;
  } else {
    for (const m of mods) {
      const recs = applyTimeFilter(recordsOfModule(m.id));
      html += moduleCardHTML(m, recs);
    }
  }

  content.innerHTML = html;

  // 绑定折叠
  $$(".panel-head[data-panel]", content).forEach((h) =>
    h.addEventListener("click", () => {
      const id = h.dataset.panel;
      if (id === "globalDir") state.globalCollapsed = !state.globalCollapsed;
      savePrefs(); h.closest(".panel").classList.toggle("collapsed");
    })
  );
  $$(".gd-group-head", content).forEach((h) =>
    h.addEventListener("click", () => {
      const id = h.dataset.gdg;
      state.gdGroupCollapsed = state.gdGroupCollapsed || {};
      state.gdGroupCollapsed[id] = !state.gdGroupCollapsed[id];
      savePrefs(); h.closest(".gd-group").classList.toggle("collapsed");
    })
  );
  $$(".module-head", content).forEach((h) => {
    h.addEventListener("click", (e) => {
      if (e.target.closest(".mh-actions")) return;
      if (Date.now() < moduleClickSuppressUntil) return; // 长按菜单触发后的释放点击，忽略折叠
      const id = h.dataset.mod;
      state.moduleCollapsed[id] = !state.moduleCollapsed[id];
      savePrefs(); h.closest(".module-card").classList.toggle("collapsed");
    });
    bindModuleDnD(h, h.dataset.mod);
    bindModuleLongPress(h, h.dataset.mod);
  });
  // 目录/卡片点击 → 弹窗；长按进入多选模式
  $$("[data-rec]", content).forEach((el) => {
    const rid = el.dataset.rec;
    bindRecordLongPress(el, rid);
    el.addEventListener("click", (e) => {
      if (recordSelection.size > 0) {
        e.preventDefault(); e.stopPropagation();
        toggleRecordSelection(rid);
        return;
      }
      openRecord(rid);
    });
  });
  // 星标收藏（阻止冒泡，避免触发弹窗）
  $$("[data-star]", content).forEach((b) =>
    b.addEventListener("click", (e) => { e.stopPropagation(); toggleStar(b.dataset.star); })
  );
  // 导出本板块
  $$("[data-exportsec]", content).forEach((b) =>
    b.addEventListener("click", () => exportSection(b.dataset.exportsec))
  );
  $$("[data-delsec]", content).forEach((b) =>
    b.addEventListener("click", () => deleteSection(b.dataset.delsec))
  );
  const tf = content.querySelector("#timeFilter");
  if (tf) {
    tf.value = state.timeFilter;
    tf.onchange = () => { state.timeFilter = tf.value; renderMain(); };
  }
  // 模块操作按钮
  $$("[data-addrec]", content).forEach((b) =>
    b.addEventListener("click", (e) => { e.stopPropagation(); openEditor(null, b.dataset.addrec); })
  );
  $$("[data-delmod]", content).forEach((b) =>
    b.addEventListener("click", (e) => { e.stopPropagation(); deleteModule(b.dataset.delmod); })
  );
  $$("[data-addmodhere]", content).forEach((b) =>
    b.addEventListener("click", () => openAddModule())
  );
}

function panelHTML({ id, icon, title, count, collapsed, body }) {
  return `
  <div class="panel${collapsed ? " collapsed" : ""}">
    <div class="panel-head" data-panel="${id}">
      <span class="ph-icon">${icon}</span>
      <span class="ph-title">${title}</span>
      <span class="ph-count">${count}</span>
      <span class="ph-caret">▾</span>
    </div>
    <div class="panel-body">${body}</div>
  </div>`;
}

function globalDirBody(recs, secId) {
  if (recs.length === 0) return `<div class="empty-hint"><span class="eh-emoji">🔍</span>暂无记录，去子模块里添加吧</div>`;
  // 按小模块顺序排列分组（遵循侧栏小模块的排列顺序）；组内记录仍按 sortRecords 排序
  const mods = modulesOf(secId);
  const byMod = {};
  const unclassified = [];
  for (const r of recs) {
    const m = moduleById(r.moduleId);
    if (m) { (byMod[m.id] = byMod[m.id] || []).push(r); }
    else unclassified.push(r);
  }
  let html = "";
  for (const m of mods) {
    const grp = byMod[m.id];
    if (!grp || grp.length === 0) continue;
    const collapsed = state.gdGroupCollapsed?.[m.id];
    html += `<div class="gd-group${collapsed ? " collapsed" : ""}">
      <div class="gd-group-head" data-gdg="${esc(m.id)}"><span>${esc(m.icon || "📑")} ${esc(m.name)}</span><span>${grp.length} 条</span><span class="ph-caret">▾</span></div>
      <div class="gd-group-body">${sortRecords(grp).map((r) => `<div class="dir-row" data-rec="${r.id}"><span class="dr-dot"></span><span class="dr-title">${esc(r.title)}</span></div>`).join("")}</div>
    </div>`;
  }
  if (unclassified.length) {
    const collapsed = state.gdGroupCollapsed?.["__unclassified"];
    html += `<div class="gd-group${collapsed ? " collapsed" : ""}">
      <div class="gd-group-head" data-gdg="__unclassified"><span>📁 未归类</span><span>${unclassified.length} 条</span><span class="ph-caret">▾</span></div>
      <div class="gd-group-body">${sortRecords(unclassified).map((r) => `<div class="dir-row" data-rec="${r.id}"><span class="dr-dot"></span><span class="dr-title">${esc(r.title)}</span></div>`).join("")}</div>
    </div>`;
  }
  return html;
}

function moduleCardHTML(m, recs) {
  const collapsed = !!state.moduleCollapsed[m.id];
  const localDir = recs.length
    ? `<div class="dir-list">${sortRecords(recs)
        .map((r) => `<div class="dir-row" data-rec="${r.id}"><span class="dr-dot"></span><span class="dr-title">${esc(r.title)}</span></div>`)
        .join("")}</div>`
    : `<div class="empty-hint" style="padding:16px">该子模块还没有记录</div>`;

  const cards = recs.length
    ? `<div class="record-grid">${sortRecords(recs).map(recordCardHTML).join("")}</div>`
    : "";

  return `
  <div class="module-card${collapsed ? " collapsed" : ""}">
    <div class="module-head" data-mod="${m.id}" draggable="true">
      <span class="ph-caret" title="收起 / 展开">▾</span>
      <span class="mh-grip" title="拖拽排序">⠿</span>
      <span class="mh-icon">${esc(m.icon || "📑")}</span>
      <span class="mh-title">${esc(m.name)}</span>
      <span class="mh-count">${recs.length}</span>
      <span class="mh-actions">
        <button class="icon-btn" data-addrec="${m.id}" title="新增记录">＋</button>
        <span class="mh-sep"></span>
        <button class="icon-btn mh-del" data-delmod="${m.id}" title="删除子模块">🗑</button>
      </span>
    </div>
    <div class="module-body">
      <div style="font-size:12px;color:var(--text-faint);margin:8px 2px 2px">本模块目录</div>
      ${localDir}
      <div class="module-records">${cards}</div>
    </div>
  </div>`;
}

function recordCardHTML(r) {
  const tm = TYPE_META[r.fileType] || TYPE_META.text;
  const tags = (r.tags || []).slice(0, 3).map((t) => `<span class="tag-chip">#${esc(t)}</span>`).join("");
  const relMark = r.relations && r.relations.length ? `<span class="rc-rel" title="已关联 ${r.relations.length} 条">🔗</span>` : "";
  const linkMark = r.link ? `<span class="rc-link" title="含来源链接">🌐</span>` : "";
  return `
  <div class="record-card" data-rec="${r.id}">
    <span class="rc-check">✓</span>
    ${relMark}${linkMark}
    <span class="rc-star${r.starred ? " on" : ""}" data-star="${r.id}" title="${r.starred ? "取消收藏" : "收藏"}">${r.starred ? "★" : "☆"}</span>
    <div class="rc-type">${tm.icon}</div>
    <div class="rc-title">${esc(r.title)}</div>
    <div class="rc-summary">${esc(r.summary || "（暂无摘要）")}</div>
    <div class="rc-tags">${tags}</div>
  </div>`;
}

/* 单板块备份合并导入：新增该板块及其模块/记录，并用新 id 避免冲突 */
async function mergeSectionImport(data) {
  const baseName = data.sectionName || (data.sections[0] && data.sections[0].name) || "导入板块";
  const nsid = uid("sec");
  const nsec = { ...(data.sections[0] || {}), id: nsid, name: baseName + "（导入）", order: state.sections.length, custom: true };
  await put_("sections", nsec);
  state.sections.push(nsec);
  const modMap = {};
  for (const m of (data.modules || [])) {
    const nmid = uid("mod");
    modMap[m.id] = nmid;
    await put_("modules", { ...m, id: nmid, sectionId: nsid, order: modulesOf(nsid).length, custom: true });
  }
  for (const r of (data.records || [])) {
    const rec = { ...r };
    if (rec.blob && rec._blobType !== undefined) rec.blob = b64ToBlob(rec.blob, rec._blobType);
    delete rec._blobType;
    rec.id = uid("rec");
    rec.sectionId = nsid;
    rec.moduleId = modMap[r.moduleId] || null;
    await put_("records", rec);
  }
  state.modules = await all_("modules");
  state.records = await all_("records");
  state.activeSectionId = nsid;
  renderSidebar(); renderMain();
  toast("已合并导入板块「" + nsec.name + "」");
}

/* ============================================================
   新增 / 编辑 板块、模块、记录
   ============================================================ */
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add("hidden"), 1900);
}

/* Blob <-> base64（用于备份导出/导入） */
async function blobToB64(blob) {
  if (!blob) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}
function b64ToBlob(b64, type) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: type || "application/octet-stream" });
}

/* 备份序列化：单文件 + 多图 images 一并转为 base64 */
async function serializeRec(r) {
  const out = { ...r };
  out.blob = r.blob ? await blobToB64(r.blob) : null;
  out._blobType = r.blob ? r.blob.type : null;
  if (Array.isArray(r.images) && r.images.length) {
    out.images = await Promise.all(r.images.map(async (im) => ({
      name: im.name || "",
      blob: im.blob ? await blobToB64(im.blob) : null,
      _blobType: im.blob ? im.blob.type : null,
    })));
  }
  return out;
}

/* ---------- 导入 / 导出备份 ---------- */
// 生成一份「永远有效」的单文件离线版并下载（不依赖任何服务器）
async function downloadOffline() {
  let html = null;
  try {
    const r = await fetch("index.standalone.html", { cache: "no-store" });
    if (r.ok) html = await r.text();
  } catch (_) { /* file:// 下 fetch 受限，回退到序列化自身 */ }
  if (!html) html = "<!DOCTYPE html>\n" + document.documentElement.outerHTML;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "碎知识工作台-离线版.html";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("已生成离线版：保存到任意位置（电脑/手机/网盘），双击即可永久使用");
}

async function exportData() {
  const activeRecs = state.records.filter((r) => !r.deleted);
  const records = await Promise.all(activeRecs.map((r) => serializeRec(r)));
  const data = {
    app: "pkWorkbench", version: 1, exportedAt: Date.now(),
    sections: state.sections, modules: state.modules, records,
  };
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const d = new Date(), pad = (n) => String(n).padStart(2, "0");
  a.href = url;
  a.download = `碎知识全库备份_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast("已导出全库备份（含摘要+文件）");
}

/* 单板块导出：仅该板块的模块与记录（摘要+文件） */
async function exportSection(secId) {
  const sec = sectionById(secId);
  if (!sec) return;
  const mods = modulesOf(sec.id);
  const modIds = new Set(mods.map((m) => m.id));
  const recs = state.records.filter((r) => !r.deleted && (r.sectionId === sec.id || modIds.has(r.moduleId)));
  const records = await Promise.all(recs.map((r) => serializeRec(r)));
  const data = {
    app: "pkWorkbench", version: 1, kind: "section",
    exportedAt: Date.now(), sectionName: sec.name,
    sections: [sec], modules: mods, records,
  };
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const d = new Date(), pad = (n) => String(n).padStart(2, "0");
  const safe = (sec.name || "板块").replace(/[\\/:*?"<>|]/g, "_");
  a.href = url;
  a.download = `碎知识_${safe}_备份_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`已导出板块「${sec.name}」备份（含摘要+文件）`);
}

async function importData(file) {
  const text = await file.text();
  let data = null;
  try { data = JSON.parse(text); } catch (_) { data = null; }
  // JSON 格式
  if (data && Array.isArray(data.sections) && Array.isArray(data.modules) && Array.isArray(data.records)) {
    if (data.kind === "section") { await mergeSectionImport(data); return; }
    if (!confirm("导入将覆盖当前所有板块 / 模块 / 记录，确定继续？\n（建议先点「导出备份」留存当前数据）")) return;

  for (const n of ["sections", "modules", "records"]) {
    const all = await all_(n);
    for (const x of all) await del_(n, x.id);
  }
  for (const s of data.sections) await put_("sections", s);
  for (const m of data.modules) await put_("modules", m);
  for (const r of data.records) {
    const rec = { ...r };
    if (rec.blob && rec._blobType !== undefined) rec.blob = b64ToBlob(rec.blob, rec._blobType);
    delete rec._blobType;
    if (Array.isArray(rec.images)) {
      rec.images = rec.images.map((im) => ({
        name: im.name || "",
        blob: im.blob ? b64ToBlob(im.blob, im._blobType) : null,
      }));
    }
    await put_("records", rec);
  }
  state.sections = await all_("sections");
  state.modules = await all_("modules");
  state.records = await all_("records");
  state.activeSectionId = state.sections[0]?.id || null;
  savePrefs();
  renderSidebar(); renderMain();
  toast("导入完成，已恢复全部数据");
  }
  // 文本 / Markdown 导入
  else { await importText(text); }
}

/* ---------- 文本导出 ---------- */
async function recordToTextBlock(r) {
  const sec = sectionById(r.sectionId), mod = moduleById(r.moduleId);
  const tm = TYPE_META[r.fileType] || TYPE_META.text;
  let content = "";
  try {
    if (r.fileType === "text" && r.blob) content = await r.blob.text();
    else if (r.fileType === "pdf" && r.blob && window.pdfjsLib) { const tx = await extractPdfText(r.blob); content = tx.text || ""; }
    else if (r.fileType === "image") content = `[图片文件：${(r.images && r.images.length) ? r.images.length + " 张" : (r.fileName || "未命名")}]`;
  } catch (_) { content = `[文件提取失败]`; }
  if (!content) content = r.summary || "（无内容）";
  return [
    `# ${r.title}`,
    `> 摘要：${r.summary || "（无摘要）"}`,
    `- 类型：${tm.icon} ${r.fileType} · 标签：${(r.tags || []).join(", ") || "无"} · 所属：${sec?.name || "—"} / ${mod?.name || "未归类"}`,
    "",
    "```content",
    content,
    "```",
    "",
    "===REC===",
  ].join("\n");
}
async function exportAsText(secId) {
  const sec = secId ? sectionById(secId) : null;
  let recs;
  if (sec) {
    const mods = modulesOf(sec.id), modIds = new Set(mods.map((m) => m.id));
    recs = state.records.filter((r) => !r.deleted && (r.sectionId === sec.id || modIds.has(r.moduleId)));
  } else {
    recs = state.records.filter((r) => !r.deleted);
  }
  const parts = [`# 碎知识工作台 · 导出${sec ? "（板块：" + sec.name + "）" : "（全库）"}`,
    `> 导出时间：${new Date().toLocaleString("zh-CN")} · 共 ${recs.length} 条`, "", ""];
  for (const r of recs) parts.push(await recordToTextBlock(r));
  const md = parts.join("\n");
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const d = new Date(), pad = (n) => String(n).padStart(2, "0");
  const name = sec ? `碎知识_${(sec.name || "板块").replace(/[\\/:*?"<>|]/g, "_")}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.md` : `碎知识全库_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.md`;
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
  toast(sec ? `已导出板块「${sec.name}」文本（${recs.length} 条）` : `已导出全库文本（${recs.length} 条）`);
}
async function importText(md) {
  const blocks = md.split(/^===REC===\s*$/m).map((s) => s.trim()).filter(Boolean);
  const recs = [];
  for (const b of blocks) {
    const titleM = b.match(/^#\s+(.+)$/m);
    if (!titleM) continue;
    const title = titleM[1].trim();
    const sumM = b.match(/>\s*摘要[：:]\s*(.+)$/m);
    const contentM = b.match(/```content\s*\n([\s\S]*?)\n```/);
    if (!sumM && !contentM) continue; // skip header block
    const summary = sumM ? sumM[1].trim() : "";
    const content = contentM ? contentM[1] : "";
    const tagM = b.match(/标签[：:]\s*([^\n·]*?)(?:\s*·|$)/m);
    const tags = tagM ? tagM[1].split(/[,，]/).map((t) => t.trim()).filter(Boolean) : [];
    recs.push({ id: uid("rec"), title, summary, fileType: "text", tags, blob: new Blob([content], { type: "text/plain" }), fileName: "", relations: [], starred: false, deleted: false, deletedAt: 0, createdAt: Date.now(), updatedAt: Date.now() });
  }
  if (!recs.length) { toast("未在文本中找到可导入的记录"); return; }
  const sec = sectionById(state.activeSectionId) || state.sections[0];
  const mod = sec ? modulesOf(sec.id)[0] : null;
  for (const r of recs) { r.sectionId = sec?.id || null; r.moduleId = mod?.id || null; await put_("records", r); }
  state.records = await all_("records");
  renderSidebar(); renderMain();
  toast(`已从文本导入 ${recs.length} 条记录`);
}

const ICON_OPTIONS = ["📁", "📚", "📝", "💡", "⭐", "🏷️", "🗂️", "📂", "🖼️", "🎬", "🔗", "💼", "🏠", "🍳", "🚗", "👗", "⚖️", "⚡", "🌸", "🎀", "🐱", "🌿", "🔥", "❤️", "✅", "📌", "🔒", "🔍", "📊", "🎓", "🧠", "🛠️", "🎨", "🎵", "✈️", "🎁"];

function pickIcon(defaultIcon = "📁") {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal form-modal" style="max-width:420px">
        <div class="modal-head">
          <span class="mh-emoji">🎨</span>
          <span class="mh-title">选择图标</span>
          <button class="modal-close">×</button>
        </div>
        <div class="form-body">
          <div class="icon-grid">
            ${ICON_OPTIONS.map((ico) => `<button class="icon-option${ico === defaultIcon ? " selected" : ""}" data-icon="${ico}">${ico}</button>`).join("")}
          </div>
        </div>
        <div class="form-footer">
          <button class="btn-cancel">取消</button>
          <button class="btn-save">使用默认</button>
        </div>
      </div>`;
    $("#modalRoot").appendChild(overlay);
    const close = (val) => { overlay.remove(); resolve(val); };
    $(".modal-close", overlay).onclick = () => close(defaultIcon);
    $(".btn-cancel", overlay).onclick = () => close(defaultIcon);
    $(".btn-save", overlay).onclick = () => close(defaultIcon);
    overlay.onclick = (e) => { if (e.target === overlay) close(defaultIcon); };
    $$(".icon-option", overlay).forEach((btn) =>
      btn.onclick = () => close(btn.dataset.icon)
    );
  });
}

async function addSection() {
  const name = prompt("新一级板块名称：", "新板块");
  if (!name) return;
  const icon = await pickIcon("📁");
  const order = state.sections.length;
  const s = { id: uid("sec"), name: name.trim(), icon: icon.trim(), order, custom: true, updatedAt: Date.now() };
  await put_("sections", s);
  state.sections.push(s);
  state.activeSectionId = s.id;
  savePrefs();
  renderSidebar(); renderMain();
  toast("已新增板块「" + s.name + "」");
}

async function openAddModule() {
  const sec = sectionById(state.activeSectionId);
  if (!sec) return;
  const name = prompt("在「" + sec.name + "」下新增子模块名称：");
  if (!name) return;
  const icon = await pickIcon("📑");
  const order = modulesOf(sec.id).length;
  const m = { id: uid("mod"), sectionId: sec.id, name: name.trim(), icon: icon.trim() || "📑", order, custom: true, updatedAt: Date.now() };
  await put_("modules", m);
  state.modules.push(m);
  savePrefs();
  renderSidebar(); renderMain();
  toast("已新增子模块「" + m.name + "」");
}

async function renameSection(sid) {
  const s = sectionById(sid);
  if (!s) return;
  const name = prompt("修改板块名称：", s.name);
  if (name === null) return;
  const t = name.trim();
  if (!t) return;
  s.name = t; s.updatedAt = Date.now();
  await put_("sections", s);
  renderSidebar(); renderMain();
  toast("已重命名板块「" + t + "」");
}

async function renameModule(mid) {
  const m = moduleById(mid);
  if (!m) return;
  const name = prompt("修改子模块名称：", m.name);
  if (name === null) return;
  const t = name.trim();
  if (!t) return;
  m.name = t; m.updatedAt = Date.now();
  await put_("modules", m);
  renderSidebar(); renderMain();
  toast("已重命名子模块「" + t + "」");
}

async function deleteModule(mid) {
  const m = moduleById(mid);
  if (!m) return;
  const recs = recordsOfModule(mid);
  if (!confirm(`确定删除子模块「${m.name}」？${recs.length ? `其下 ${recs.length} 条记录也会一并删除。` : ""}`)) return;
  for (const r of recs) { await del_("records", r.id); state.records = state.records.filter((x) => x.id !== r.id); }
  await del_("modules", mid);
  state.modules = state.modules.filter((x) => x.id !== mid);
  renderSidebar(); renderMain();
  toast("已删除子模块");
}

/* 一级大板块删除：二次确认防误删（PRD 十三-3） */
async function deleteSection(sid) {
  const s = sectionById(sid);
  if (!s) return;
  const mods = modulesOf(sid);
  const recCount = recordsOfSection(sid).length;
  if (!confirm(`删除板块「${s.name}」后，板块内所有知识记录（${recCount} 条）将一并移除，确认执行删除？`)) return;
  for (const m of mods) {
    const recs = recordsOfModule(m.id);
    for (const r of recs) { await del_("records", r.id); state.records = state.records.filter((x) => x.id !== r.id); }
    await del_("modules", m.id);
    state.modules = state.modules.filter((x) => x.id !== m.id);
  }
  await del_("sections", sid);
  state.sections = state.sections.filter((x) => x.id !== sid);
  if (state.activeSectionId === sid) {
    state.activeSectionId = state.sections[0]?.id || null;
    state.view = state.activeSectionId ? "section" : "home";
  }
  savePrefs(); applySidebar(); renderSidebar(); renderMain();
  toast("已删除板块「" + s.name + "」");
}

/* 记录编辑器（新增/编辑共用） */
async function openEditor(recId, presetModuleId) {
  const existing = recId ? recordById(recId) : null;
  const sec = sectionById(state.activeSectionId) || sectionById(existing?.sectionId);
  const mods = modulesOf(sec.id);
  if (mods.length === 0) { toast("请先在该板块下新增子模块"); return; }

  let fileType = existing?.fileType || "pdf";
  let pickedFile = null;     // {blob, name}（PDF 单文件）
  let pickedImages = [];     // 图片多图：[{ blob, name }]
  let chosenMid = existing?.moduleId || presetModuleId || mods[0].id;

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal form-modal">
      <div class="modal-head">
        <span class="mh-emoji">${existing ? "✏️" : "➕"}</span>
        <span class="mh-title">${existing ? "编辑知识记录" : "新增知识记录"}</span>
        <button class="modal-close">×</button>
      </div>
      <div class="form-body">
        <div class="field">
          <label>归属子模块</label>
          <select id="f_module"></select>
        </div>
        <div class="field">
          <label>自定义标题（选填，留空自动用文件名）</label>
          <input type="text" id="f_title" placeholder="例如：行测资料分析速算技巧" />
        </div>
        <div class="field">
          <label>标签（用空格或逗号分隔，用于搜索）</label>
          <input type="text" id="f_tags" placeholder="速算, 资料分析, 技巧" />
        </div>
        <div class="field">
          <label>🔗 来源链接（选填，记录出处，详情里可一键跳转）</label>
          <input type="url" id="f_link" placeholder="https://… 粘贴原链接" />
        </div>
        <div class="field">
          <label>内容类型</label>
          <div class="type-tabs">
            <div class="type-tab" data-t="pdf">📄 PDF 文件</div>
            <div class="type-tab" data-t="image">🖼️ 图片</div>
            <div class="type-tab" data-t="text">📝 纯文字</div>
          </div>
        </div>
        <div class="field" id="f_fileWrap">
          <label>上传文件（本地，仅存于本机）</label>
          <div class="file-drop" id="f_drop">点击或拖拽文件到此处<br/><span style="font-size:12px;color:var(--text-faint)">支持 PDF / 多张图片（图片可一次选择多张）</span></div>
          <div class="file-name" id="f_fname"></div>
          <div class="img-thumbs" id="f_thumbs"></div>
          <input type="file" id="f_file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp" class="hidden" />
        </div>
        <div class="field">
          <div class="field-head">
            <label>内容摘要（选填，弹窗中展示）</label>
            <button type="button" id="f_analyze" class="mini-btn">✨ 智能概括</button>
          </div>
          <textarea id="f_summary" placeholder="记录这条知识的核心要点、笔记或心得…（也可点上方按钮自动概括）"></textarea>
          <div class="hint">上传文件后点「✨ 智能概括」可自动提取文本并生成摘要与标签（纯本地处理，不上传）。</div>
        </div>
        ${fileType === "text" || !existing ? "" : `<div class="field"><div class="hint">已存在原文件，重新上传可替换；留空则保留原文件。</div></div>`}
      </div>
      <div class="form-footer">
        <button class="btn-cancel">取消</button>
        <button class="btn-save">${existing ? "保存修改" : "保存记录"}</button>
      </div>
    </div>`;
  $("#modalRoot").appendChild(overlay);

  const fModule = $("#f_module", overlay);
  mods.forEach((m) => {
    const o = document.createElement("option");
    o.value = m.id; o.textContent = m.name;
    if (m.id === chosenMid) o.selected = true;
    fModule.appendChild(o);
  });
  fModule.onchange = () => (chosenMid = fModule.value);

  $("#f_title", overlay).value = existing?.title || "";
  $("#f_tags", overlay).value = (existing?.tags || []).join(", ");
  $("#f_summary", overlay).value = existing?.summary || "";
  $("#f_link", overlay).value = existing?.link || "";

  const setType = (t) => {
    fileType = t;
    $$(".type-tab", overlay).forEach((x) => x.classList.toggle("active", x.dataset.t === t));
    const wrap = $("#f_fileWrap", overlay);
    const fi = $("#f_file", overlay);
    if (t === "text") { wrap.style.display = "none"; }
    else {
      wrap.style.display = "";
      // 图片支持一次多选；PDF 仍为单文件
      fi.multiple = (t === "image");
      fi.accept = (t === "image")
        ? ".jpg,.jpeg,.png,.gif,.webp,image/*"
        : ".pdf,application/pdf";
    }
  };
  $$(".type-tab", overlay).forEach((x) =>
    x.addEventListener("click", () => setType(x.dataset.t))
  );
  setType(fileType);

  const drop = $("#f_drop", overlay), fileInput = $("#f_file", overlay), fname = $("#f_fname", overlay);
  const thumbsEl = $("#f_thumbs", overlay);

  // 已选图片缩略图（支持删除单张）
  const renderImageThumbs = () => {
    thumbsEl.innerHTML = "";
    if (!pickedImages.length) { thumbsEl.classList.remove("show"); return; }
    thumbsEl.classList.add("show");
    pickedImages.forEach((im, idx) => {
      const cell = document.createElement("div");
      cell.className = "img-thumb";
      const img = document.createElement("img");
      img.src = URL.createObjectURL(im.blob);
      img.onload = () => URL.revokeObjectURL(img.src);
      const del = document.createElement("button");
      del.type = "button"; del.className = "img-thumb-del"; del.textContent = "×";
      del.onclick = (e) => { e.stopPropagation(); pickedImages.splice(idx, 1); renderImageThumbs(); };
      cell.appendChild(img); cell.appendChild(del);
      thumbsEl.appendChild(cell);
    });
    fname.textContent = "已选择 " + pickedImages.length + " 张图片";
  };

  const onFiles = (files) => {
    if (!files || !files.length) return;
    if (fileType === "pdf") {
      const f = files[0];
      if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) { toast("请选择 PDF 文件"); return; }
      pickedFile = { blob: f, name: f.name };
      fname.textContent = "已选择：" + f.name + "（" + (f.size / 1024).toFixed(0) + " KB）";
      // 标题留空时，自动用文件名（去扩展名）作为标题
      if (!$("#f_title", overlay).value.trim()) {
        $("#f_title", overlay).value = f.name.replace(/\.[^.]+$/, "");
      }
    } else if (fileType === "image") {
      const ok = [];
      for (const f of files) { if (f.type.startsWith("image/")) ok.push({ blob: f, name: f.name }); }
      if (!ok.length) { toast("请选择图片文件"); return; }
      pickedImages = pickedImages.concat(ok);   // 可多次选择，累积多图
      renderImageThumbs();
      if (!$("#f_title", overlay).value.trim()) {
        $("#f_title", overlay).value = ok[0].name.replace(/\.[^.]+$/, "");
      }
    }
  };
  drop.onclick = () => fileInput.click();
  fileInput.onchange = () => onFiles(fileInput.files);
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("drag"); };
  drop.ondragleave = () => drop.classList.remove("drag");
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("drag"); onFiles(e.dataTransfer.files); };

  // 编辑已有图片记录：把原图（单图或多图）预填进已选列表
  if (existing && existing.fileType === "image") {
    pickedImages = existing.images
      ? existing.images.map((i) => ({ blob: i.blob, name: i.name }))
      : (existing.blob ? [{ blob: existing.blob, name: existing.fileName }] : []);
    if (pickedImages.length) renderImageThumbs();
  }

  // 一键分析概括
  $("#f_analyze", overlay).onclick = async () => {
    let blob = null;
    if (fileType === "image") blob = pickedImages[0]?.blob || existing?.images?.[0]?.blob || null;
    else blob = pickedFile ? pickedFile.blob : existing?.blob || null;
    if (!blob) { toast("请先上传文件，再点概括"); return; }
    const btn = $("#f_analyze", overlay);
    const original = btn.textContent;
    btn.disabled = true; btn.textContent = "分析中…";
    try {
      const r = await analyzeBlob(blob, fileType);
      if (r.summary) $("#f_summary", overlay).value = r.summary;
      const tagInput = $("#f_tags", overlay);
      if (!tagInput.value.trim() && r.keywords && r.keywords.length) {
        tagInput.value = r.keywords.slice(0, 5).join(", ");
      }
      const pages = r.stats.pageCount ? `（${r.stats.pageCount} 页）` : "";
      if (r.source === "doubao" || r.source === "doubao-proxy") toast("✨ 豆包已生成摘要" + pages);
      else toast((state.doubaoApiKey ? "豆包调用失败，已用本地概括" : "已生成内容概括") + pages);
    } catch (e) {
      toast("概括失败：" + (e.message || e));
    } finally {
      btn.disabled = false; btn.textContent = original;
    }
  };

  $(".modal-close", overlay).onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  $(".btn-cancel", overlay).onclick = () => overlay.remove();

  $(".btn-save", overlay).onclick = async () => {
    let title = $("#f_title", overlay).value.trim();
    if (!title) {
      if (pickedFile) title = pickedFile.name.replace(/\.[^.]+$/, "");
      else if (existing && existing.title) title = existing.title;
      else title = "未命名记录";
    }
    const tags = $("#f_tags", overlay).value.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean);
    const summary = $("#f_summary", overlay).value.trim();
    const link = $("#f_link", overlay).value.trim();

    let blob = existing?.blob || null;
    let fileName = existing?.fileName || "";
    let images = existing?.images || null;
    if (fileType === "text") {
      blob = null; fileName = ""; images = null;
    } else if (fileType === "image") {
      if (pickedImages.length) { images = pickedImages; blob = null; fileName = ""; }
      else if (!existing && !images) { toast("请上传至少一张图片"); return; }
      else if (!pickedImages.length && existing?.images) { images = existing.images; }  // 编辑时未重选，保留原图
      blob = null; fileName = "";
    } else { // pdf
      if (pickedFile) { blob = pickedFile.blob; fileName = pickedFile.name; }
      else if (!existing && !blob) { toast("请上传 PDF 文件"); return; }
      images = null;
    }

    const now = Date.now();
    const rec = existing
      ? { ...existing, title, tags, summary, link, fileType, moduleId: chosenMid, sectionId: sec.id, blob, fileName, images, updatedAt: now }
      : { id: uid("rec"), title, tags, summary, link, fileType, moduleId: chosenMid, sectionId: sec.id, blob, fileName, images, relations: [], createdAt: now, updatedAt: now };

    await put_("records", rec);
    if (existing) state.records = state.records.map((r) => (r.id === rec.id ? rec : r));
    else state.records.push(rec);
    state.activeSectionId = sec.id;
    state.view = "section";
    savePrefs();
    overlay.remove();
    renderSidebar(); renderMain();
    toast(existing ? "已保存修改" : "记录已保存");
  };
}

async function deleteRecord(rid) {
  const rec = recordById(rid);
  if (!rec) return;
  if (!confirm("确定删除「" + (rec.title || "这条记录") + "」？将移入最近删除，7 天内可恢复。")) return;
  rec.deleted = true; rec.deletedAt = Date.now();
  await put_("records", rec);
  state.records = state.records.map((x) => (x.id === rid ? rec : x));
  for (const r of state.records) {
    if (r.relations && r.relations.includes(rid)) {
      r.relations = r.relations.filter((x) => x !== rid);
      await put_("records", r);
    }
  }
  renderSidebar(); renderMain();
  toast("已移入最近删除，7 天内可恢复");
}
async function restoreRecord(rid) {
  const rec = recordById(rid);
  if (!rec) return;
  rec.deleted = false; rec.deletedAt = 0;
  await put_("records", rec);
  state.records = state.records.map((x) => (x.id === rid ? rec : x));
  renderSidebar(); renderMain();
  toast("已恢复该记录");
}
async function purgeRecord(rid) {
  const rec = recordById(rid);
  if (!rec) return;
  if (!confirm("彻底删除后无法恢复，确定？")) return;
  await del_("records", rid);
  state.records = state.records.filter((r) => r.id !== rid);
  for (const r of state.records) {
    if (r.relations && r.relations.includes(rid)) { r.relations = r.relations.filter((x) => x !== rid); await put_("records", r); }
  }
  renderSidebar(); renderMain();
  toast("已彻底删除");
}
function purgeExpired() {
  const now = Date.now(), MAX = 7 * 86400000;
  const expired = state.records.filter((r) => r.deleted && (now - (r.deletedAt || now)) > MAX);
  if (!expired.length) return;
  (async () => {
    for (const r of expired) await del_("records", r.id);
    state.records = state.records.filter((r) => !(r.deleted && (Date.now() - (r.deletedAt || Date.now())) > MAX));
    renderSidebar(); renderMain();
  })();
}

/* ============================================================
   记录多选模式（长按进入；可批量删除 / 跨模块移动）
   ============================================================ */
let recordSelection = new Set();   // 选中的记录 id 集合（临时 UI 状态，不持久化）

function markRecordSelected(rid, on) {
  $$(`[data-rec="${rid}"]`).forEach((el) => el.classList.toggle("selected", on));
}
function enterRecordSelection(rid) {
  if (recordSelection.has(rid)) return;
  recordSelection.add(rid);
  markRecordSelected(rid, true);
  showBatchBar();
}
function toggleRecordSelection(rid) {
  if (recordSelection.has(rid)) { recordSelection.delete(rid); markRecordSelected(rid, false); }
  else { recordSelection.add(rid); markRecordSelected(rid, true); }
  if (recordSelection.size === 0) exitRecordSelection();
  else updateBatchBar();
}
function exitRecordSelection() {
  recordSelection.forEach((rid) => markRecordSelected(rid, false));
  recordSelection.clear();
  hideBatchBar();
}
function showBatchBar() { const b = $("#batchBar"); if (b) { b.classList.remove("hidden"); updateBatchBar(); } }
function hideBatchBar() { const b = $("#batchBar"); if (b) b.classList.add("hidden"); }
function updateBatchBar() { const c = $("#bbCount"); if (c) c.textContent = recordSelection.size; }

function bindRecordLongPress(el, rid) {
  attachLongPress(el, () => enterRecordSelection(rid), { duration: 550 });
}

async function deleteSelectedRecords() {
  const ids = [...recordSelection];
  if (!ids.length) return;
  if (!confirm(`确定删除选中的 ${ids.length} 条记录？将移入最近删除，7 天内可恢复。`)) return;
  for (const rid of ids) {
    const rec = recordById(rid);
    if (!rec || rec.deleted) continue;
    rec.deleted = true; rec.deletedAt = Date.now();
    await put_("records", rec);
    state.records = state.records.map((x) => (x.id === rid ? rec : x));
  }
  // 同步清理被删记录的关联关系
  for (const r of state.records) {
    const keep = (r.relations || []).filter((x) => !ids.includes(x));
    if (keep.length !== (r.relations || []).length) { r.relations = keep; await put_("records", r); }
  }
  exitRecordSelection();
  renderSidebar(); renderMain();
  toast(`已移入最近删除 ${ids.length} 条`);
}

function openModulePicker(onPick) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  let groups = "";
  for (const s of state.sections) {
    const mods = modulesOf(s.id);
    if (!mods.length) continue;
    groups += `<div class="mv-sec">${esc(s.icon || "📁")} ${esc(s.name)}</div>`;
    for (const m of mods) {
      groups += `<button class="mv-opt" data-mid="${m.id}"><span class="mv-ic">${esc(m.icon || "📑")}</span> ${esc(m.name)}</button>`;
    }
  }
  overlay.innerHTML = `<div class="modal form-modal" style="max-width:460px">
    <div class="modal-head"><span class="mh-emoji">📦</span><span class="mh-title">移动到哪个子模块</span><button class="modal-close">×</button></div>
    <div class="form-body" style="max-height:62vh;overflow:auto;padding:6px 0">${groups || '<div class="empty-hint">还没有其它子模块</div>'}</div>
    <div class="form-footer"><button class="btn-cancel">取消</button></div>
  </div>`;
  $("#modalRoot").appendChild(overlay);
  $(".modal-close", overlay).onclick = () => overlay.remove();
  $(".btn-cancel", overlay).onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  $$(".mv-opt", overlay).forEach((b) => b.onclick = () => { overlay.remove(); onPick(b.dataset.mid); });
}

async function moveSelectedRecords() {
  const ids = [...recordSelection];
  if (!ids.length) return;
  openModulePicker(async (mid) => {
    const target = moduleById(mid);
    if (!target) return;
    for (const rid of ids) {
      const rec = recordById(rid);
      if (!rec || rec.deleted) continue;
      rec.moduleId = mid; rec.sectionId = target.sectionId; rec.updatedAt = Date.now();
      await put_("records", rec);
      state.records = state.records.map((x) => (x.id === rid ? rec : x));
    }
    exitRecordSelection();
    renderSidebar(); renderMain();
    toast(`已移动 ${ids.length} 条到「${target.name}」`);
  });
}

/* ============================================================
   最近删除视图
   ============================================================ */
function renderTrash() {
  const content = $("#content");
  const trashed = state.records.filter((r) => r.deleted).sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
  const now = Date.now(), DAY = 86400000;
  const rows = trashed.length ? trashed.map((r) => {
    const tm = TYPE_META[r.fileType] || TYPE_META.text;
    const sec = sectionById(r.sectionId), mod = moduleById(r.moduleId);
    const days = Math.max(0, 7 - Math.floor((now - (r.deletedAt || now)) / DAY));
    return `<div class="trash-row" data-rec="${r.id}">
      <span class="tr-ico">${tm.icon}</span>
      <div class="tr-main">
        <div class="tr-title">${esc(r.title)}</div>
        <div class="tr-sub">${esc(sec?.name || "—")} / ${esc(mod?.name || "未归类")} · ${esc((r.summary || "").slice(0, 40))}${(r.summary || "").length > 40 ? "…" : ""}</div>
      </div>
      <div class="tr-exp">${days} 天后清除</div>
      <div class="tr-act">
        <button class="mini-btn restore" data-restore="${r.id}">恢复</button>
        <button class="mini-btn danger" data-purge="${r.id}">彻底删除</button>
      </div>
    </div>`;
  }).join("") : `<div class="empty-hint"><span class="eh-emoji">🗑️</span>回收站是空的，删除的记录会在这里保留 7 天</div>`;
  content.innerHTML = `
    <div class="content-head">
      <div class="ch-icon">🗑️</div>
      <div>
        <div class="ch-title">最近删除</div>
        <div class="ch-sub">删除的记录保留 7 天，到期自动彻底清除 · 共 ${trashed.length} 项</div>
      </div>
    </div>
    <div class="trash-list">${rows}</div>`;
  $$("[data-restore]", content).forEach((b) => b.addEventListener("click", () => restoreRecord(b.dataset.restore)));
  $$("[data-purge]", content).forEach((b) => b.addEventListener("click", () => purgeRecord(b.dataset.purge)));
}

/* 星标收藏切换：收藏的会在目录/卡片中优先展示 */
async function toggleStar(rid) {
  const rec = recordById(rid);
  if (!rec) return;
  rec.starred = !rec.starred;
  await put_("records", rec);
  state.records = state.records.map((x) => (x.id === rid ? rec : x));
  renderSidebar(); renderMain();
  toast(rec.starred ? "已加入收藏 ⭐" : "已取消收藏");
}

/* ============================================================
   记录弹窗预览（PDF / 图片 / 文字 + 摘要 + 关联）
   ============================================================ */
async function openRecord(rid) {
  const rec = recordById(rid);
  if (!rec) return;
  markViewed(rid);                 // 记入「最近浏览」（去重 + 最多 10 条）
  const sec = sectionById(rec.sectionId);
  const mod = moduleById(rec.moduleId);

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <span class="mh-emoji">${TYPE_META[rec.fileType]?.icon || "📝"}</span>
        <span class="mh-title">${esc(rec.title)}</span>
        <button class="modal-close">×</button>
      </div>
      <div class="modal-body">
        <div class="preview-pane" id="previewPane"><div class="preview-loading">加载中…</div></div>
        <div class="info-pane" id="infoPane"></div>
      </div>
    </div>`;
  $("#modalRoot").appendChild(overlay);
  $(".modal-close", overlay).onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  renderPreview($("#previewPane", overlay), rec);
  renderInfo($("#infoPane", overlay), rec);
}

async function renderPreview(pane, rec) {
  pane.innerHTML = "";
  try {
    if (rec.fileType === "text") {
      const div = document.createElement("div");
      div.className = "text-view";
      div.textContent = rec.blob ? await rec.blob.text() : (rec.summary || "（无文字内容）");
      pane.appendChild(div);
    } else if (rec.fileType === "image") {
      const imgs = (rec.images && rec.images.length)
        ? rec.images
        : (rec.blob ? [{ blob: rec.blob, name: rec.fileName }] : []);
      if (!imgs.length) {
        pane.innerHTML = `<div class="preview-loading">暂无可预览的图片</div>`;
      } else {
        const wrap = document.createElement("div");
        wrap.className = "preview-imgs";
        imgs.forEach((im) => {
          const img = document.createElement("img");
          img.src = URL.createObjectURL(im.blob);
          img.onload = () => URL.revokeObjectURL(img.src);
          wrap.appendChild(img);
        });
        pane.appendChild(wrap);
      }
    } else if (rec.fileType === "pdf" && rec.blob && window.pdfjsLib) {
      const url = URL.createObjectURL(rec.blob);
      const pdf = await pdfjsLib.getDocument(url).promise;
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: 1.25 });
        const canvas = document.createElement("canvas");
        canvas.width = vp.width; canvas.height = vp.height;
        pane.appendChild(canvas);
        await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
      }
      URL.revokeObjectURL(url);
    } else {
      pane.innerHTML = `<div class="preview-loading">暂无可预览的文件${rec.blob ? "" : "（仅文字摘要）"}</div>`;
    }
  } catch (err) {
    pane.innerHTML = `<div class="preview-loading">预览失败：${esc(err.message)}</div>`;
  }
}

function renderInfo(pane, rec) {
  const sec = sectionById(rec.sectionId);
  const mod = moduleById(rec.moduleId);
  const tags = (rec.tags || []).map((t) => `<span class="info-pill">#${esc(t)}</span>`).join("") || `<span class="info-pill">无标签</span>`;

  // 关联
  const rels = (rec.relations || []).map(recordById).filter(Boolean);
  const relChips = rels.length
    ? rels.map((r) => `<span class="rel-chip" data-openrel="${r.id}">${TYPE_META[r.fileType]?.icon || "📝"} ${esc(r.title)}</span>`).join("")
    : `<div style="font-size:12.5px;color:var(--text-faint)">暂无关联，可在下方添加跨领域串联 ↘</div>`;

  pane.innerHTML = `
    <div class="info-block">
      <div class="info-label">所属板块</div>
      <div class="info-meta-row">
        <span class="info-pill">${esc(sec?.icon || "📁")} ${esc(sec?.name || "—")}</span>
        <span class="info-pill">📑 ${esc(mod?.name || "未归类")}</span>
      </div>
    </div>
    <div class="info-block">
      <div class="info-label">标签</div>
      <div class="info-meta-row">${tags}</div>
    </div>
    <div class="info-block">
      <div class="info-label">🔗 来源链接</div>
      ${rec.link
        ? `<a class="info-link" href="${esc(rec.link)}" target="_blank" rel="noopener noreferrer">${esc(rec.link)} <span class="info-link-go">↗</span></a>`
        : `<div style="font-size:12.5px;color:var(--text-faint)">未填写来源链接</div>`}
    </div>
    <div class="info-block">
      <div class="info-label">内容摘要</div>
      <div class="info-summary">${esc(rec.summary || "（这条记录还没有写摘要）")}</div>
    </div>
    <div class="info-block">
      <div class="info-label">🔗 关联记录（跨领域串联）</div>
      <div>${relChips}</div>
      <input class="rel-add-input" id="relInput" placeholder="搜索其他记录并关联…" autocomplete="off" />
      <div class="rel-add-list" id="relList"></div>
    </div>
    <div class="info-actions">
      ${rec.deleted
        ? `<button class="btn-star" id="btnRestore">♻️ 恢复</button><button class="btn-del" id="btnPurge">🗑 彻底删除</button>`
        : `<button class="btn-star" id="btnStar">${rec.starred ? "⭐ 已收藏" : "☆ 收藏"}</button><button class="btn-edit" id="btnEdit">✏️ 编辑</button>${(rec.fileType !== "text" && (rec.blob || (rec.fileType === "image" && rec.images && rec.images.length))) ? `<button class="btn-download" id="btnDownload">⬇ 下载原文件</button>` : ""}<button class="btn-del" id="btnDel">🗑 删除</button>`}
    </div>`;

  if (rec.deleted) {
    $("#btnRestore", pane).onclick = async () => { rec.deleted = false; rec.deletedAt = 0; await put_("records", rec); state.records = state.records.map((x) => (x.id === rec.id ? rec : x)); const ov = pane.closest(".modal-overlay"); ov.remove(); renderSidebar(); renderMain(); toast("已恢复该记录"); };
    $("#btnPurge", pane).onclick = () => { const ov = pane.closest(".modal-overlay"); ov.remove(); purgeRecord(rec.id); };
  } else {
    $("#btnStar", pane).onclick = async () => {
      rec.starred = !rec.starred;
      await put_("records", rec);
      state.records = state.records.map((x) => (x.id === rec.id ? rec : x));
      renderInfo(pane, rec); renderMain(); renderSidebar();
      toast(rec.starred ? "已加入收藏 ⭐" : "已取消收藏");
    };
    $("#btnEdit", pane).onclick = () => { const ov = pane.closest(".modal-overlay"); ov.remove(); openEditor(rec.id); };
    if ($("#btnDownload", pane)) {
      $("#btnDownload", pane).onclick = () => {
        const imgs = (rec.fileType === "image")
          ? (rec.images && rec.images.length ? rec.images : (rec.blob ? [{ blob: rec.blob, name: rec.fileName }] : []))
          : null;
        if (imgs && imgs.length) {
          imgs.forEach((im, i) => {
            const url = URL.createObjectURL(im.blob);
            const a = document.createElement("a"); a.href = url; a.download = im.name || ("图片" + (i + 1)); document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 3000);
          });
          toast("已下载 " + imgs.length + " 张原图");
        } else if (rec.blob) {
          const url = URL.createObjectURL(rec.blob);
          const a = document.createElement("a"); a.href = url; a.download = rec.fileName || "文件"; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 3000);
          toast("已下载原文件「" + (rec.fileName || "文件") + "」");
        }
      };
    }
    $("#btnDel", pane).onclick = () => { const ov = pane.closest(".modal-overlay"); ov.remove(); deleteRecord(rec.id); };
  }

  $$("[data-openrel]", pane).forEach((c) =>
    c.addEventListener("click", () => { const ov = pane.closest(".modal-overlay"); ov.remove(); openRecord(c.dataset.openrel); })
  );

  const relInput = $("#relInput", pane), relList = $("#relList", pane);
  relInput.oninput = () => {
    const q = relInput.value.trim().toLowerCase();
    relList.innerHTML = "";
    if (!q) return;
    const cur = rec.relations || [];
    const matches = state.records
      .filter((r) => r.id !== rec.id && !cur.includes(r.id) && !r.deleted)
      .filter((r) => (r.title + " " + (r.tags || []).join(" ")).toLowerCase().includes(q))
      .slice(0, 8);
    if (matches.length === 0) { relList.innerHTML = `<div style="font-size:12.5px;color:var(--text-faint);padding:6px">无匹配记录</div>`; return; }
    matches.forEach((r) => {
      const it = document.createElement("div");
      it.className = "rel-add-item";
      it.textContent = (TYPE_META[r.fileType]?.icon || "📝") + " " + r.title;
      it.onclick = async () => {
        rec.relations = rec.relations || [];
        rec.relations.push(r.id);
        await put_("records", rec);
        state.records = state.records.map((x) => (x.id === rec.id ? rec : x));
        relInput.value = ""; relList.innerHTML = "";
        renderInfo(pane, rec);
        toast("已关联「" + r.title + "」");
      };
      relList.appendChild(it);
    });
  };
}

/* ============================================================
   全局搜索
   ============================================================ */
function runSearch(q) {
  const box = $("#searchResults");
  q = q.trim().toLowerCase();
  if (!q) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  const matches = state.records
    .filter((r) => !r.deleted && (r.title + " " + (r.tags || []).join(" ")).toLowerCase().includes(q))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 30);
  if (matches.length === 0) {
    box.innerHTML = `<div class="sr-empty">没有找到匹配的标题或标签 🌫️</div>`;
  } else {
    box.innerHTML = matches.map((r) => {
      const sec = sectionById(r.sectionId), mod = moduleById(r.moduleId);
      return `<div class="sr-item" data-rec="${r.id}">
        <span class="sr-icon">${TYPE_META[r.fileType]?.icon || "📝"}</span>
        <div class="sr-main">
          <div class="sr-title">${esc(r.title)}</div>
          <div class="sr-meta">${esc(sec?.name || "")} · ${esc(mod?.name || "")}${(r.tags || []).length ? " · " + r.tags.map((t) => "#" + esc(t)).join(" ") : ""}</div>
        </div>
      </div>`;
    }).join("");
    $$(".sr-item", box).forEach((el) =>
      el.addEventListener("click", () => { openRecord(el.dataset.rec); box.classList.add("hidden"); $("#globalSearch").value = ""; })
    );
  }
  box.classList.remove("hidden");
}

/* ---------- 本地数据说明弹窗 ---------- */
function openSettings() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal form-modal" style="max-width:440px">
      <div class="modal-head">
        <span class="mh-emoji">⚙️</span>
        <span class="mh-title">设置</span>
        <button class="modal-close">×</button>
      </div>
      <div class="form-body" style="line-height:1.9;font-size:14px;color:var(--text)">
        <p>📱 <b>数据保存在本机</b>：所有板块、记录、附件都存放在当前浏览器的本地数据库（IndexedDB），不上传任何云端服务器。</p>
        <p>💾 <b>如何备份</b>：点左下角「⤓ 完整备份」可导出包含所有附件的备份文件；「📄 导出文本」导出纯文字版。建议定期导出留底。</p>
        <p>♻️ <b>如何恢复</b>：点「⤒ 导入」选择备份文件即可还原。</p>
        <p>⚠️ <b>注意</b>：清除浏览器/微信的缓存或存储空间会删除本地数据，请务必先备份。</p>
        <hr style="border:none;border-top:1px solid var(--border-soft);margin:14px 0" />
        <div class="field">
          <label>✨ 豆包 AI 概括（自填 Key，可选）</label>
          <input id="f_doubaoKey" type="password" placeholder="粘贴火山方舟 API Key（留空则用本地概括）" value="${esc(state.doubaoApiKey)}" style="width:100%;padding:10px 12px;border:2px solid var(--border);border-radius:var(--capsule);font-size:13px;outline:none" />
          <div class="hint">填了 Key，「✨ 智能概括」会尝试调用豆包做摘要与标签；浏览器直连常被跨域(CORS)拦截，失败会自动回退本地算法，按钮不坏。留空则纯本地处理、内容不上传。Key 仅存在你本机浏览器。</div>
        </div>
        <div class="field">
          <label>豆包模型（可选）</label>
          <input id="f_doubaoModel" type="text" placeholder="doubao-seed-1-6-250615" value="${esc(state.doubaoModel)}" style="width:100%;padding:10px 12px;border:2px solid var(--border);border-radius:var(--capsule);font-size:13px;outline:none" />
          <div class="hint">火山方舟上的豆包模型 ID，默认即可；若你的账号模型不同可改。</div>
        </div>
      </div>
      <div class="form-footer">
        <button class="btn-cancel">取消</button>
        <button class="btn-save">保存</button>
      </div>
    </div>`;
  $("#modalRoot").appendChild(overlay);
  $(".modal-close", overlay).onclick = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  $(".btn-cancel", overlay).onclick = () => overlay.remove();
  $(".btn-save", overlay).onclick = () => {
    state.doubaoApiKey = $("#f_doubaoKey", overlay).value.trim();
    state.doubaoModel = $("#f_doubaoModel", overlay).value.trim() || "doubao-seed-1-6-250615";
    savePrefs();
    overlay.remove();
    toast("设置已保存");
  };
}

/* ============================================================
   全局事件
   ============================================================ */
function bindGlobalEvents() {
  $("#toggleSidebar").onclick = () => { state.sidebarHidden = true; savePrefs(); applySidebar(); };
  $("#showSidebar").onclick = () => { state.sidebarHidden = false; savePrefs(); applySidebar(); };
  $("#homeBtn").onclick = () => { state.view = "home"; savePrefs(); renderSidebar(); renderMain(); };
  const logoEl = document.querySelector(".logo");
  if (logoEl) logoEl.onclick = () => { state.view = "splash"; savePrefs(); renderMain(); };
  $("#drawerBackdrop").onclick = () => { state.sidebarHidden = true; savePrefs(); applySidebar(); };
  $("#addSectionBtn").onclick = addSection;
  $("#addModuleBtn").onclick = openAddModule;
  $("#addRecordBtn").onclick = () => openEditor(null, null);

  // 记录多选模式：底部批量栏按钮
  $("#bbCancel").onclick = exitRecordSelection;
  $("#bbDelete").onclick = deleteSelectedRecords;
  $("#bbMove").onclick = moveSelectedRecords;

  // 导入 / 导出备份
  $("#exportBtn").onclick = exportData;
  $("#exportTextBtn").onclick = () => exportAsText();
  $("#importBtn").onclick = () => $("#importFile").click();
  $("#offlineBtn").onclick = downloadOffline;
  $("#themeBtn").onclick = openThemePicker;
  $("#settingsBtn").onclick = openSettings;

  $("#importFile").onchange = (e) => {
    const f = e.target.files[0];
    if (f) importData(f);
    e.target.value = "";
  };

  // 侧边栏宽度拖动
  const handle = $("#resizeHandle");
  let dragging = false;
  handle.addEventListener("mousedown", (e) => { dragging = true; handle.classList.add("dragging"); e.preventDefault(); });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const w = Math.min(460, Math.max(180, e.clientX));
    state.sidebarWidth = w;
    $("#sidebar").style.width = w + "px";
  });
  window.addEventListener("mouseup", () => {
    if (dragging) { dragging = false; handle.classList.remove("dragging"); savePrefs(); }
  });

  // 搜索
  const si = $("#globalSearch");
  si.addEventListener("input", () => runSearch(si.value));
  si.addEventListener("focus", () => { if (si.value.trim()) runSearch(si.value); });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-wrap")) $("#searchResults").classList.add("hidden");
  });
  si.addEventListener("keydown", (e) => { if (e.key === "Escape") { si.value = ""; $("#searchResults").classList.add("hidden"); } });

  // 视口在桌面/移动端之间跨越 820px 边界时，同步抽屉默认状态。
  // 仅判断「是否跨边界」，避免移动端滚动导致 innerHeight 变化而误触发收起。
  let _lastMobile = window.innerWidth <= 820;
  window.addEventListener("resize", () => {
    const isMobile = window.innerWidth <= 820;
    if (isMobile !== _lastMobile) {
      if (isMobile) state.sidebarHidden = true; // 进入移动端：收起抽屉
      applySidebar();
      _lastMobile = isMobile;
    }
  });
}

/* 启动 */
init().catch((err) => {
  console.error(err);
  document.getElementById("content").innerHTML =
    `<div class="empty-hint"><span class="eh-emoji">⚠️</span>初始化失败：${esc(err.message)}<br/>请用本地服务器打开（见说明），勿直接用 file:// 打开。</div>`;
});
