# 豆包转发代理（Cloudflare Worker）

让「小琦的碎片库」在浏览器（**尤其手机微信**）里也能用豆包做概括。

浏览器直连火山方舟会被跨域（CORS）拦截；这个 Worker 只做一件事：**替前端把请求转发给火山方舟，并加上正确的 CORS 头**。你的 API Key 存在 Worker 的环境变量里，前端永远拿不到，也不会泄露给任何人。

## 前置条件
- 一个 Cloudflare 账号（免费）
- 一个**你自己托管到 Cloudflare 的域名**（NS 改到 CF）——用来绑自定义域名，绕开 `*.workers.dev` 在国内被墙的问题。
  - 如果你暂时没有域名，也可以先用 `xxx.workers.dev` 测试，但**国内手机大概率连不上**，等于白做。

## 部署步骤
1. **拿火山方舟 API Key**（只显示一次，先复制好）：
   火山引擎控制台 → 方舟 → 「API 密钥管理」→ 创建密钥。
2. **创建 Worker**，把 `proxy.js` 内容粘进去：
   - 方式 A（控制台）：Cloudflare 控制台 → Workers & Pages → 创建 → 粘贴 `proxy.js` → 部署。
   - 方式 B（wrangler）：把本目录推上去（参考下方 `wrangler.toml`）。
3. **设置环境变量**：Worker → Settings → Variables → 添加 `DOUBAO_API_KEY`（值=你的火山方舟 Key，建议选 Secret 类型）。
4. **绑自定义域名**（关键，绕开被墙）：Worker → Settings → Triggers → Custom Domains → 添加子域，例如 `kitty-proxy.你的域名.com`。等 DNS 生效（几分钟）。
5. **在碎片库里填代理地址**：打开 ⚙️ 设置 → 填「① 豆包代理地址」= `https://kitty-proxy.你的域名.com`（Worker 直接接收 POST，不需要 `/doubao-proxy` 路径）。
6. 保存，去加一条记录点「✨ 智能概括」即可。

## 安全说明
- `proxy.js` 里的 `ALLOWED_ORIGIN` 写死成你的 GitHub Pages 地址，**只有该域能调用**，别人无法拿你的代理盗刷 Key。
- 若你以后改了 Pages 地址或为站点绑了自定义域，记得同步改 `ALLOWED_ORIGIN` 并重新部署 Worker。
- 代理**不存储任何数据**，只做实时转发。

## wrangler.toml 示例
```toml
name = "kitty-doubao-proxy"
main = "proxy.js"
compatibility_date = "2024-09-23"

# DOUBAO_API_KEY 用 Secret 存入，不要写进文件：
#   wrangler secret put DOUBAO_API_KEY
```
部署：`wrangler deploy`

## 排错
- 概要点了没反应 / 提示"已用本地概括"：打开电脑 Chrome F12 → Console，看是否有 `代理错误` 或跨域报错。
- `403 Forbidden`：检查 `ALLOWED_ORIGIN` 是否和你的 Pages 地址完全一致（含 `https://`）。
- 国内连不上：确认用的是**自定义域名**而非 `*.workers.dev`。
