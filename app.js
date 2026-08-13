const $ = (selector) => document.querySelector(selector);

const elements = {
  address: $("#address"),
  addressForm: $("#address-form"),
  addressIcon: $("#address-icon"),
  back: $("#back"),
  bookmark: $("#bookmark"),
  browserMenu: $("#browser-menu"),
  desktopSwitch: $("#desktop-switch"),
  forward: $("#forward"),
  heroAddress: $("#hero-address"),
  heroForm: $("#hero-form"),
  home: $("#home"),
  loadProgress: $("#load-progress"),
  menuButton: $("#menu-button"),
  newTab: $("#new-tab"),
  openDirect: $("#open-direct"),
  readerView: $("#reader-view"),
  recreateView: $("#recreate-view"),
  reload: $("#reload"),
  renderBadge: $("#render-badge"),
  startPage: $("#start-page"),
  statusAction: $("#status-action"),
  statusText: $("#status-text"),
  statusToast: $("#status-toast"),
  surfaces: $("#surfaces"),
  tabsList: $("#tabs-list"),
};

const physicalMobile = window.matchMedia("(max-width: 760px)");
const displayPreference = localStorage.getItem("pocket-browser-display-v3");
const defaultDesktop = displayPreference ? displayPreference === "desktop" : !physicalMobile.matches;

let tabs = [];
let activeTabId = "";
let menuOpen = false;
let nextTabNumber = 1;
let toastTimer = 0;

function icon(name) {
  return `<svg aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

function uniqueId() {
  return globalThis.crypto?.randomUUID?.() || `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function activeTab() {
  return tabs.find((tab) => tab.id === activeTabId) || tabs[0];
}

function currentAddress(tab = activeTab()) {
  return tab?.history[tab.historyIndex] || "";
}

function normalizeAddress(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w-]+(\.[\w-]+)+([/:?#].*)?$/i.test(trimmed)) return `https://${trimmed}`;
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

function displayAddress(url) {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function hostname(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return "New tab"; }
}

function isGoogle(url) {
  try { return /(^|\.)google\.[a-z.]+$/i.test(new URL(url).hostname); }
  catch { return false; }
}

function googleEmbedUrl(url) {
  const target = new URL(url);
  if (target.pathname === "/search") {
    target.searchParams.set("igu", "1");
    return target.href;
  }
  return `${target.origin}/webhp?igu=1`;
}

function youtubeEmbedUrl(url) {
  try {
    const target = new URL(url);
    const id = target.hostname === "youtu.be" ? target.pathname.slice(1) : target.searchParams.get("v");
    return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : "";
  } catch { return ""; }
}

function createSurface(tab) {
  const surface = document.createElement("section");
  surface.className = "surface";
  surface.dataset.tabId = tab.id;
  surface.innerHTML = `<div class="frame-wrap"><iframe class="browser-frame" title="Tab ${nextTabNumber}" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-read; clipboard-write; encrypted-media; fullscreen; geolocation; gyroscope; picture-in-picture"></iframe></div>`;
  elements.surfaces.append(surface);
  tab.surface = surface;
  tab.frameWrap = surface.querySelector(".frame-wrap");
  tab.frame = surface.querySelector("iframe");
  tab.frame.addEventListener("load", () => {
    if (tab.id === activeTabId) setLoading(false);
  });
}

function createTab(initialAddress = "", activate = true) {
  const id = uniqueId();
  const tab = {
    id,
    number: nextTabNumber++,
    history: [""],
    historyIndex: 0,
    bookmarked: false,
    desktop: defaultDesktop,
    renderType: "home",
    loadingToken: 0,
    frame: null,
    frameWrap: null,
    surface: null,
  };
  tabs.push(tab);
  createSurface(tab);
  if (activate) activeTabId = id;
  if (initialAddress) navigate(initialAddress, true, "auto", tab);
  else renderAll();
  requestAnimationFrame(() => elements.tabsList.lastElementChild?.scrollIntoView({ behavior: "smooth", inline: "end", block: "nearest" }));
  return tab;
}

function closeTab(id, event) {
  event?.stopPropagation();
  const index = tabs.findIndex((tab) => tab.id === id);
  if (index < 0) return;
  const wasActive = id === activeTabId;
  tabs[index].surface.remove();
  tabs.splice(index, 1);
  if (!tabs.length) {
    createTab();
    return;
  }
  if (wasActive) activeTabId = tabs[Math.min(index, tabs.length - 1)].id;
  renderAll();
}

function switchTab(id) {
  if (!tabs.some((tab) => tab.id === id)) return;
  activeTabId = id;
  setMenu(false);
  setLoading(false);
  renderAll();
}

function renderTabs() {
  elements.tabsList.replaceChildren();
  for (const tab of tabs) {
    const address = currentAddress(tab);
    const button = document.createElement("button");
    button.className = `tab ${tab.id === activeTabId ? "active" : ""}`;
    button.type = "button";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(tab.id === activeTabId));
    button.innerHTML = `<span class="site-dot ${address ? "" : "home-dot"}">${address ? "" : icon("sparkles")}</span><span class="tab-title">${address ? escapeHtml(hostname(address)) : "New tab"}</span><span class="tab-close" aria-label="Close tab">${icon("x")}</span>`;
    button.addEventListener("click", () => switchTab(tab.id));
    button.querySelector(".tab-close").addEventListener("click", (event) => closeTab(tab.id, event));
    elements.tabsList.append(button);
  }
}

function updateSurfaceScale(tab) {
  tab.surface.classList.toggle("mobile-site", !tab.desktop);
  tab.surface.classList.toggle("desktop-site", tab.desktop);
  tab.surface.classList.toggle("desktop-simulated", tab.desktop && physicalMobile.matches);
  tab.frameWrap.style.removeProperty("width");
  tab.frameWrap.style.removeProperty("height");
  tab.frameWrap.style.removeProperty("transform");

  if (tab.desktop && physicalMobile.matches && tab.surface.classList.contains("active")) {
    const width = Math.max(tab.surface.clientWidth, 1);
    const height = Math.max(tab.surface.clientHeight, 1);
    const desktopWidth = 1180;
    const scale = width / desktopWidth;
    tab.frameWrap.style.width = `${desktopWidth}px`;
    tab.frameWrap.style.height = `${height / scale}px`;
    tab.frameWrap.style.transform = `scale(${scale})`;
  }
}

function renderAll() {
  const tab = activeTab();
  if (!tab) return;
  const address = currentAddress(tab);
  const isHome = !address;

  renderTabs();
  for (const item of tabs) {
    item.surface.classList.toggle("active", item.id === activeTabId && Boolean(currentAddress(item)));
    updateSurfaceScale(item);
  }

  elements.startPage.classList.toggle("is-hidden", !isHome);
  elements.address.value = isHome ? "" : displayAddress(address);
  elements.addressIcon.setAttribute("href", isHome ? "#i-search" : "#i-lock");
  elements.bookmark.classList.toggle("is-hidden", isHome);
  elements.bookmark.classList.toggle("is-bookmarked", tab.bookmarked);
  elements.openDirect.classList.toggle("is-hidden", isHome);
  elements.openDirect.href = isHome ? "#" : address;
  elements.back.disabled = tab.historyIndex <= 0;
  elements.forward.disabled = tab.historyIndex >= tab.history.length - 1;
  elements.reload.disabled = isHome;
  elements.readerView.disabled = isHome;
  elements.recreateView.disabled = isHome;
  elements.desktopSwitch.classList.toggle("on", tab.desktop);
  elements.desktopSwitch.setAttribute("aria-checked", String(tab.desktop));
  elements.renderBadge.textContent = isHome ? "Auto" : renderLabel(tab.renderType);
}

function renderLabel(type) {
  return ({ google: "Google", direct: "Direct", recreated: "Recreated", reader: "Reader", home: "Auto" })[type] || "Auto";
}

function setMenu(open) {
  menuOpen = open;
  elements.browserMenu.classList.toggle("open", open);
  elements.browserMenu.setAttribute("aria-hidden", String(!open));
  elements.menuButton.setAttribute("aria-expanded", String(open));
}

function setLoading(loading) {
  elements.loadProgress.classList.toggle("is-hidden", !loading);
}

function showStatus(text, action = "", callback = null, persistent = false) {
  window.clearTimeout(toastTimer);
  elements.statusText.textContent = text;
  elements.statusAction.textContent = action;
  elements.statusAction.classList.toggle("is-hidden", !action);
  elements.statusAction.onclick = callback;
  elements.statusToast.classList.add("show");
  if (!persistent) toastTimer = window.setTimeout(() => elements.statusToast.classList.remove("show"), 4200);
}

function hideStatus() {
  window.clearTimeout(toastTimer);
  elements.statusToast.classList.remove("show");
}

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function bridgeScript(tab, baseUrl) {
  return `<base href="${escapeHtml(baseUrl)}"><script>(function(){
    var tabId=${JSON.stringify(tab.id)};
    function send(url){try{var next=new URL(url,document.baseURI);if(next.protocol==='http:'||next.protocol==='https:')parent.postMessage({type:'pocket-browser:navigate',tabId:tabId,url:next.href},'*')}catch(e){}}
    document.addEventListener('click',function(event){var link=event.target instanceof Element?event.target.closest('a[href]'):null;if(!link||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||link.hasAttribute('download'))return;var href=link.getAttribute('href');if(!href||href[0]==='#'||href.indexOf('javascript:')===0||href.indexOf('mailto:')===0||href.indexOf('tel:')===0)return;event.preventDefault();send(link.href)},true);
    document.addEventListener('submit',function(event){var form=event.target;if(!(form instanceof HTMLFormElement)||form.method.toLowerCase()!=='get')return;event.preventDefault();try{var next=new URL(form.action||document.baseURI,document.baseURI);new FormData(form).forEach(function(value,key){if(typeof value==='string')next.searchParams.append(key,value)});send(next.href)}catch(e){}},true);
  })();<\/script>`;
}

function injectRecreatedPage(html, tab, baseUrl) {
  const bridge = bridgeScript(tab, baseUrl);
  let output = html
    .replace(/<base\b[^>]*>/gi, "")
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi, "")
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, "");
  if (/<head\b[^>]*>/i.test(output)) return output.replace(/<head\b[^>]*>/i, (match) => `${match}${bridge}`);
  return `<!doctype html><html><head>${bridge}<meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${output}</body></html>`;
}

function inlineMarkdown(text) {
  let output = escapeHtml(text);
  output = output.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">');
  output = output.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
  output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return output;
}

function markdownDocument(markdown, tab, baseUrl) {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const blocks = [];
  let inCode = false;
  let code = [];
  let listOpen = false;

  function closeList() {
    if (listOpen) { blocks.push("</ul>"); listOpen = false; }
  }

  for (const line of lines) {
    if (line.startsWith("```")) {
      closeList();
      if (inCode) { blocks.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`); code = []; }
      inCode = !inCode;
      continue;
    }
    if (inCode) { code.push(line); continue; }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) { closeList(); const level = heading[1].length; blocks.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`); continue; }
    const item = line.match(/^[-*]\s+(.+)$/);
    if (item) { if (!listOpen) { blocks.push("<ul>"); listOpen = true; } blocks.push(`<li>${inlineMarkdown(item[1])}</li>`); continue; }
    closeList();
    if (!line.trim()) { blocks.push("<div class=space></div>"); continue; }
    blocks.push(`<p>${inlineMarkdown(line)}</p>`);
  }
  closeList();

  return `<!doctype html><html><head>${bridgeScript(tab, baseUrl)}<meta name="viewport" content="width=device-width,initial-scale=1"><style>
  :root{color-scheme:light dark}*{box-sizing:border-box}body{max-width:860px;margin:0 auto;padding:32px 22px 70px;background:#fbfcfb;color:#21332b;font:16px/1.68 system-ui,sans-serif}h1,h2,h3,h4{line-height:1.18;letter-spacing:-.02em;margin:1.4em 0 .55em}h1{font-size:2.2rem}h2{font-size:1.55rem}p{margin:.65em 0}a{color:#276e55;text-decoration-thickness:1px;text-underline-offset:3px}img{display:block;max-width:100%;height:auto;margin:20px auto;border-radius:12px}pre{overflow:auto;padding:16px;border-radius:12px;background:#18231e;color:#e8f2ed}code{font-family:ui-monospace,monospace}.space{height:.35rem}ul{padding-left:1.4em}@media(prefers-color-scheme:dark){body{background:#101613;color:#e8efeb}a{color:#86d3b2}}
  </style></head><body>${blocks.join("")}</body></html>`;
}

function prepareFrame(tab, sandboxed) {
  tab.frame.removeAttribute("src");
  tab.frame.removeAttribute("srcdoc");
  if (sandboxed) tab.frame.setAttribute("sandbox", "allow-scripts allow-forms allow-modals allow-popups allow-downloads");
  else tab.frame.removeAttribute("sandbox");
}

async function loadRecreated(tab, url, token) {
  tab.renderType = "recreated";
  renderAll();
  showStatus("Recreating the page from its website data...", "", null, true);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`Proxy returned ${response.status}`);
    const data = await response.json();
    if (!data.contents || typeof data.contents !== "string") throw new Error("No page data returned");
    if (tab.loadingToken !== token) return;
    prepareFrame(tab, true);
    tab.frame.srcdoc = injectRecreatedPage(data.contents, tab, url);
    hideStatus();
    showStatus("Page recreated. Some site scripts may still refuse to run.", "Use reader", () => loadTab(tab, "reader"));
  } catch {
    if (tab.loadingToken !== token) return;
    await loadReader(tab, url, token, true);
  } finally {
    window.clearTimeout(timeout);
  }
}

async function loadReader(tab, url, token = ++tab.loadingToken, automatic = false) {
  tab.renderType = "reader";
  renderAll();
  setLoading(true);
  showStatus(automatic ? "Full recreation failed. Building a readable version..." : "Building a readable version...", "", null, true);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 22000);
  try {
    const response = await fetch(`https://r.jina.ai/${url}`, { signal: controller.signal, headers: { Accept: "text/plain" } });
    if (!response.ok) throw new Error(`Reader returned ${response.status}`);
    const markdown = await response.text();
    if (!markdown.trim()) throw new Error("Reader returned an empty page");
    if (tab.loadingToken !== token) return;
    prepareFrame(tab, true);
    tab.frame.srcdoc = markdownDocument(markdown, tab, url);
    hideStatus();
    showStatus("Readable page created from the website content.");
  } catch {
    if (tab.loadingToken !== token) return;
    loadDirect(tab, url, token, true);
  } finally {
    window.clearTimeout(timeout);
  }
}

function loadDirect(tab, url, token = ++tab.loadingToken, afterFailure = false) {
  if (tab.loadingToken !== token) return;
  tab.renderType = "direct";
  prepareFrame(tab, false);
  tab.frame.src = url;
  renderAll();
  if (afterFailure) showStatus("Recreation services failed. Trying the website directly.", "Open directly", () => window.open(url, "_blank"));
}

function loadGoogle(tab, url, token) {
  if (tab.loadingToken !== token) return;
  tab.renderType = "google";
  prepareFrame(tab, false);
  tab.frame.src = googleEmbedUrl(url);
  renderAll();
  hideStatus();
}

function loadTab(tab, preference = "auto") {
  const url = currentAddress(tab);
  if (!url) return;
  const token = ++tab.loadingToken;
  setLoading(tab.id === activeTabId);
  tab.surface.classList.add("active");

  if (preference === "reader") { loadReader(tab, url, token); return; }
  if (preference === "recreate") { loadRecreated(tab, url, token); return; }
  if (isGoogle(url)) { loadGoogle(tab, url, token); return; }

  const youtube = youtubeEmbedUrl(url);
  if (youtube) { loadDirect(tab, youtube, token); return; }

  try {
    if (new URL(url).hostname === "play.fancade.com") { loadDirect(tab, url, token); return; }
  } catch { /* normalizeAddress already validates normal URLs */ }

  loadRecreated(tab, url, token);
}

function navigate(rawAddress, addToHistory = true, preference = "auto", targetTab = activeTab()) {
  const next = normalizeAddress(rawAddress);
  if (!next || !targetTab) return;
  if (addToHistory) {
    targetTab.history = [...targetTab.history.slice(0, targetTab.historyIndex + 1), next];
    targetTab.historyIndex = targetTab.history.length - 1;
  } else {
    targetTab.history[targetTab.historyIndex] = next;
  }
  targetTab.bookmarked = false;
  setMenu(false);
  hideStatus();
  renderAll();
  loadTab(targetTab, preference);
}

function showHistory(index) {
  const tab = activeTab();
  if (!tab || index < 0 || index >= tab.history.length) return;
  tab.historyIndex = index;
  tab.bookmarked = false;
  hideStatus();
  renderAll();
  if (currentAddress(tab)) loadTab(tab, "auto");
}

function goHome() {
  const tab = activeTab();
  if (!tab || !currentAddress(tab)) return;
  tab.history = [...tab.history.slice(0, tab.historyIndex + 1), ""];
  tab.historyIndex = tab.history.length - 1;
  tab.renderType = "home";
  tab.loadingToken += 1;
  tab.frame.removeAttribute("src");
  tab.frame.removeAttribute("srcdoc");
  setLoading(false);
  setMenu(false);
  hideStatus();
  renderAll();
}

function toggleDesktop() {
  const tab = activeTab();
  if (!tab) return;
  tab.desktop = !tab.desktop;
  localStorage.setItem("pocket-browser-display-v3", tab.desktop ? "desktop" : "mobile");
  renderAll();
  requestAnimationFrame(() => updateSurfaceScale(tab));
}

elements.addressForm.addEventListener("submit", (event) => {
  event.preventDefault();
  navigate(elements.address.value);
});
elements.heroForm.addEventListener("submit", (event) => {
  event.preventDefault();
  navigate(elements.heroAddress.value);
  elements.heroAddress.value = "";
});
elements.address.addEventListener("focus", () => elements.address.select());
elements.back.addEventListener("click", () => showHistory(activeTab().historyIndex - 1));
elements.forward.addEventListener("click", () => showHistory(activeTab().historyIndex + 1));
elements.reload.addEventListener("click", () => {
  const tab = activeTab();
  if (!currentAddress(tab)) return;
  loadTab(tab, tab.renderType === "reader" ? "reader" : tab.renderType === "recreated" ? "recreate" : "auto");
});
elements.home.addEventListener("click", goHome);
$("#brand-home").addEventListener("click", goHome);
elements.newTab.addEventListener("click", () => createTab());
elements.menuButton.addEventListener("click", () => setMenu(!menuOpen));
elements.desktopSwitch.addEventListener("click", toggleDesktop);
elements.readerView.addEventListener("click", () => { const tab = activeTab(); setMenu(false); if (currentAddress(tab)) loadTab(tab, "reader"); });
elements.recreateView.addEventListener("click", () => { const tab = activeTab(); setMenu(false); if (currentAddress(tab)) loadTab(tab, "recreate"); });
elements.bookmark.addEventListener("click", () => { const tab = activeTab(); tab.bookmarked = !tab.bookmarked; renderAll(); });

document.querySelectorAll(".quick-links button").forEach((button) => {
  button.addEventListener("click", () => navigate(button.dataset.url || ""));
});

document.addEventListener("click", (event) => {
  if (menuOpen && !elements.browserMenu.contains(event.target) && !elements.menuButton.contains(event.target)) setMenu(false);
});

window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "pocket-browser:navigate" || typeof data.url !== "string" || typeof data.tabId !== "string") return;
  const tab = tabs.find((item) => item.id === data.tabId);
  if (!tab || event.source !== tab.frame.contentWindow) return;
  activeTabId = tab.id;
  navigate(data.url, true, "auto", tab);
});

window.addEventListener("resize", () => {
  for (const tab of tabs) updateSurfaceScale(tab);
});

physicalMobile.addEventListener?.("change", () => {
  for (const tab of tabs) updateSurfaceScale(tab);
});

createTab();
