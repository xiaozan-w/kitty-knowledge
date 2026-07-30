// 小琦的碎片库 · 云端同步 Worker
// 数据按「保险库密钥(vault key)」隔离存储到 Cloudflare KV。
// 每个密钥对应一份独立的 vault JSON（sections / modules / records）。
// 读写都按 id 做 last-write-wins 合并，多个设备并发修改也能最终一致。

export default {
  async fetch(request, env) {
    // CORS 预检
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/vault") {
      return json({ error: "not found" }, 404);
    }

    const key =
      request.headers.get("x-vault-key") || url.searchParams.get("key");
    if (!key) return json({ error: "missing x-vault-key" }, 400);

    if (request.method === "GET") {
      const data =
        (await env.VAULT.get(key, { type: "json" })) || emptyVault();
      return json(data);
    }

    if (request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid json" }, 400);
      }
      const incoming = body.state || body;
      const existing = (await env.VAULT.get(key, { type: "json" })) || emptyVault();
      const merged = mergeVault(existing, incoming);
      await env.VAULT.put(key, JSON.stringify(merged), {
        expirationTtl: 60 * 60 * 24 * 365 * 5, // 5 年不过期
      });
      return json(merged);
    }

    return json({ error: "method not allowed" }, 405);
  },
};

function emptyVault() {
  return { sections: [], modules: [], records: [] };
}

function mergeVault(a, b) {
  return {
    sections: mergeArr(a.sections, b.sections),
    modules: mergeArr(a.modules, b.modules),
    records: mergeArr(a.records, b.records),
  };
}

function mergeArr(a = [], b = []) {
  const map = new Map();
  for (const x of a) if (x && x.id) map.set(x.id, x);
  for (const x of b) {
    if (!x || !x.id) continue;
    const cur = map.get(x.id);
    // 时间戳相同或更新的一方胜出；缺省 0 时以传入方为准
    if (!cur || (x.updatedAt || 0) >= (cur.updatedAt || 0)) map.set(x.id, x);
  }
  return [...map.values()];
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}
