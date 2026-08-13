const $ = (selector) => document.querySelector(selector);

const elements = {
  address: $("#address"),
  addressForm: $("#address-form"),
  addressStatus: $("#address-status use"),
  back: $("#back"),
  bookmark: $("#bookmark"),
  browserContent: $("#browser-content"),
  browserFrame: $("#browser-frame"),
  browserMenu: $("#browser-menu"),
  closeTab: $("#close-tab"),
  desktopCheck: $("#desktop-check"),
  desktopMode: $("#desktop-mode"),
  deviceCaption: $("#device-caption"),
  forward: $("#forward"),
  heroAddress: $("#hero-address"),
  heroForm: $("#hero-form"),
  home: $("#home"),
  loadProgress: $("#load-progress"),
  menuButton: $("#menu-button"),
  menuDesktop: $("#menu-desktop"),
  menuMobile: $("#menu-mobile"),
  mobileCheck: $("#mobile-check"),
  mobileMode: $("#mobile-mode"),
  newTab: $("#new-tab"),
  openDirect: $("#open-direct"),
  phoneSpeaker: $("#phone-speaker"),
  reload: $("#reload"),
  siteDot: $("#site-dot"),
  startPage: $("#start-page"),
  tabTitle: $("#tab-title"),
  viewportFrame: $("#viewport-frame"),
  viewportStage: $("#viewport-stage"),
};

let historyItems = [""];
let historyIndex = 0;
let address = "";
let device = localStorage.getItem("pocket-browser-device") === "mobile" ? "mobile" : "desktop";
let menuOpen = false;
let bookmarked = false;

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
  catch { return "Website"; }
}

function setMenu(open) {
  menuOpen = open;
  elements.browserMenu.classList.toggle("is-hidden", !open);
  elements.menuButton.setAttribute("aria-expanded", String(open));
}

function setLoading(loading) {
  elements.loadProgress.classList.toggle("is-hidden", !loading);
}

function render() {
  const isHome = !address;
  elements.address.value = isHome ? "" : displayAddress(address);
  elements.tabTitle.textContent = isHome ? "New tab" : hostname(address);
  elements.siteDot.classList.toggle("home-dot", isHome);
  elements.siteDot.innerHTML = isHome ? '<svg><use href="#i-sparkles"></use></svg>' : "";
  elements.addressStatus.setAttribute("href", isHome ? "#i-search" : "#i-lock");
  elements.bookmark.classList.toggle("is-hidden", isHome);
  elements.bookmark.classList.toggle("is-bookmarked", bookmarked);
  elements.openDirect.classList.toggle("is-hidden", isHome);
  elements.openDirect.href = isHome ? "#" : address;
  elements.back.disabled = historyIndex <= 0;
  elements.forward.disabled = historyIndex >= historyItems.length - 1;
  elements.reload.disabled = isHome;
  elements.startPage.classList.toggle("is-hidden", !isHome);
  elements.viewportStage.classList.toggle("is-hidden", isHome);

  elements.browserContent.className = `browser-content ${device}`;
  elements.viewportFrame.className = `viewport-frame ${device}`;
  elements.desktopMode.classList.toggle("selected", device === "desktop");
  elements.mobileMode.classList.toggle("selected", device === "mobile");
  elements.desktopCheck.classList.toggle("is-hidden", device !== "desktop");
  elements.mobileCheck.classList.toggle("is-hidden", device !== "mobile");
  elements.phoneSpeaker.classList.toggle("is-hidden", device !== "mobile");
  elements.deviceCaption.classList.toggle("is-hidden", device !== "mobile");
}

function loadAddress(nextAddress, addToHistory = true) {
  const next = normalizeAddress(nextAddress);
  if (!next) return;
  address = next;
  bookmarked = false;
  if (addToHistory) {
    historyItems = [...historyItems.slice(0, historyIndex + 1), next];
    historyIndex = historyItems.length - 1;
  }
  setMenu(false);
  setLoading(true);
  render();
  elements.browserFrame.src = address;
}

function showHistoryItem(index) {
  if (index < 0 || index >= historyItems.length) return;
  historyIndex = index;
  address = historyItems[index];
  bookmarked = false;
  setMenu(false);
  setLoading(Boolean(address));
  render();
  if (address) elements.browserFrame.src = address;
  else elements.browserFrame.removeAttribute("src");
}

function goHome() {
  if (!address) return;
  historyItems = [...historyItems.slice(0, historyIndex + 1), ""];
  historyIndex = historyItems.length - 1;
  address = "";
  elements.browserFrame.removeAttribute("src");
  setLoading(false);
  setMenu(false);
  render();
}

function newTab() {
  historyItems = [""];
  historyIndex = 0;
  address = "";
  bookmarked = false;
  elements.browserFrame.removeAttribute("src");
  setLoading(false);
  setMenu(false);
  render();
}

function setDevice(next) {
  device = next;
  localStorage.setItem("pocket-browser-device", next);
  setMenu(false);
  render();
}

elements.addressForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loadAddress(elements.address.value);
});
elements.heroForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loadAddress(elements.heroAddress.value);
  elements.heroAddress.value = "";
});
elements.address.addEventListener("focus", () => elements.address.select());
elements.back.addEventListener("click", () => showHistoryItem(historyIndex - 1));
elements.forward.addEventListener("click", () => showHistoryItem(historyIndex + 1));
elements.reload.addEventListener("click", () => {
  if (!address) return;
  setLoading(true);
  elements.browserFrame.src = address;
});
elements.home.addEventListener("click", goHome);
$("#brand-home").addEventListener("click", goHome);
elements.closeTab.addEventListener("click", newTab);
elements.newTab.addEventListener("click", newTab);
elements.desktopMode.addEventListener("click", () => setDevice("desktop"));
elements.mobileMode.addEventListener("click", () => setDevice("mobile"));
elements.menuDesktop.addEventListener("click", () => setDevice("desktop"));
elements.menuMobile.addEventListener("click", () => setDevice("mobile"));
elements.menuButton.addEventListener("click", () => setMenu(!menuOpen));
elements.bookmark.addEventListener("click", () => {
  bookmarked = !bookmarked;
  render();
});
elements.browserFrame.addEventListener("load", () => setLoading(false));

document.querySelectorAll(".quick-links button").forEach((button) => {
  button.addEventListener("click", () => loadAddress(button.dataset.url || ""));
});
document.addEventListener("click", (event) => {
  if (menuOpen && !elements.browserMenu.contains(event.target) && !elements.menuButton.contains(event.target)) setMenu(false);
});

render();
