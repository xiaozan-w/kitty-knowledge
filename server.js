/**
 * 小琦的碎片库 —— 服务端持久层（零额外依赖，Node 内置模块即可）
 *
 * 用途：
 *   1. 托管前端静态文件（index.html / styles.css / app.js / assets ...）
 *   2. 提供 /api/vault 读写接口，把全部数据真实写入磁盘（/data/vault.json）
 *   3. 把每条记录的附件（图片/PDF 的 base64）抽取成真实文件存到 /data/uploads/
 *   4. /api/config 保存豆包 AI 配置；/api/ai/doubao 代理 AI 调用
 *
 * 部署到腾讯云 CloudBase 云托管时：
 *   - 容器监听 process.env.PORT（默认 3000）
 *   - 持久化目录默认 /data（云托管挂载的文件存储），否则用 ./data
 *   - 前端与服务端同源，浏览器自动探测 /api/health 启用同步
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || (fs.existsSync("/data") ? "/data" : path.join(__dirname, "data"));
const VAULT_FILE = path.join(DATA_DIR, "vault.json");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}
function readBody(req) {
  return new Promise((res, rej) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => res(data));
    req.on("error", rej);
  });
}
function extForType(type) {
  if (!type) return "bin";
  if (type.startsWith("image/png")) return "png";
  if (type.startsWith("image/jpeg")) return "jpg";
  if (type.startsWith("image/gif")) return "gif";
  if (type.startsWith("image/webp")) return "webp";
  if (type.startsWith("image/svg")) return "svg";
  if (type.startsWith("application/pdf")) return "pdf";
  if (type.startsWith("video/mp4")) return "mp4";
  if (type.startsWith("text/")) return "txt";
  return (type.split("/")[1] || "bin").split(";")[0];
}
function readVault() {
  try { return JSON.parse(fs.readFileSync(VAULT_FILE, "utf8")); } catch (_) { return null; }
}
function writeVaultAtomic(obj) {
  const tmp = VAULT_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, VAULT_FILE);
}
// 把记录里的 base64 附件写真实文件，vault 里只留占位（_storedFile=true），减小 JSON 体积
function detachBlobs(vault) {
  const records = (vault.records || []).map((r) => {
    if (r.blob && typeof r.blob === "string" && r._blobType !== undefined) {
      const ext = extForType(r._blobType);
      const file = path.join(UPLOAD_DIR, `${r.id}.${ext}`);
      try { fs.writeFileSync(file, Buffer.from(r.blob, "base64")); } catch (_) {}
      return { ...r, blob: null, _storedFile: true };
    }
    return r;
  });
  return { ...vault, records };
}
// 读 vault 时把真实附件文件重新嵌回记录（前端拿到完整数据）
function attachBlobs(vault) {
  if (!vault || !vault.records) return vault;
  const records = vault.records.map((r) => {
    if (r._storedFile) {
      const ext = extForType(r._blobType);
      const file = path.join(UPLOAD_DIR, `${r.id}.${ext}`);
      try {
        const b64 = fs.readFileSync(file).toString("base64");
        return { ...r, blob: b64, _storedFile: false };
      } catch (_) { return { ...r, blob: null }; }
    }
    return r;
  });
  return { ...vault, records };
}

async function handle(req, res) {
  const u = new URL(req.url, `http://${req.headers.host}`);
  const p = u.pathname;

  // ---- API ----
  if (p === "/api/health") return sendJSON(res, 200, { ok: true, ts: Date.now() });

  if (p === "/api/vault" && req.method === "GET") {
    try {
      const v = readVault();
      if (!v) return sendJSON(res, 200, { app: "pkWorkbench", version: 1, sections: [], modules: [], records: [] });
      return sendJSON(res, 200, attachBlobs(v));
    } catch (e) { return sendJSON(res, 500, { error: String(e) }); }
  }
  if (p === "/api/vault" && req.method === "POST") {
    try {
      const raw = await readBody(req);
      const payload = JSON.parse(raw);
      writeVaultAtomic(detachBlobs(payload));
      return sendJSON(res, 200, { ok: true, ts: Date.now() });
    } catch (e) { return sendJSON(res, 400, { error: String(e) }); }
  }

  if (p === "/api/uploads" && req.method === "GET") {
    try {
      const files = fs.readdirSync(UPLOAD_DIR);
      return sendJSON(res, 200, { files });
    } catch (_) { return sendJSON(res, 200, { files: [] }); }
  }
  if (p.startsWith("/api/uploads/") && req.method === "GET") {
    const name = path.basename(p.slice("/api/uploads/".length));
    const file = path.join(UPLOAD_DIR, name);
    if (!fs.existsSync(file)) return sendJSON(res, 404, { error: "not found" });
    const ext = path.extname(name);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "no-store" });
    return fs.createReadStream(file).pipe(res);
  }

  if (p === "/api/config" && req.method === "GET") {
    try { return sendJSON(res, 200, JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"))); }
    catch (_) { return sendJSON(res, 200, { doubao_api_key: "", doubao_model: "" }); }
  }
  if (p === "/api/config" && req.method === "POST") {
    try {
      const raw = await readBody(req);
      fs.writeFileSync(CONFIG_FILE, raw);
      return sendJSON(res, 200, { ok: true });
    } catch (e) { return sendJSON(res, 400, { error: String(e) }); }
  }

  if (p === "/api/ai/doubao" && req.method === "POST") {
    // 服务端代理：用服务端保存的 Key 调用豆包，避免 Key 暴露在前端
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
      const raw = await readBody(req);
      const upstream = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
      const r = await fetch(upstream, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.doubao_api_key}` },
        body: raw,
      });
      const text = await r.text();
      res.writeHead(r.status, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(text);
    } catch (e) { return sendJSON(res, 500, { error: String(e) }); }
  }

  // ---- 静态文件 ----
  let rel = decodeURIComponent(p);
  if (rel === "/") rel = "/index.html";
  // 防目录穿越
  const filePath = path.normalize(path.join(__dirname, rel));
  if (!filePath.startsWith(__dirname)) return sendJSON(res, 403, { error: "forbidden" });
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    // SPA 兜底：回退到 index.html
    const idx = path.join(__dirname, "index.html");
    if (fs.existsSync(idx)) {
      res.writeHead(200, { "Content-Type": MIME[".html"] });
      return fs.createReadStream(idx).pipe(res);
    }
    return sendJSON(res, 404, { error: "not found" });
  }
  const ext = path.extname(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "no-cache" });
  return fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => sendJSON(res, 500, { error: String(e) }));
});

if (require.main === module) {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`🎀 小琦的碎片库 服务端已启动: http://localhost:${PORT}`);
    console.log(`   数据目录 : ${DATA_DIR}`);
    console.log(`   vault.json: ${VAULT_FILE}`);
  });
}

module.exports = server;
