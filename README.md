# Pocket Browser: GitHub Pages edition

This folder is ready to upload directly to a GitHub repository and publish with GitHub Pages. It has no dependencies and no build step.

## Publish it

1. Extract the ZIP.
2. Upload all files inside `Pocket-Browser-GitHub-Pages` to the root of a GitHub repository.
3. In that repository, open `Settings` > `Pages`.
4. Under `Build and deployment`, choose `Deploy from a branch`.
5. Select your branch, usually `main`, and the `/ (root)` folder.
6. Save and wait for the public link.

## Limitation

GitHub Pages is static hosting. It cannot run a compatibility proxy, so this version uses direct iframes. Websites with `X-Frame-Options` or restrictive `Content-Security-Policy` headers will refuse to appear. CAPTCHAs, logins, cookies, and cross-origin links can also behave differently inside an iframe.

For blocked pages, use the menu and choose `Open page directly`.
