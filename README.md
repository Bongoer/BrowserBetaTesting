# Pocket Browser: GitHub Pages edition

This folder is ready to upload directly to a GitHub repository and publish with GitHub Pages. All browser-proxy files are already included, so there is no build step.

Features include multiple tabs, favicons, back/forward history per tab, smooth animations, automatic phone/desktop layout, a single Chrome-style "Desktop site" switch, real-site loading, and Smart Compatibility powered by a service-worker web proxy.

## Publish it

1. Extract the ZIP.
2. Upload all files inside `Pocket-Browser-GitHub-Pages` to the root of a GitHub repository.
3. In that repository, open `Settings` > `Pages`.
4. Under `Build and deployment`, choose `Deploy from a branch`.
5. Select your branch, usually `main`, and the `/ (root)` folder.
6. Save and wait for the public link.

## How compatibility rendering works

- Normal websites try their real iframe first.
- Google searches use Smart Compatibility so result clicks change the Pocket Browser address bar instead of becoming trapped inside Google's frame.
- Sites known to block normal framing briefly try the real page, then automatically enter Smart Compatibility.
- Smart Compatibility uses Scramjet, a service worker, BareMux, and libcurl transport. It rewrites HTML, CSS, JavaScript, requests, cookies, WebSockets, and navigation continuously instead of copying one page.
- Scramjet URL-change events keep the Pocket Browser address bar, tab title, history, and favicon synchronized.
- If the smart proxy cannot start, an interactive HTML reconstruction is attempted. If that also fails, the real-site attempt remains visible.
- All compatibility paths remain interactive.

GitHub Pages cannot run a proxy backend, so `proxy-config.js` uses a public Wisp relay by default. Compatibility traffic passes through that relay. You can replace the Wisp URL with your own server later.

## Included open-source components

- Mercury Workshop Scramjet 1.1.0
- Mercury Workshop BareMux 2.1.9
- Mercury Workshop libcurl transport 1.5.2

Their license texts are included in the `licenses` folder.

## Remaining limitations

The public relay can be unavailable, rate-limited, or blocked by a network filter. Some login providers, DRM media, anti-bot systems, and device-security checks can still reject a proxied session. Use `Try real website` or change the relay in `proxy-config.js` if Smart Compatibility cannot connect.
