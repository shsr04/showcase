const catalogView = document.getElementById("catalogView");
const readerView = document.getElementById("readerView");
const backButton = document.getElementById("backButton");
const catalogButton = document.getElementById("catalogButton");
const offlineButton = document.getElementById("offlineButton");
const statusLine = document.getElementById("statusLine");
const corpusStats = document.getElementById("corpusStats");
const titleSearch = document.getElementById("titleSearch");
const textList = document.getElementById("textList");
const tabStrip = document.getElementById("tabStrip");
const readerTitle = document.getElementById("readerTitle");
const readerAuthor = document.getElementById("readerAuthor");
const readerContent = document.getElementById("readerContent");
const passageSearchButton = document.getElementById("passageSearchButton");
const resultsPanel = document.getElementById("resultsPanel");
const closeResults = document.getElementById("closeResults");
const resultsList = document.getElementById("resultsList");
const queryPreview = document.getElementById("queryPreview");

const STORAGE_KEY = "text-miner-state-v1";
const SESSION_KEY = "text-miner-open-tabs";
const TEXT_CACHE = "text-miner-texts-v1";
const MAX_SAVED_POSITIONS = 50;
let positionSaveTimer = 0;
const state = {
  catalog: null,
  works: [],
  openTabs: [],
  activeId: null,
  positions: {},
  textCache: new Map(),
  selectedText: "",
  worker: null,
  workerReady: false,
  view: "catalog",
};

init();

async function init() {
  bindEvents();
  showCatalog();
  restoreTabs();
  await registerServiceWorker();
  await loadCatalog();
  setupWorker();
  renderCatalog();
  renderTabs();
  if (state.activeId) {
    openText(state.activeId, { keepView: true });
  }
}

function bindEvents() {
  titleSearch.addEventListener("input", renderCatalog);
  backButton.addEventListener("click", showCatalog);
  catalogButton.addEventListener("click", showCatalog);
  closeResults.addEventListener("click", () => resultsPanel.classList.remove("is-open"));
  offlineButton.addEventListener("click", cacheCorpus);
  passageSearchButton.addEventListener("click", searchSelection);
  readerContent.addEventListener("scroll", queueActivePositionSave);
  window.addEventListener("pagehide", saveActivePosition);
  document.addEventListener("selectionchange", updateSelection);
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("sw.js");
  } catch (error) {
    console.warn("Service worker registration failed", error);
  }
}

async function loadCatalog() {
  const response = await fetch("corpus/catalog.json", { cache: "no-cache" });
  if (!response.ok) throw new Error("Corpus catalog missing. Run npm run harvest:texts.");
  state.catalog = await response.json();
  state.works = state.catalog.works || [];
  const size = formatBytes(state.catalog.totalBytes || state.works.reduce((sum, work) => sum + (work.bytes || 0), 0));
  const profile = state.catalog.profile?.bookshelves?.map((shelf) => shelf.name).join(", ");
  statusLine.textContent = `${state.works.length.toLocaleString()} texts ready.`;
  corpusStats.textContent = `${state.works.length.toLocaleString()} works · ${size} static TXT corpus · ${profile || state.catalog.source || "Public domain"}`;
}

function setupWorker() {
  state.worker = new Worker("search-worker.js");
  state.worker.addEventListener("message", (event) => {
    const { type, payload } = event.data || {};
    if (type === "progress") {
      statusLine.textContent = payload.message;
    }
    if (type === "ready") {
      state.workerReady = true;
      statusLine.textContent = `Indexed ${payload.passages.toLocaleString()} passages from ${payload.texts.toLocaleString()} texts.`;
      updateSelection();
    }
    if (type === "results") {
      renderResults(payload);
    }
    if (type === "error") {
      statusLine.textContent = payload.message;
      resultsList.innerHTML = `<p class="empty">${escapeHtml(payload.message)}</p>`;
    }
  });
  state.worker.postMessage({ type: "build", payload: { works: state.works } });
}

function renderCatalog() {
  const query = titleSearch.value.trim().toLowerCase();
  const filtered = state.works
    .filter((work) => {
      if (!query) return true;
      return `${work.title} ${work.author}`.toLowerCase().includes(query);
    })
    .slice(0, 300);

  textList.innerHTML = "";
  if (!filtered.length) {
    textList.innerHTML = `<p class="empty">No titles match this search.</p>`;
    return;
  }

  for (const work of filtered) {
    const button = document.createElement("button");
    button.className = "text-card";
    button.type = "button";
    const shelf = work.primaryShelf ? `${work.primaryShelf} · ` : "";
    button.innerHTML = `<strong>${escapeHtml(work.title)}</strong><span>${escapeHtml(shelf)}${escapeHtml(work.author || "Unknown")} · ${formatBytes(work.bytes || 0)}</span>`;
    button.addEventListener("click", () => openText(work.id));
    textList.append(button);
  }
}

async function openText(id, options = {}) {
  const work = state.works.find((entry) => entry.id === id);
  if (!work) return;
  if (state.activeId) {
    saveActivePosition();
  }
  addTab(work);
  renderTabs();
  state.activeId = id;
  state.view = options.keepView ? state.view : "reader";
  persistTabs();
  showReader();
  readerTitle.textContent = work.title;
  readerAuthor.textContent = work.author || "Unknown";
  readerContent.textContent = "Loading text.";

  try {
    const text = await fetchText(work);
    readerContent.textContent = text;
    if (Number.isFinite(options.targetStart) && Number.isFinite(options.targetEnd)) {
      const offset = revealPassage(options.targetStart, options.targetEnd);
      savePosition(id, offset);
    } else {
      restoreReaderPosition(id);
    }
  } catch (error) {
    readerContent.textContent = "This text could not be loaded.";
  }
  renderTabs();
}

async function fetchText(work) {
  if (state.textCache.has(work.id)) return state.textCache.get(work.id);
  const response = await fetch(work.path);
  if (!response.ok) throw new Error("Text fetch failed");
  const text = await response.text();
  state.textCache.set(work.id, text);
  return text;
}

function addTab(work) {
  state.openTabs = state.openTabs.filter((tab) => tab.id !== work.id);
  state.openTabs.unshift({ id: work.id, title: work.title });
  state.openTabs = state.openTabs.slice(0, 12);
}

function renderTabs() {
  tabStrip.innerHTML = "";
  tabStrip.classList.toggle("has-tabs", state.openTabs.length > 0);
  for (const tab of state.openTabs) {
    const item = document.createElement("div");
    item.className = `tab${tab.id === state.activeId ? " is-active" : ""}`;
    const open = document.createElement("button");
    open.type = "button";
    open.innerHTML = `<div>${escapeHtml(tab.title)}</div>`;
    open.addEventListener("click", () => openText(tab.id));
    const close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", `Close ${tab.title}`);
    close.textContent = "×";
    close.addEventListener("click", (event) => {
      event.stopPropagation();
      closeTab(tab.id);
    });
    item.append(open, close);
    tabStrip.append(item);
  }
}

function closeTab(id) {
  if (state.activeId === id) {
    saveActivePosition();
  }
  state.openTabs = state.openTabs.filter((tab) => tab.id !== id);
  if (state.activeId === id) {
    state.activeId = state.openTabs[0]?.id || null;
    if (state.activeId) {
      openText(state.activeId);
    } else {
      readerTitle.textContent = "Select a text";
      readerAuthor.textContent = "";
      readerContent.textContent = "";
      readerContent.scrollTop = 0;
      showCatalog();
    }
  }
  persistState();
  renderTabs();
}

function persistState() {
  trimSavedPositions();
  const payload = {
    version: 1,
    activeId: state.activeId,
    openTabs: state.openTabs,
    positions: state.positions,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("Text Miner state could not be saved", error);
  }
}

function persistTabs() {
  persistState();
}

function restoreTabs() {
  try {
    const saved = restoreLocalState() || restoreSessionState();
    state.openTabs = sanitizeTabs(saved.openTabs);
    state.activeId = saved.activeId || state.openTabs[0]?.id || null;
    state.positions = sanitizePositions(saved.positions);
  } catch {
    state.openTabs = [];
    state.positions = {};
  }
}

function restoreLocalState() {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  if (!saved || typeof saved !== "object") return null;
  return saved;
}

function restoreSessionState() {
  const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
  if (!saved || typeof saved !== "object") return {};
  return saved;
}

function sanitizeTabs(tabs) {
  if (!Array.isArray(tabs)) return [];
  return tabs
    .filter((tab) => tab && typeof tab.id === "string" && typeof tab.title === "string")
    .slice(0, 12)
    .map((tab) => ({ id: tab.id, title: tab.title }));
}

function sanitizePositions(positions) {
  if (!positions || typeof positions !== "object") return {};
  return Object.fromEntries(Object.entries(positions)
    .filter(([, position]) => (
      position
      && Number.isFinite(position.offset)
      && Number.isFinite(position.updatedAt)
    ))
    .map(([id, position]) => [id, {
      offset: Math.max(0, Math.floor(position.offset)),
      updatedAt: position.updatedAt,
    }]));
}

function showCatalog() {
  state.view = "catalog";
  catalogView.classList.add("is-active");
  readerView.classList.remove("is-active");
  backButton.style.visibility = "hidden";
}

function showReader() {
  state.view = "reader";
  catalogView.classList.remove("is-active");
  readerView.classList.add("is-active");
  backButton.style.visibility = "visible";
}

function updateSelection() {
  const selection = document.getSelection();
  const text = selection ? selection.toString().replace(/\s+/g, " ").trim() : "";
  const inReader = selection && readerContent.contains(selection.anchorNode);
  state.selectedText = inReader ? text : "";
  passageSearchButton.disabled = !state.workerReady || state.selectedText.length < 12 || !state.activeId;
}

function searchSelection() {
  updateSelection();
  if (!state.selectedText || !state.workerReady) return;
  resultsPanel.classList.add("is-open");
  queryPreview.textContent = state.selectedText.slice(0, 260);
  resultsList.innerHTML = `<p class="empty">Searching matching passages.</p>`;
  state.worker.postMessage({
    type: "search",
    payload: {
      query: state.selectedText,
      sourceTextId: state.activeId,
      limit: 12,
    },
  });
}

function renderResults(payload) {
  resultsList.innerHTML = "";
  if (!payload.results.length) {
    resultsList.innerHTML = `<p class="empty">No matching passages found in other texts.</p>`;
    return;
  }
  for (const result of payload.results) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "result-card";
    button.innerHTML = `<strong>${escapeHtml(result.title)}</strong><span>Score ${result.score.toFixed(2)} · ${escapeHtml(result.author || "Unknown")}</span><p>${highlightTerms(result.passage || "", payload.terms)}</p>`;
    button.addEventListener("click", () => {
      resultsPanel.classList.remove("is-open");
      openText(result.textId, { targetStart: result.start, targetEnd: result.end });
    });
    resultsList.append(button);
  }
}

function revealPassage(start, end) {
  const node = readerContent.firstChild;
  if (!node || node.nodeType !== Node.TEXT_NODE) {
    readerContent.scrollTop = 0;
    return 0;
  }

  const safeStart = Math.max(0, Math.min(start, node.textContent.length));
  const safeEnd = Math.max(safeStart, Math.min(end, node.textContent.length));
  const range = document.createRange();
  range.setStart(node, safeStart);
  range.setEnd(node, safeEnd);

  const selection = document.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  const rect = range.getBoundingClientRect();
  const contentRect = readerContent.getBoundingClientRect();
  readerContent.scrollTop += rect.top - contentRect.top - 80;
  updateSelection();
  return safeStart;
}

function queueActivePositionSave() {
  window.clearTimeout(positionSaveTimer);
  positionSaveTimer = window.setTimeout(saveActivePosition, 250);
}

function saveActivePosition() {
  if (!state.activeId) return;
  const offset = getVisibleTextOffset();
  if (!Number.isFinite(offset)) return;
  savePosition(state.activeId, offset);
}

function savePosition(id, offset) {
  if (!id || !Number.isFinite(offset)) return;
  const node = readerContent.firstChild;
  const length = node?.nodeType === Node.TEXT_NODE ? node.textContent.length : 0;
  state.positions[id] = {
    offset: Math.max(0, Math.min(Math.floor(offset), length)),
    updatedAt: Date.now(),
  };
  persistState();
}

function restoreReaderPosition(id) {
  const node = readerContent.firstChild;
  const saved = state.positions[id];
  if (!node || node.nodeType !== Node.TEXT_NODE || !saved) {
    readerContent.scrollTop = 0;
    return;
  }

  const offset = Math.max(0, Math.min(Math.floor(saved.offset), node.textContent.length));
  if (offset === 0) {
    readerContent.scrollTop = 0;
    return;
  }

  const range = document.createRange();
  range.setStart(node, offset);
  range.setEnd(node, Math.min(offset + 1, node.textContent.length));
  readerContent.scrollTop = 0;
  const rect = range.getBoundingClientRect();
  const contentRect = readerContent.getBoundingClientRect();
  readerContent.scrollTop = Math.max(0, rect.top - contentRect.top - 24);
}

function getVisibleTextOffset() {
  const node = readerContent.firstChild;
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  const rect = readerContent.getBoundingClientRect();
  const x = rect.left + 16;
  const y = rect.top + 16;
  const caret = caretFromPoint(x, y);
  if (!caret) return fallbackVisibleTextOffset(node);
  return offsetFromCaret(node, caret.node, caret.offset);
}

function caretFromPoint(x, y) {
  if (document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(x, y);
    if (position) return { node: position.offsetNode, offset: position.offset };
  }
  if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(x, y);
    if (range) return { node: range.startContainer, offset: range.startOffset };
  }
  return null;
}

function offsetFromCaret(textNode, caretNode, caretOffset) {
  if (caretNode === textNode) {
    return Math.max(0, Math.min(caretOffset, textNode.textContent.length));
  }
  if (readerContent.contains(caretNode)) {
    return Math.max(0, Math.min(caretOffset, textNode.textContent.length));
  }
  return fallbackVisibleTextOffset(textNode);
}

function fallbackVisibleTextOffset(textNode) {
  const ratio = readerContent.scrollTop / Math.max(1, readerContent.scrollHeight - readerContent.clientHeight);
  return Math.round(textNode.textContent.length * Math.max(0, Math.min(ratio, 1)));
}

function trimSavedPositions() {
  const openIds = new Set(state.openTabs.map((tab) => tab.id));
  const entries = Object.entries(state.positions)
    .filter(([, position]) => position && Number.isFinite(position.updatedAt))
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt);
  const kept = [];

  for (const entry of entries) {
    if (openIds.has(entry[0]) || kept.length < MAX_SAVED_POSITIONS) {
      kept.push(entry);
    }
  }

  state.positions = Object.fromEntries(kept);
}

async function cacheCorpus() {
  if (!("caches" in window)) {
    statusLine.textContent = "Offline cache is not available in this browser.";
    return;
  }
  const cache = await caches.open(TEXT_CACHE);
  offlineButton.disabled = true;
  for (let i = 0; i < state.works.length; i += 1) {
    const work = state.works[i];
    statusLine.textContent = `Caching ${i + 1} of ${state.works.length}: ${work.title}`;
    try {
      await cache.add(work.path);
    } catch (error) {
      statusLine.textContent = `Stopped caching at ${i + 1}. Storage may be full.`;
      offlineButton.disabled = false;
      return;
    }
  }
  statusLine.textContent = "Corpus cached for offline reading.";
  offlineButton.disabled = false;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function highlightTerms(text, terms) {
  const escaped = escapeHtml(text);
  const usefulTerms = (terms || []).filter((term) => term.length > 3).slice(0, 8);
  if (!usefulTerms.length) return escaped;
  const pattern = new RegExp(`\\b(${usefulTerms.map(escapeRegExp).join("|")})\\b`, "gi");
  return escaped.replace(pattern, "<mark>$1</mark>");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
}
