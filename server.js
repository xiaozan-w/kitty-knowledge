/* 碎知识工作台 · 轻量持久化服务
 * 同时承担三件事：
 *   1) 静态托管 /workspace 下的前端文件
 *   2) 提供 /api/vault 接口 —— 知识库数据持久化
 *   3) 提供 /api/config 接口 —— Doubao AI 配置持久化
 *   4) 提供 /api/ai/doubao 代理 —— 调用豆包 AI 智能总结
 * 纯 Node 内置模块，无第三方依赖。
 */
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const ROOT = "/workspace";
const DATA_DIR = path.join(ROOT, "data");
const VAULT = path.join(DATA_DIR, "vault.json");
const CONFIG = path.join(DATA_DIR, "config.json");
const PORT = Number(process.env.PORT) || 8000;

fs.mkdirSync(DATA_DIR, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".markdown": "text/plain; charset=utf-8",
};

function sendJSON(res, code, obj) {
  const b = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(b);
}

function readBody(req, limit = 256 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new Error("payload too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function isValidVault(v) {
  return v && typeof v === "object" &&
    Array.isArray(v.sections) && Array.isArray(v.modules) && Array.isArray(v.records);
}

/* ---------- Doubao AI 代理 ---------- */
function proxyDoubao(req, res) {
  readBody(req, 100 * 1024).then(body => {
    let parsed;
    try { parsed = JSON.parse(body); } catch { sendJSON(res, 400, { error: "invalid json" }); return; }

    const apiKey = parsed.apiKey;
    const model = parsed.model || "doubao-pro-32k";
    const prompt = parsed.prompt;
    if (!apiKey || !prompt) { sendJSON(res, 400, { error: "missing apiKey or prompt" }); return; }

    const payload = JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: "你是豆包AI助手，擅长对文本进行简洁精准的中文摘要，请用2-3句话概括核心要点。" },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 300,
    });

    const options = {
      hostname: "ark.cn-beijing.volces.com",
      port: 443,
      path: "/api/v3/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    const proxyReq = https.request(options, (proxyRes) => {
      let data = "";
      proxyRes.on("data", c => data += c);
      proxyRes.on("end", () => {
        try {
          const j = JSON.parse(data);
          const content = j.choices?.[0]?.message?.content || "";
          sendJSON(res, 200, { summary: content, model: model });
        } catch {
          sendJSON(res, 502, { error: "doubao response parse failed", raw: data.slice(0, 500) });
        }
      });
    });

    proxyReq.on("error", (e) => {
      sendJSON(res, 502, { error: "doubao request failed", detail: e.message });
    });

    proxyReq.write(payload);
    proxyReq.end();
  }).catch(e => {
    sendJSON(res, 400, { error: e.message });
  });
}

/* ---------- Config 管理 ---------- */
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG, "utf8")); }
  catch { return {}; }
}
function saveConfig(obj) {
  fs.writeFileSync(CONFIG, JSON.stringify(obj, null, 2));
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];
  try {
    /* ---------------- API: Vault ---------------- */
    if (url === "/api/vault") {
      if (req.method === "GET") {
        let data;
        try { data = fs.readFileSync(VAULT, "utf8"); }
        catch { data = JSON.stringify({ sections: [], modules: [], records: [] }); }
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(data);
        return;
      }
      if (req.method === "POST") {
        const body = await readBody(req);
        let parsed;
        try { parsed = JSON.parse(body); } catch { sendJSON(res, 400, { error: "invalid json" }); return; }
        if (!isValidVault(parsed)) { sendJSON(res, 400, { error: "invalid vault shape" }); return; }
        fs.writeFileSync(VAULT, JSON.stringify(parsed));
        sendJSON(res, 200, { ok: true, savedAt: Date.now() });
        return;
      }
      res.writeHead(405); res.end("method not allowed"); return;
    }

    /* ---------------- API: Doubao AI Proxy ---------------- */
    if (url === "/api/ai/doubao" && req.method === "POST") {
      proxyDoubao(req, res);
      return;
    }

    /* ---------------- API: Config ---------------- */
    if (url === "/api/config") {
      if (req.method === "GET") {
        sendJSON(res, 200, loadConfig());
        return;
      }
      if (req.method === "POST") {
        const body = await readBody(req, 10 * 1024);
        let parsed;
        try { parsed = JSON.parse(body); } catch { sendJSON(res, 400, { error: "invalid json" }); return; }
        saveConfig(parsed);
        sendJSON(res, 200, { ok: true });
        return;
      }
      res.writeHead(405); res.end("method not allowed"); return;
    }

    /* ---------------- Static ---------------- */
    let rel = decodeURIComponent(url);
    if (rel === "/") rel = "/index.html";
    const filePath = path.normalize(path.join(ROOT, rel));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end("forbidden"); return; }
    fs.readFile(filePath, (err, buf) => {
      if (err) { res.writeHead(404); res.end("not found"); return; }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(buf);
    });
  } catch (e) {
    if (!res.headersSent) res.writeHead(500);
    res.end("server error: " + e.message);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[kitty-workbench] listening on http://0.0.0.0:${PORT}  (root=${ROOT})`);
});
