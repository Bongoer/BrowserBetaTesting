# Pocket Browser: GitHub Pages edition

This folder is ready to upload directly to a GitHub repository and publish with GitHub Pages. There is no build step.

Features include multiple tabs, favicons, back/forward history per tab, smooth animations, automatic phone/desktop layout, a single Chrome-style "Desktop site" switch, real-site loading, and interactive compatibility reconstruction.

## Publish it

1. Extract the ZIP.
2. Upload all files inside `Pocket-Browser-GitHub-Pages` to the root of a GitHub repository.
3. In that repository, open `Settings` > `Pages`.
4. Under `Build and deployment`, choose `Deploy from a branch`.
5. Select your branch, usually `main`, and the `/ (root)` folder.
6. Save and wait for the public link.

## How compatibility rendering works

- Normal websites try their real iframe first, then switch to interactive compatibility so links can update the address bar.
- Google searches use Google's iframe-compatible URL.
- A compatibility link stays in compatibility mode instead of jumping back to the blocked real iframe.
- Compatibility tries three page sources and does not silently switch back to a blocked iframe if they fail.
- Compatibility reconstruction keeps page HTML, CSS, JavaScript, images, links, and GET forms where the remote site permits them.
- If reconstruction fails, the real-site attempt remains visible.
- All compatibility paths remain interactive.

## Remaining limitations

GitHub Pages cannot override another website's iframe policy or run a proxy backend. Login providers, DRM media, anti-bot systems, and device-security checks may still reject reconstructed sessions.
