// 小琦的碎片库 —— 豆包转发代理（Cloudflare Worker）
// 作用：前端把"要概括的文本"发到这里，Worker 加上你的 API Key 转发给火山方舟，
//       再带上 CORS 头返回。Key 只存在 Worker 环境变量里，前端永远看不到。
// 部署：见同目录 README.md

// ⚠️ 改成你 GitHub Pages 的地址（只有这个域能调用，防止别人拿你的代理盗刷 Key）
const ALLOWED_ORIGIN = "https://xiaozan-w.github.io";

export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin") || "";
    const allow = origin === ALLOWED_ORIGIN ? origin : "null";

    const corsHeaders = {
      "Access-Control-Allow-Origin": allow,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };

    // 浏览器非简单请求会先发 OPTIONS 预检
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // 只允许白名单来源调用，避免别人拿你的代理刷 Key
    if (origin !== ALLOWED_ORIGIN) {
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    if (!env.DOUBAO_API_KEY) {
      return new Response("Worker 未配置 DOUBAO_API_KEY", { status: 500, headers: corsHeaders });
    }

    let body;
    try {
      body = await request.text();
    } catch (e) {
      return new Response("Bad Request", { status: 400, headers: corsHeaders });
    }

    const upstream = await fetch("https://ark.cn-beijing.volces.com/api/v3/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + env.DOUBAO_API_KEY,
      },
      body,
    });

    // 把上游响应原样转回，但补上 CORS 头，浏览器才会接收
    const respHeaders = {
      "Content-Type": upstream.headers.get("Content-Type") || "application/json",
      ...corsHeaders,
    };
    return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
  },
};
