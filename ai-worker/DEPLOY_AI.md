# 联网 AI 解析 · Cloudflare Worker 部署指南

> 目标：让你的「碎知识 Kitty」在 GitHub Pages（纯静态）上也能调用**真·联网 AI** 自动生成摘要和标签，
> 同时**不让 AI Key 暴露在前端代码里**（Key 只存在 Cloudflare Worker 的环境变量中）。

---

## 一、准备一个 AI 服务（任选其一，都是 OpenAI 兼容接口）

| 服务商 | 注册 | 特点 |
|--------|------|------|
| **DeepSeek** | https://platform.deepseek.com | 便宜、国内可直连 |
| **硅基流动 SiliconFlow** | https://siliconflow.cn | 国内可用，有免费额度 |
| **OpenAI** | https://platform.openai.com | 通用，需海外网络 |

拿到：
- **API Key**（一串 sk-...）
- **Base URL**（如 `https://api.deepseek.com/v1`）
- **模型名**（如 `deepseek-chat`）

---

## 二、部署 Cloudflare Worker（免费）

### 方式 A：网页控制台（最简单，无需装环境）

1. 打开 https://dash.cloudflare.com/ 注册/登录（免费）
2. 左侧 **Workers & Pages → Create Worker**
3. 把默认代码**全部删掉**，粘贴本目录 `src/index.js` 的内容
4. 点 **Deploy**
5. 部署成功后，进入该 Worker → **Settings → Variables → Environment Variables**：
   - 添加 `AI_BASE_URL`（如 `https://api.deepseek.com/v1`）
   - 添加 `AI_MODEL`（如 `deepseek-chat`）
6. 同一页面点 **Add variable → Secret**，添加 **`AI_API_KEY`**（填你的 Key，Secret 不显示在代码里）
7. 回到 Worker 首页，浏览器地址栏里那个 `https://<名字>.<账号>.workers.dev` 就是你的 **Worker URL**

### 方式 B：用 wrangler 命令行

```bash
cd ai-worker
npm install -g wrangler
wrangler login
wrangler secret put AI_API_KEY      # 按提示粘贴你的 Key（Secret）
wrangler deploy
# 部署完输出的 https://...workers.dev 即 Worker URL
```

> `wrangler.toml` 里已预填 DeepSeek 的 `AI_BASE_URL` / `AI_MODEL`，用的是硅基/DeepSeek 就无需改；
> 用 OpenAI 把这两个值改成 `https://api.openai.com/v1` 和 `gpt-4o-mini` 再 deploy。

---

## 三、在「碎知识 Kitty」里启用

1. 打开应用 → 点右上角 **⚙️ 设置**（AI 智能概括设置）
2. 找到「**联网 AI 代理地址（Cloudflare Worker URL）**」
3. 填入刚才得到的 Worker URL（如 `https://kitty-ai.xxx.workers.dev`）
4. 保存

---

## 四、使用

- 新增记录时**上传 PDF / 图片 / 文字** → 点 **✨ 智能概括**，即可联网调用 AI 生成摘要 + 标签
- 旧记录想重新解析：打开记录编辑弹窗 → 重新上传文件 或 直接点 **✨ 智能概括**（会重新提取文本并调用 AI）
- 如果 Worker 地址没填 / 调用失败，会自动回退到**本地文本提取**，功能不中断

---

## 常见问题

- **CORS 报错**：Worker 已配置 `Access-Control-Allow-Origin: *`，正常不会。若仍报错，确认填入的 URL 是 Worker 根地址（不含 `/api/ai` 后缀，代码会自动拼）。
- **返回 empty / 报错**：检查 Worker 的 `AI_API_KEY` Secret 是否填对、额度是否充足。
- **免费额度**：Cloudflare Workers 免费版每天 10 万次请求，个人使用绰绰有余。
