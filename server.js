import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { logging, server as wisp } from "@mercuryworkshop/wisp-js/server";

const root = dirname(fileURLToPath(import.meta.url));
const runtime = join(root, ".proxy-runtime");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";

logging.set_level(logging.NONE);
Object.assign(wisp.options, {
  dns_method: "resolve",
  dns_servers: ["1.1.1.1", "1.0.0.1"],
  dns_result_order: "ipv4first",
});

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const publicFiles = new Set([
  "/app.js",
  "/favicon.svg",
  "/index.html",
  "/proxy-sw.js",
  "/style.css",
]);

function safeJoin(base, relative) {
  const output = resolve(base, relative.replace(/^\/+/, ""));
  return output === resolve(base) || output.startsWith(resolve(base) + sep) ? output : null;
}

function resolveRequest(pathname) {
  if (pathname === "/") return join(root, "index.html");
  if (publicFiles.has(pathname)) return safeJoin(root, pathname);

  const runtimeMatch = pathname.match(/^\/proxy-assets\/(scram|baremux|libcurl)\/(.+)$/);
  if (runtimeMatch) return safeJoin(join(runtime, runtimeMatch[1]), runtimeMatch[2]);
  return null;
}

async function sendFile(req, res, file) {
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error("Not a file");
    const type = mimeTypes[extname(file).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "Content-Length": info.size,
      "Cache-Control": file.endsWith("index.html") || file.endsWith("proxy-sw.js") ? "no-cache" : "public, max-age=3600",
      ...(file.endsWith("proxy-sw.js") ? { "Service-Worker-Allowed": "/" } : {}),
    });
    if (req.method === "HEAD") return res.end();
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    return res.end();
  }

  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  const file = resolveRequest(pathname);
  if (file) return sendFile(req, res, file);

  if (!pathname.startsWith("/proxy/") && req.headers.accept?.includes("text/html")) {
    return sendFile(req, res, join(root, "index.html"));
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

server.on("upgrade", (req, socket, head) => {
  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  if (pathname === "/wisp/") return wisp.routeRequest(req, socket, head);
  socket.destroy();
});

server.listen(port, host, () => console.log(`Pocket Browser running on port ${port}`));
