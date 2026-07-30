#!/usr/bin/env node
/**
 * 🎀 小琦的碎片库 · 服务端持久层 (server.js)
 * ------------------------------------------------------------
 * 用 Node 原生 http 模块实现，零外部依赖。作用：
 *   - 托管前端静态文件（与 GitHub Pages 行为一致）
 *   - 把所有数据（含上传文件的 base64）真实写入服务器磁盘：
 *       /workspace/data/vault.json
 *   - 把每条记录里的附件抽成「真实文件」存到：
 *       /workspace/data/uploads/<记录id>.<扩展名>
 *   - 可选地把 AI（豆包）设置 / 调用代理到服务端
 *
 * 运行：
 *   node server.js                 # 默认端口 3000，数据目录 /workspace/data
 *   PORT=8080 node server.js       # 自定义端口
 *   DATA_DIR=/path/to/data node server.js   # 自定义数据目录
 *
 * 然后浏览器打开 http://localhost:3000/ 即可。
 * 前端会自动探测 /api/health：检测到就走服务端持久化，
 * 否则（如 GitHub Pages / file://）自动回退为仅浏览器本地存储。
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;

// ---------- 数据目录（可覆盖，带安全回退） ----------
let DATA_DIR = process.env.DATA_DIR || "/workspace/data";
function ensureDirs(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, "uploads"), { recursive: true });
    return true;
  } catch (e) {
    return false;
  }
}
if (!ensureDirs(DATA_DIR)) {
  const local = path.join(__dirname, "data");
  if (ensureDirs(local)) {
    console.log("[server] 默认 /workspace/data 不可写，改用本地目录:", local);
    DATA_DIR = local;
  } else {
    console.error("[server] 数据目录均不可用:", DATA_DIR, local);
  }
}
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const VAULT_FILE = path.join(DATA_DIR, "vault.json");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const PORT = parseInt(process.env.PORT || "3000", 10);

// 串行化写入，避免并发写冲突
let writeChain = Promise.resolve();
function enqueueWrite(fn) {
  writeChain = writeChain.then(fn, fn);
  return writeChain;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

function readBody(req, limit = 64 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function extFromType(type) {
  const map = {
    "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/gif": "gif",
    "image/webp": "webp", "image/svg+xml": "svg", "application/pdf": "pdf",
    "text/plain": "txt", "text/markdown": "md",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/zip": "zip",
  };
  return map[type] || "bin";
}

// 写入 vault.json（原子写），并把附件抽成真实文件
function saveVault(payload) {
  if (!payload || typeof payload !== "object") throw new Error("invalid payload");
  const sections = Array.isArray(payload.sections) ? payload.sections : [];
  const modules = Array.isArray(payload.modules) ? payload.modules : [];
  const records = Array.isArray(payload.records) ? payload.records : [];

  for (const r of records) {
    if (r && typeof r.blob === "string" && r._blobType) {
      try {
        const buf = Buffer.from(r.blob, "base64");
        const ext = extFromType(r._blobType);
        const fname = `${r.id || "rec"}.${ext}`;
        fs.writeFileSync(path.join(UPLOAD_DIR, fname), buf);
      } catch (e) {
        console.error("[server] 写附件失败:", e.message);
      }
    }
  }

  const toWrite = {
    app: "pkWorkbench",
    version: 1,
    savedAt: Date.now(),
    sections,
    modules,
    records,
  };
  const tmp = VAULT_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(toWrite, null, 2));
  fs.renameSync(tmp, VAULT_FILE);
  return toWrite;
}

function readVault() {
  try {
    if (!fs.existsSync(VAULT_FILE)) return { sections: [], modules: [], records: [] };
    const obj = JSON.parse(fs.readFileSync(VAULT_FILE, "utf-8"));
    return {
      sections: Array.isArray(obj.sections) ? obj.sections : [],
      modules: Array.isArray(obj.modules) ? obj.modules : [],
      records: Array.isArray(obj.records) ? obj.records : [],
    };
  } catch (e) {
    console.error("[server] 读取 vault 失败:", e.message);
    return { sections: [], modules: [], records: [] };
  }
}

function readConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch (_) {
    return {};
  }
}

// 可选：代理火山引擎 Ark 豆包大模型（Key 存于服务端 config.json，不暴露前端）
async function handleAiDoubao(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (_) {
    return sendJSON(res, 400, { error: "bad json" });
  }
  const cfg = readConfig();
  const apiKey = body.apiKey || cfg.doubao_api_key;
  const model = body.model || cfg.doubao_model || "doubao-pro-32k";
  const prompt = (body.prompt || "").slice(0, 12000);
  if (!apiKey) return sendJSON(res, 200, { summary: null });
  try {
    const upstream = await fetch("https://ark.cn-beijing.volces.com/api/v3/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "你是一个擅长做中文信息提炼的助手。请阅读用户提供的文本，输出简洁的中文摘要（150字以内），并给出3-6个关键词，用JSON返回，格式：{\"summary\":\"...\",\"tags\":[\"...\",\"...\"]}。",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
    });
    if (!upstream.ok) return sendJSON(res, 200, { summary: null });
    const j = await upstream.json();
    const content = j.choices?.[0]?.message?.content || "";
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (_) {
      parsed = { summary: content };
    }
    sendJSON(res, 200, { summary: parsed.summary || content, tags: parsed.tags || [] });
  } catch (e) {
    console.error("[server] 豆包代理失败:", e.message);
    sendJSON(res, 200, { summary: null });
  }
}

const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch (_) {
    pathname = "/";
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  // ---------- API 路由 ----------
  if (pathname.startsWith("/api/")) {
    try {
      if (pathname === "/api/health" && req.method === "GET") {
        return sendJSON(res, 200, { ok: true, backend: true, dataDir: DATA_DIR });
      }
      if (pathname === "/api/vault" && req.method === "GET") {
        return sendJSON(res, 200, readVault());
      }
      if (pathname === "/api/vault" && req.method === "POST") {
        let payload;
        try {
          payload = JSON.parse(await readBody(req));
        } catch (_) {
          return sendJSON(res, 400, { error: "invalid json" });
        }
        const saved = await enqueueWrite(() => saveVault(payload));
        return sendJSON(res, 200, { ok: true, savedAt: saved.savedAt });
      }
      if (pathname === "/api/config" && req.method === "GET") {
        return sendJSON(res, 200, readConfig());
      }
      if (pathname === "/api/config" && req.method === "POST") {
        let payload;
        try {
          payload = JSON.parse(await readBody(req));
        } catch (_) {
          return sendJSON(res, 400, { error: "invalid json" });
        }
        const cfg = {
          doubao_api_key: payload.doubao_api_key || "",
          doubao_model: payload.doubao_model || "",
        };
        await enqueueWrite(() => fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2)));
        return sendJSON(res, 200, { ok: true });
      }
      if (pathname === "/api/ai/doubao" && req.method === "POST") {
        return await handleAiDoubao(req, res);
      }
      if (pathname.startsWith("/api/uploads/") && req.method === "GET") {
        const name = path.basename(pathname.replace("/api/uploads/", ""));
        const fp = path.join(UPLOAD_DIR, name);
        if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) {
          return sendJSON(res, 404, { error: "not found" });
        }
        const ext = path.extname(fp).toLowerCase();
        res.writeHead(200, {
          "Content-Type": MIME[ext] || "application/octet-stream",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=31536000",
        });
        return fs.createReadStream(fp).pipe(res);
      }
      return sendJSON(res, 404, { error: "not found" });
    } catch (e) {
      console.error("[server] API error:", e);
      return sendJSON(res, 500, { error: String(e.message || e) });
    }
  }

  // ---------- 静态文件 ----------
  let rel = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(ROOT, rel));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("forbidden");
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    const fallback = path.join(ROOT, "index.html");
    if (fs.existsSync(fallback)) {
      res.writeHead(200, { "Content-Type": MIME[".html"], "Cache-Control": "no-cache" });
      return fs.createReadStream(fallback).pipe(res);
    }
    res.writeHead(404);
    return res.end("not found");
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  fs.createReadStream(filePath).pipe(res);
});

function start(port) {
  const p = port || PORT;
  return server.listen(p, () => {
    console.log(`🎀 小琦的碎片库 服务端已启动: http://localhost:${p}`);
    console.log(`   数据目录 : ${DATA_DIR}`);
    console.log(`   vault.json: ${VAULT_FILE}`);
  });
}

// 既可直接 `node server.js` 运行，也可被测试/其他进程 require 后按需启动
if (require.main === module) {
  start(PORT);
}

module.exports = { start, createServer: () => server, getDataDir: () => DATA_DIR };
