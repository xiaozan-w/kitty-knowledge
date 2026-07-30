export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    if (request.method === "POST" && url.pathname === "/api/ai") {
      try {
        const { text } = await request.json();
        if (!text || !text.trim()) return json({ error: "empty text" }, 400, cors);

        const base = (env.AI_BASE_URL || "https://api.deepseek.com/v1").replace(/\/$/, "");
        const model = env.AI_MODEL || "deepseek-chat";
        const key = env.AI_API_KEY;
        if (!key) return json({ error: "AI_API_KEY 未配置" }, 500, cors);

        const system = `你是知识整理助手。根据用户提供的文本提炼核心内容。严格只返回如下 JSON（不要任何额外文字或 markdown 代码块）：{"summary":"一句话概括全文核心要点","tags":["标签1","标签2","标签3"]}`;
        const resp = await fetch(base + "/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: system },
              { role: "user", content: text.slice(0, 12000) },
            ],
            temperature: 0.3,
            response_format: { type: "json_object" },
          }),
        });
        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content || "{}";
        let parsed;
        try { parsed = JSON.parse(content); } catch { parsed = {}; }
        return json(
          { summary: parsed.summary || "", tags: Array.isArray(parsed.tags) ? parsed.tags : [] },
          200, cors
        );
      } catch (e) {
        return json({ error: String(e) }, 500, cors);
      }
    }
    return new Response("Not found", { status: 404, headers: cors });
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
