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

const SESSION_KEY = "text-miner-open-tabs";
const TEXT_CACHE = "text-miner-texts-v1";
const state = {
  catalog: null,
  works: [],
  openTabs: [],
  activeId: null,
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
      revealPassage(options.targetStart, options.targetEnd);
    } else {
      readerContent.scrollTop = 0;
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
    open.innerHTML = `<span>${escapeHtml(tab.title)}</span>`;
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
  state.openTabs = state.openTabs.filter((tab) => tab.id !== id);
  if (state.activeId === id) {
    state.activeId = state.openTabs[0]?.id || null;
    if (state.activeId) {
      openText(state.activeId);
    } else {
      readerTitle.textContent = "Select a text";
      readerAuthor.textContent = "";
      readerContent.textContent = "";
      showCatalog();
    }
  }
  persistTabs();
  renderTabs();
}

function persistTabs() {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({
    activeId: state.activeId,
    openTabs: state.openTabs,
  }));
}

function restoreTabs() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "{}");
    state.openTabs = Array.isArray(saved.openTabs) ? saved.openTabs : [];
    state.activeId = saved.activeId || state.openTabs[0]?.id || null;
  } catch {
    state.openTabs = [];
  }
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
    return;
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
