// 「小琦的碎片库」云端同步 Worker —— 部署到 Cloudflare Workers + R2，完全免费
// 前端把数据 PUT 到本 Worker，Worker 写入 R2 存储桶；任意浏览器填同一 Worker URL + 密钥即可互通。
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 简单共享密钥鉴权：前端请求带 ?key= 或 header X-Vault-Key，与 Worker 变量 VAULT_KEY 一致
    const provided = url?.searchParams?.get("key") || request.headers.get("X-Vault-Key");
    if (provided !== env.VAULT_KEY) {
      return json({ error: "unauthorized" }, 401);
    }

    // CORS：允许任意来源（含 GitHub Pages / 微信浏览器）
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors() });
    }

    try {
      // GET /sync  —— 拉取整库（文字 + 附件引用）
      if (path === "/sync" && request.method === "GET") {
        const obj = await env.BUCKET.get("vault.json");
        if (!obj) return json({ app: "pkWorkbench", version: 1, records: [], sections: [], modules: [] });
        return new Response(obj.body, { headers: { ...cors(), "Content-Type": "application/json" } });
      }
      // PUT /sync  —— 保存整库
      if (path === "/sync" && (request.method === "PUT" || request.method === "POST")) {
        const body = await request.text();
        await env.BUCKET.put("vault.json", body, { httpMetadata: { contentType: "application/json" } });
        return json({ ok: true });
      }
      // /file/{id}  —— 单个附件的读写
      if (path.startsWith("/file/")) {
        const fileId = decodeURIComponent(path.slice(6));
        if (request.method === "GET") {
          const obj = await env.BUCKET.get("files/" + fileId);
          if (!obj) return new Response("Not found", { status: 404, headers: cors() });
          return new Response(obj.body, {
            headers: { ...cors(), "Content-Type": obj.httpMetadata?.contentType || "application/octet-stream", "Cache-Control": "public, max-age=31536000" },
          });
        }
        if (request.method === "PUT" || request.method === "POST") {
          const ct = request.headers.get("Content-Type") || "application/octet-stream";
          const buf = await request.arrayBuffer();
          await env.BUCKET.put("files/" + fileId, buf, { httpMetadata: { contentType: ct } });
          return json({ ok: true });
        }
      }
      return new Response("Not found", { status: 404, headers: cors() });
    } catch (e) {
      return json({ error: String(e) }, 500);
    }
  },
};

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Vault-Key",
  };
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors(), "Content-Type": "application/json" } });
}
