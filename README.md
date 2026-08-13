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

- Normal websites try their real iframe first.
- Google searches use Google's iframe-compatible URL.
- Sites known to block normal framing briefly try the real page, then enter interactive compatibility reconstruction.
- Compatibility reconstruction keeps page HTML, CSS, JavaScript, images, links, and GET forms where the remote site permits them.
- If reconstruction fails, the real-site attempt remains visible.
- All compatibility paths remain interactive.

## Remaining limitations

GitHub Pages cannot override another website's iframe policy or run a proxy backend. Login providers, DRM media, anti-bot systems, and device-security checks may still reject reconstructed sessions.
