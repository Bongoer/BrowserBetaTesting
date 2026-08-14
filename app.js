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
  recreateView: $("#recreate-view"),
  reload: $("#reload"),
  renderBadge: $("#render-badge"),
  startPage: $("#start-page"),
  statusAction: $("#status-action"),
  statusText: $("#status-text"),
  statusToast: $("#status-toast"),
  surfaces: $("#surfaces"),
  tabsList: $("#tabs-list"),
  tryDirect: $("#try-direct"),
};

const physicalMobile = window.matchMedia("(max-width: 760px)");
const displayPreference = localStorage.getItem("pocket-browser-display-v3");
const defaultDesktop = displayPreference ? displayPreference === "desktop" : !physicalMobile.matches;

let proxyController = null;
let proxyConnection = null;
let proxyReady = null;

async function ensureProxy() {
  if (proxyReady) return proxyReady;
  proxyReady = (async () => {
    if (!navigator.serviceWorker) throw new Error("Service workers are unavailable");
    if (typeof window.$scramjetLoadController !== "function" || !window.BareMux?.BareMuxConnection) {
      throw new Error("Proxy runtime did not load");
    }

    const { ScramjetController } = window.$scramjetLoadController();
    proxyController = new ScramjetController({
      prefix: "/proxy/",
      files: {
        wasm: "/proxy-assets/scram/scramjet.wasm.wasm",
        all: "/proxy-assets/scram/scramjet.all.js",
        sync: "/proxy-assets/scram/scramjet.sync.js",
      },
      flags: { rewriterLogs: false, cleanErrors: true },
    });

    await proxyController.init();
    await navigator.serviceWorker.register("/proxy-sw.js", { scope: "/proxy/" });
    await navigator.serviceWorker.ready;

    proxyConnection = new window.BareMux.BareMuxConnection("/proxy-assets/baremux/worker.js");
    const transport = "/proxy-assets/libcurl/index.mjs";
    const wisp = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/wisp/`;
    await proxyConnection.setTransport(transport, [{ wisp }]);
    return proxyController;
  })().catch((error) => {
    proxyReady = null;
    throw error;
  });
  return proxyReady;
}

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
  if (/^https?:\/\//i.test(trimmed)) return unwrapRedirect(trimmed);
  if (/^[\w-]+(\.[\w-]+)+([/:?#].*)?$/i.test(trimmed)) return `https://${trimmed}`;
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

function unwrapRedirect(url) {
  try {
    const target = new URL(url);
    if (isGoogle(url) && target.pathname === "/url") {
      const destination = target.searchParams.get("q") || target.searchParams.get("url");
      if (destination && /^https?:\/\//i.test(destination)) return destination;
    }
  } catch { /* Keep the original value. */ }
  return url;
}

function displayAddress(url) {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function hostname(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return "New tab"; }
}

function rootFavicon(url) {
  try { return new URL("/favicon.ico", url).href; }
  catch { return ""; }
}

function fallbackFavicon(url) {
  return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(url)}`;
}

function finalFavicon(url) {
  try { return `https://icons.duckduckgo.com/ip3/${encodeURIComponent(new URL(url).hostname)}.ico`; }
  catch { return ""; }
}

function isGoogle(url) {
  try { return /(^|\.)google\.[a-z.]+$/i.test(new URL(url).hostname); }
  catch { return false; }
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
    handleFrameLoad(tab);
  });
}

function createTab(initialAddress = "", activate = true) {
  const id = uniqueId();
  const tab = {
    id,
    number: nextTabNumber++,
    history: [""],
    historyIndex: 0,
    title: "New tab",
    favicon: "",
    faviconDisabled: false,
    bookmarked: false,
    desktop: defaultDesktop,
    renderType: "home",
    loadingToken: 0,
    fallbackTimer: 0,
    automaticFallback: false,
    proxyFrame: null,
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
  window.clearTimeout(tabs[index].fallbackTimer);
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
    const favicon = tab.favicon || rootFavicon(address);
    const faviconMarkup = address && favicon && !tab.faviconDisabled ? `<img class="tab-favicon" src="${escapeHtml(favicon)}" data-fallback="${escapeHtml(fallbackFavicon(address))}" data-final-fallback="${escapeHtml(finalFavicon(address))}" alt="">` : icon("sparkles");
    button.innerHTML = `<span class="site-dot ${address ? "" : "home-dot"}">${faviconMarkup}</span><span class="tab-title">${escapeHtml(address ? tab.title || hostname(address) : "New tab")}</span><span class="tab-close" aria-label="Close tab">${icon("x")}</span>`;
    button.addEventListener("click", () => switchTab(tab.id));
    button.querySelector(".tab-close").addEventListener("click", (event) => closeTab(tab.id, event));
    const faviconImage = button.querySelector(".tab-favicon");
    faviconImage?.addEventListener("error", () => {
      const fallback = faviconImage.dataset.fallback;
      if (fallback && faviconImage.src !== fallback) {
        tab.favicon = fallback;
        faviconImage.src = fallback;
        return;
      }
      const finalFallback = faviconImage.dataset.finalFallback;
      if (finalFallback && faviconImage.src !== finalFallback) {
        tab.favicon = finalFallback;
        faviconImage.src = finalFallback;
        return;
      }
      tab.faviconDisabled = true;
      faviconImage.classList.add("is-hidden");
    });
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
  elements.recreateView.disabled = isHome;
  elements.tryDirect.disabled = isHome;
  elements.desktopSwitch.classList.toggle("on", tab.desktop);
  elements.desktopSwitch.setAttribute("aria-checked", String(tab.desktop));
  elements.renderBadge.textContent = isHome ? "Auto" : renderLabel(tab.renderType);
}

function renderLabel(type) {
  return ({ proxy: "Secure proxy", direct: "Real site", home: "Auto" })[type] || "Auto";
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

function prepareFrame(tab, sandboxed) {
  window.clearTimeout(tab.fallbackTimer);
  tab.fallbackTimer = 0;
  tab.automaticFallback = false;
  tab.frame.removeAttribute("src");
  tab.frame.removeAttribute("srcdoc");
  if (sandboxed) tab.frame.setAttribute("sandbox", "allow-scripts allow-forms allow-modals allow-popups allow-downloads allow-pointer-lock allow-presentation");
  else tab.frame.removeAttribute("sandbox");
}

function syncObservableFrame(tab) {
  if (tab.renderType !== "direct") return false;
  try {
    const observed = tab.frame.contentWindow.location.href;
    if (!/^https?:\/\//i.test(observed)) return false;
    const next = unwrapRedirect(observed);
    if (next !== currentAddress(tab)) {
      tab.history = [...tab.history.slice(0, tab.historyIndex + 1), next];
      tab.historyIndex = tab.history.length - 1;
    }
    tab.title = tab.frame.contentDocument?.title || hostname(next);
    renderAll();
    return true;
  } catch {
    return false;
  }
}

function handleFrameLoad(tab) {
  if (tab.id === activeTabId) setLoading(false);
  if (tab.renderType === "proxy") {
    try {
      const title = tab.frame.contentDocument?.title?.trim();
      if (title) tab.title = title.slice(0, 120);
      const iconLink = tab.frame.contentDocument?.querySelector('link[rel~="icon" i][href]');
      if (iconLink?.href) {
        tab.favicon = iconLink.href;
        tab.faviconDisabled = false;
      }
    } catch { /* Proxy navigation events still update the URL. */ }
    renderAll();
    return;
  }
  if (tab.renderType === "direct") {
    const observable = syncObservableFrame(tab);
    if (!tab.automaticFallback && tab.id === activeTabId && !observable) {
      showStatus("Direct iframe mode may be blocked by the website.", "Use proxy", () => loadTab(tab, "proxy"));
    }
  }
}

function syncProxyNavigation(tab, event) {
  const eventUrl = event?.url instanceof URL ? event.url.href : String(event?.url || "");
  if (!/^https?:\/\//i.test(eventUrl)) return;
  const next = unwrapRedirect(eventUrl);
  if (next !== currentAddress(tab)) {
    tab.history = [...tab.history.slice(0, tab.historyIndex + 1), next];
    tab.historyIndex = tab.history.length - 1;
    tab.title = hostname(next);
    tab.favicon = "";
    tab.faviconDisabled = false;
  }
  renderAll();
}

function attachProxyFrame(tab) {
  if (tab.proxyFrame) return tab.proxyFrame;
  tab.proxyFrame = proxyController.createFrame(tab.frame);
  tab.proxyFrame.addEventListener("urlchange", (event) => syncProxyNavigation(tab, event));
  tab.proxyFrame.addEventListener("navigate", (event) => {
    if (event?.url) syncProxyNavigation(tab, event);
    if (tab.id === activeTabId) setLoading(true);
  });
  return tab.proxyFrame;
}

async function loadProxy(tab, url, token) {
  tab.renderType = "proxy";
  tab.title = hostname(url);
  renderAll();
  showStatus("Connecting through the built-in proxy...", "", null, true);
  try {
    await ensureProxy();
    if (tab.loadingToken !== token) return;
    prepareFrame(tab, false);
    tab.renderType = "proxy";
    const frame = attachProxyFrame(tab);
    await frame.go(url);
    renderAll();
    hideStatus();
  } catch (error) {
    if (tab.loadingToken !== token) return;
    prepareFrame(tab, true);
    tab.renderType = "proxy";
    tab.frame.srcdoc = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{height:100%;margin:0}body{display:grid;place-items:center;background:#f7f8fc;color:#252936;font:16px system-ui;text-align:center}.box{max-width:460px;padding:28px}h2{margin:0 0 10px}p{color:#687083;line-height:1.5}</style><div class="box"><h2>Proxy connection failed</h2><p>${escapeHtml(error?.message || "The proxy server could not start")}</p></div>`;
    renderAll();
    showStatus("Proxy connection failed.", "Try again", () => loadTab(tab, "proxy"), true);
  }
}

function loadDirect(tab, url, token = ++tab.loadingToken, afterFailure = false) {
  if (tab.loadingToken !== token) return;
  tab.renderType = "direct";
  tab.title = hostname(currentAddress(tab) || url);
  prepareFrame(tab, false);
  tab.frame.src = url;
  renderAll();
  if (afterFailure) showStatus("Recreation services failed. Trying the website directly.", "Open directly", () => window.open(url, "_blank"));
}

function loadTab(tab, preference = "auto") {
  const url = currentAddress(tab);
  if (!url) return;
  const token = ++tab.loadingToken;
  setLoading(tab.id === activeTabId);
  tab.surface.classList.add("active");

  if (preference === "direct") { loadDirect(tab, url, token); return; }
  loadProxy(tab, url, token);
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
  targetTab.title = hostname(next);
  targetTab.favicon = "";
  targetTab.faviconDisabled = false;
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
  if (currentAddress(tab)) loadTab(tab, tab.renderType === "direct" ? "direct" : "proxy");
}

function goHome() {
  const tab = activeTab();
  if (!tab || !currentAddress(tab)) return;
  tab.history = [...tab.history.slice(0, tab.historyIndex + 1), ""];
  tab.historyIndex = tab.history.length - 1;
  tab.renderType = "home";
  tab.title = "New tab";
  tab.favicon = "";
  tab.faviconDisabled = false;
  tab.loadingToken += 1;
  window.clearTimeout(tab.fallbackTimer);
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
  loadTab(tab, tab.renderType === "direct" ? "direct" : "proxy");
});
elements.home.addEventListener("click", goHome);
$("#brand-home").addEventListener("click", goHome);
elements.newTab.addEventListener("click", () => createTab());
elements.menuButton.addEventListener("click", () => setMenu(!menuOpen));
elements.desktopSwitch.addEventListener("click", toggleDesktop);
elements.recreateView.addEventListener("click", () => { const tab = activeTab(); setMenu(false); if (currentAddress(tab)) loadTab(tab, "proxy"); });
elements.tryDirect.addEventListener("click", () => {
  const tab = activeTab();
  setMenu(false);
  if (!currentAddress(tab)) return;
  const token = ++tab.loadingToken;
  setLoading(true);
  loadDirect(tab, currentAddress(tab), token);
});
elements.bookmark.addEventListener("click", () => { const tab = activeTab(); tab.bookmarked = !tab.bookmarked; renderAll(); });

document.querySelectorAll(".quick-links button").forEach((button) => {
  button.addEventListener("click", () => navigate(button.dataset.url || ""));
});

document.addEventListener("click", (event) => {
  if (menuOpen && !elements.browserMenu.contains(event.target) && !elements.menuButton.contains(event.target)) setMenu(false);
});

window.addEventListener("resize", () => {
  for (const tab of tabs) updateSurfaceScale(tab);
});

physicalMobile.addEventListener?.("change", () => {
  for (const tab of tabs) updateSurfaceScale(tab);
});

createTab();
