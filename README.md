# Pocket Browser: real proxy edition

This version uses the same architecture as DogeUB: Scramjet in the browser plus a Wisp WebSocket server hosted with the site. It does not use iframe reconstruction or public CORS services.

## Deploy

1. Put all files in the root of a GitHub repository.
2. Create a Render Web Service from that repository.
3. Render reads `render.yaml`, installs the proxy runtime, and starts the server.

Do not enable GitHub Pages for this version. GitHub Pages cannot run the included Wisp server.

The repository stays flat. Render creates all dependency and runtime folders automatically during deployment.
