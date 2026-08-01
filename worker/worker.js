// 「小琦的碎片库」云端同步 Worker —— 部署到 Cloudflare Workers + KV，完全免费、不需要绑卡
// 前端把数据 PUT 到本 Worker，Worker 写入 KV 命名空间；任意浏览器填同一 Worker URL + 密钥即可互通。
// 注意：Cloudflare KV 单值上限 25MB，因此单个附件 >24MB 会被本次同步跳过（文字照常同步）。
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
        const v = await env.KV.get("vault");
        if (!v) return json({ app: "pkWorkbench", version: 1, records: [], sections: [], modules: [] });
        return new Response(v, { headers: { ...cors(), "Content-Type": "application/json" } });
      }
      // PUT /sync  —— 保存整库
      if (path === "/sync" && (request.method === "PUT" || request.method === "POST")) {
        const body = await request.text();
        await env.KV.put("vault", body);
        return json({ ok: true });
      }
      // /file/{id}  —— 单个附件的读写
      if (path.startsWith("/file/")) {
        const fileId = decodeURIComponent(path.slice(6));
        if (request.method === "GET") {
          const obj = await env.KV.getWithMetadata(fileId, "arrayBuffer");
          if (!obj || !obj.value) return new Response("Not found", { status: 404, headers: cors() });
          const ct = (obj.metadata && obj.metadata.contentType) || "application/octet-stream";
          return new Response(obj.value, {
            headers: { ...cors(), "Content-Type": ct, "Cache-Control": "public, max-age=31536000" },
          });
        }
        if (request.method === "PUT" || request.method === "POST") {
          const ct = request.headers.get("Content-Type") || "application/octet-stream";
          const buf = await request.arrayBuffer();
          await env.KV.put(fileId, buf, { metadata: { contentType: ct } });
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
