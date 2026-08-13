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

// These sites are known to reject normal cross-site framing. We still try the
// original page briefly, then switch to compatibility mode automatically.
const automaticCompatibilityHosts = [
  /(^|\.)roblox\.com$/i,
  /(^|\.)youtube\.com$/i,
  /(^|\.)github\.com$/i,
  /(^|\.)instagram\.com$/i,
  /(^|\.)facebook\.com$/i,
  /(^|\.)reddit\.com$/i,
  /(^|\.)tiktok\.com$/i,
  /(^|\.)discord\.com$/i,
  /(^|\.)netflix\.com$/i,
  /(^|\.)amazon\.[a-z.]+$/i,
  /(^|\.)x\.com$/i,
  /(^|\.)twitter\.com$/i,
];

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

function googleEmbedUrl(url) {
  const target = new URL(url);
  if (target.pathname === "/url") {
    const destination = target.searchParams.get("q") || target.searchParams.get("url");
    if (destination && /^https?:\/\//i.test(destination)) return destination;
  }
  if (target.pathname === "/search") {
    target.searchParams.set("igu", "1");
    return target.href;
  }
  if (target.pathname === "/" || target.pathname === "/webhp") return `${target.origin}/webhp?igu=1`;
  target.searchParams.set("igu", "1");
  return target.href;
}

function usesAutomaticCompatibility(url) {
  try {
    const host = new URL(url).hostname;
    return automaticCompatibilityHosts.some((pattern) => pattern.test(host));
  } catch { return false; }
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
  return ({ google: "Google embed", direct: "Real site", recreated: "Compatibility", home: "Auto" })[type] || "Auto";
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
    var proxy='https://api.allorigins.win/raw?url=';
    var nativeFetch=window.fetch;
    function post(data){data.tabId=tabId;parent.postMessage(data,'*')}
    function send(url){try{var next=new URL(url,document.baseURI);if(next.protocol==='http:'||next.protocol==='https:')post({type:'pocket-browser:navigate',url:next.href})}catch(e){}}
    function requestUrl(input){try{return typeof input==='string'?new URL(input,document.baseURI).href:input instanceof Request?input.url:String(input)}catch(e){return ''}}
    if(nativeFetch){window.fetch=function(input,init){var method=(init&&init.method)||(input instanceof Request&&input.method)||'GET';var original=requestUrl(input);return nativeFetch.apply(window,arguments).catch(function(error){if(String(method).toUpperCase()!=='GET'||!/^https?:/i.test(original))throw error;var retryInit=Object.assign({},init||{},{credentials:'omit'});return nativeFetch(proxy+encodeURIComponent(original),retryInit)})}}
    function findLink(event){var path=event.composedPath?event.composedPath():[];for(var i=0;i<path.length;i++){if(path[i]&&path[i].matches&&path[i].matches('a[href],area[href]'))return path[i]}return event.target instanceof Element?event.target.closest('a[href],area[href]'):null}
    document.addEventListener('click',function(event){var link=findLink(event);if(!link||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||link.hasAttribute('download'))return;var href=link.getAttribute('href');if(!href||href[0]==='#'||/^(javascript:|mailto:|tel:)/i.test(href))return;event.preventDefault();event.stopImmediatePropagation();send(link.href)},true);
    document.addEventListener('auxclick',function(event){var link=findLink(event);if(!link||event.button!==1)return;event.preventDefault();send(link.href)},true);
    document.addEventListener('submit',function(event){var form=event.target;if(!(form instanceof HTMLFormElement)||form.method.toLowerCase()!=='get')return;event.preventDefault();try{var next=new URL(form.action||document.baseURI,document.baseURI);new FormData(form).forEach(function(value,key){if(typeof value==='string')next.searchParams.append(key,value)});send(next.href)}catch(e){}},true);
    try{var oldOpen=window.open;window.open=function(url){if(url){send(url);return null}return oldOpen.apply(window,arguments)}}catch(e){}
    var lastTitle='';function sendTitle(){var title=document.title||'';if(title===lastTitle)return;lastTitle=title;post({type:'pocket-browser:title',title:title})}
    document.addEventListener('DOMContentLoaded',sendTitle);
    new MutationObserver(sendTitle).observe(document.head||document.documentElement,{subtree:true,childList:true,characterData:true});
    window.addEventListener('hashchange',function(){send(new URL(location.hash,document.baseURI).href)});
  })();<\/script>`;
}

function absoluteAssetUrl(value, baseUrl) {
  if (!value || /^(data:|blob:|javascript:|mailto:|tel:|#)/i.test(value.trim())) return value;
  try { return new URL(value, baseUrl).href; }
  catch { return value; }
}

function absolutizeSrcset(value, baseUrl) {
  return value.split(",").map((candidate) => {
    const parts = candidate.trim().split(/\s+/);
    if (!parts[0]) return candidate;
    parts[0] = absoluteAssetUrl(parts[0], baseUrl);
    return parts.join(" ");
  }).join(", ");
}

function injectRecreatedPage(html, tab, baseUrl) {
  const bridge = bridgeScript(tab, baseUrl);
  const parser = new DOMParser();
  const documentCopy = parser.parseFromString(html, "text/html");

  documentCopy.querySelectorAll("base, meta[http-equiv]").forEach((node) => {
    const type = node.getAttribute("http-equiv")?.toLowerCase();
    if (node.tagName === "BASE" || type === "content-security-policy" || type === "refresh") node.remove();
  });

  const attributes = [
    ["script[src]", "src"], ["link[href]", "href"], ["img[src]", "src"],
    ["source[src]", "src"], ["video[src]", "src"], ["audio[src]", "src"],
    ["track[src]", "src"], ["input[src]", "src"], ["object[data]", "data"],
    ["form[action]", "action"], ["a[href]", "href"], ["area[href]", "href"],
  ];
  for (const [selector, attribute] of attributes) {
    documentCopy.querySelectorAll(selector).forEach((node) => node.setAttribute(attribute, absoluteAssetUrl(node.getAttribute(attribute), baseUrl)));
  }
  documentCopy.querySelectorAll("[srcset]").forEach((node) => node.setAttribute("srcset", absolutizeSrcset(node.getAttribute("srcset"), baseUrl)));
  const discoveredIcon = documentCopy.querySelector('link[rel~="icon" i][href]');
  if (discoveredIcon) {
    tab.favicon = discoveredIcon.href;
    tab.faviconDisabled = false;
  }

  const compatibilityPolicy = documentCopy.createElement("meta");
  compatibilityPolicy.httpEquiv = "Content-Security-Policy";
  compatibilityPolicy.content = "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; img-src * data: blob:; media-src * data: blob:; connect-src * data: blob:; font-src * data:; frame-src * data: blob:; worker-src * data: blob:;";
  documentCopy.head.prepend(compatibilityPolicy);
  documentCopy.head.insertAdjacentHTML("afterbegin", bridge);
  return `<!doctype html>${documentCopy.documentElement.outerHTML}`;
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
  if (tab.renderType === "direct") {
    const observable = syncObservableFrame(tab);
    if (!tab.automaticFallback && tab.id === activeTabId && !observable) {
      showStatus("Real website loaded. If it shows a blocked-page icon, use compatibility mode.", "Fix page", () => loadTab(tab, "recreate"));
    }
  }
}

function loadRecreated(tab, url, token) {
  loadSnapshotCompatibility(tab, url, token);
}

async function loadSnapshotCompatibility(tab, url, token) {
  tab.renderType = "recreated";
  tab.title = hostname(url);
  renderAll();
  showStatus("Loading interactive compatibility...", "", null, true);
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
    renderAll();
    hideStatus();
    showStatus("Interactive HTML fallback loaded the website files.", "Try real site", () => {
      const directToken = ++tab.loadingToken;
      loadDirect(tab, url, directToken);
    });
  } catch {
    if (tab.loadingToken !== token) return;
    loadDirect(tab, url, token, true);
    showStatus("Interactive compatibility failed. Keeping the real website attempt.", "Open directly", () => window.open(url, "_blank"));
  } finally {
    window.clearTimeout(timeout);
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

function loadDirectThenCompatibility(tab, url, token) {
  loadDirect(tab, url, token);
  tab.automaticFallback = true;
  showStatus("Trying the real website first...", "", null, true);
  tab.fallbackTimer = window.setTimeout(() => {
    if (tab.loadingToken !== token || tab.renderType !== "direct") return;
    loadRecreated(tab, url, token);
  }, 2600);
}

function loadGoogleFrame(tab, url, token) {
  if (tab.loadingToken !== token) return;
  tab.renderType = "google";
  tab.title = "Google";
  prepareFrame(tab, false);
  tab.frame.src = googleEmbedUrl(url);
  renderAll();
  hideStatus();
}

function loadGoogle(tab, url, token) {
  loadGoogleFrame(tab, url, token);
}

function loadTab(tab, preference = "auto") {
  const url = currentAddress(tab);
  if (!url) return;
  const token = ++tab.loadingToken;
  setLoading(tab.id === activeTabId);
  tab.surface.classList.add("active");

  if (preference === "recreate") { loadRecreated(tab, url, token); return; }
  if (isGoogle(url)) { loadGoogle(tab, url, token); return; }

  const youtube = youtubeEmbedUrl(url);
  if (youtube) { loadDirect(tab, youtube, token); return; }

  if (usesAutomaticCompatibility(url)) {
    loadDirectThenCompatibility(tab, url, token);
    return;
  }

  loadDirect(tab, url, token);
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
  if (currentAddress(tab)) loadTab(tab, tab.renderType === "recreated" ? "recreate" : "auto");
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
  loadTab(tab, tab.renderType === "recreated" ? "recreate" : "auto");
});
elements.home.addEventListener("click", goHome);
$("#brand-home").addEventListener("click", goHome);
elements.newTab.addEventListener("click", () => createTab());
elements.menuButton.addEventListener("click", () => setMenu(!menuOpen));
elements.desktopSwitch.addEventListener("click", toggleDesktop);
elements.recreateView.addEventListener("click", () => { const tab = activeTab(); setMenu(false); if (currentAddress(tab)) loadTab(tab, "recreate"); });
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

window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data.type !== "string" || typeof data.tabId !== "string") return;
  const tab = tabs.find((item) => item.id === data.tabId);
  if (!tab || event.source !== tab.frame.contentWindow) return;
  if (data.type === "pocket-browser:title") {
    const title = typeof data.title === "string" ? data.title.trim() : "";
    if (title && title !== tab.title) {
      tab.title = title.slice(0, 120);
      renderAll();
    }
    return;
  }
  if (data.type !== "pocket-browser:navigate" || typeof data.url !== "string") return;
  activeTabId = tab.id;
  navigate(unwrapRedirect(data.url), true, "auto", tab);
});

window.addEventListener("resize", () => {
  for (const tab of tabs) updateSurfaceScale(tab);
});

physicalMobile.addEventListener?.("change", () => {
  for (const tab of tabs) updateSurfaceScale(tab);
});

createTab();
