// tools/dev-server.mjs — local dev server with no-cache headers for *.js / *.mjs /
// *.css / *.html / *.json / *.svg. Wraps http.server and overrides do_HEAD /
// do_GET to inject `Cache-Control: no-store` on every project file. Vendor
// assets (assets/vendor/*) and audio/art binary blobs are also no-stored —
// the only thing we let the browser cache is the page itself, briefly, and
// even that gets a must-revalidate stamp.
//
// Replaces `python3 -m http.server 8126` in `npm run dev`.
//
// Usage:
//   PORT=8126 node tools/dev-server.mjs [directory]
// Default dir is cwd, default port is 8126.

import { createServer } from "node:http";
import { stat, readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

const PORT = Number(process.env.PORT || 8126);
const ROOT = resolve(process.argv[2] || ".");

// MIME table — minimal, just for the file types the project uses.
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".mjs":  "text/javascript; charset=utf-8",
  ".cjs":  "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".webp": "image/webp",
  ".ico":  "image/x-icon",
  ".wav":  "audio/wav",
  ".mp3":  "audio/mpeg",
  ".txt":  "text/plain; charset=utf-8",
};

function mimeFor(p) {
  return MIME[extname(p).toLowerCase()] || "application/octet-stream";
}

function safeJoin(root, urlPath) {
  // Strip query string, decode, normalize, ensure we stay inside root.
  const cleanPath = urlPath.split("?")[0].split("#")[0];
  const decoded = decodeURIComponent(cleanPath);
  const full = normalize(join(root, decoded));
  if (full !== root && !full.startsWith(root + sep)) return null;
  return full;
}

async function servePath(absPath, res) {
  let st;
  try { st = await stat(absPath); } catch (_) { return false; }
  if (st.isDirectory()) return false;  // don't auto-serve index — the page is /

  const body = await readFile(absPath);
  res.writeHead(200, {
    "Content-Type": mimeFor(absPath),
    "Content-Length": body.length,
    // The whole point of this script: never let the browser hold a copy.
    "Cache-Control": "no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
  });
  res.end(body);
  return true;
}

const server = createServer(async (req, res) => {
  const rawUrl = req.url || "/";
  // Strip query string + fragment before path checks — cache-bust URLs like
  // `/?v=20260812` must still resolve to index.html.
  const cleanPath = rawUrl.split("?")[0].split("#")[0];
  const target = safeJoin(ROOT, cleanPath);
  if (!target) { res.writeHead(400); res.end("bad path"); return; }

  // Root → serve index.html. Everything else → file or 404.
  const file = (cleanPath === "/" || cleanPath === "") ? join(ROOT, "index.html") : target;
  const ok = await servePath(file, res);
  if (!ok) { res.writeHead(404); res.end("not found"); }
});

server.listen(PORT, () => {
  console.log(`[dev] serving ${ROOT} on http://localhost:${PORT}/  (no-cache)`);
});