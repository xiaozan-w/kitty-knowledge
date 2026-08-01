# 云端同步部署指南（Cloudflare Workers + KV · 完全免费、不绑卡）

「小琦的碎片库」用 **Cloudflare Workers + KV** 做云端同步层。**不需要你的服务器、不跑 Docker、不装任何后端，也不需要绑卡或实名**。

只要在 Cloudflare 部署一个 Worker（代码已备好），拿到 **Worker URL** 和 **密钥**，填进工作台设置，微信 / Chrome / 任意浏览器打开同一个网址，看到的都是同一份数据。

---

## 一、注册 Cloudflare

1. 打开 https://dash.cloudflare.com/sign-up ，用邮箱注册（**无需实名认证、无需绑卡**）。
2. 注册后进入控制台首页。

> 提示：Cloudflare 的免费额度对个人完全够用——Workers 每天 10 万次请求、KV 免费 1GB 空间、每天 10 万次读 / 1000 次写。碎片库用不完。

## 二、创建 KV 命名空间（存储）

1. 左侧菜单进入 **Workers & Pages** → 上方标签 **KV**（或「键值存储」）。
2. 点 **Create a namespace**（创建命名空间）。
3. 名称填：`kitty-vault`（记下这个名字，后面绑定要用）。
4. 创建后会生成一个 **Namespace ID**（一串字符），也记下来（用 wrangler 时需要；纯 Dashboard 绑定时只需选名字）。

> 为什么用 KV 而不是 R2：R2 能存任意大文件，但 Cloudflare 创建 R2 桶**必须绑卡验证**；KV 不绑卡，单值上限 25MB，对个人碎片库的文字 + 普通含图 PDF 完全够用。

## 三、创建并部署 Worker（核心步骤）

**方式 A：Dashboard 粘贴（最省事，推荐）**

1. 左侧菜单进入 **Workers & Pages** → **Create** → **Create Worker**。
2. Worker 名称填：`kitty-vault-sync`（记下自动生成的地址，类似 `https://kitty-vault-sync.<你的子域>.workers.dev`）。
3. 把默认代码**全选删除**，粘贴本仓库 `worker/worker.js` 的全部内容。
4. 点右上角 **Deploy**（部署）。

**方式 B：用 Wrangler CLI（如果你装了 Node）**

```bash
cd worker
npm install -g wrangler
wrangler login
wrangler deploy
```

## 四、绑定 KV + 设置密钥

1. 在刚创建的 Worker 页面，进入 **Settings → Variables**（变量）。
2. **绑定 KV 命名空间**：
   - 找 **KV Namespace Bindings**（KV 命名空间绑定）
   - 点 **Add binding**（添加绑定）
   - Variable name（变量名）填：**`KV`**（必须大写 KV，代码里写死了）
   - KV namespace（命名空间）选：**`kitty-vault`**
   - 保存。
3. **设置密钥（VAULT_KEY）**：
   - 在 **Environment Variables**（环境变量）里点 **Add variable**
   - Variable name 填：**`VAULT_KEY`**
   - Value 填一个你自己定的随机字符串，例如 `kitty2026secret`（**记住它**，一会儿填到工作台）
   - 保存。

> 部署后建议点 **Deploy** 再保存一次，确保绑定与变量生效。

## 五、在工作台填 Worker URL + 密钥

1. 打开 https://xiaozan-w.github.io/kitty-knowledge/
2. 点左下角 **⚙️ AI 设置**
3. 在「☁️ 云端同步（Cloudflare Workers + KV）」里：
   - **Worker URL**：填第三节拿到的地址，如 `https://kitty-vault-sync.xxx.workers.dev`
   - **同步密钥**：填第四节设置的 `VAULT_KEY` 值
4. 点 **保存设置**（会自动连接并拉取云端数据），或点 **立即同步** 做一次双向同步。
5. 在微信、Chrome 等不同浏览器都填 **同一个 Worker URL + 同一个密钥**，数据就互通了。

## 六、关于附件 / 大文件

- 你上传的每个文件会单独上传到 KV，云端 JSON 记录里只留一个引用 ID。
- **单文件上限 24MB**（KV 单值 25MB 留一点余量）。单个附件 >24MB 时会被本次同步跳过并提示，但 **文字照常同步**，不会整库失败。
- 普通含图 / 扫描 PDF（十几页、20MB 内）都能正常跨浏览器同步与下载原文件。
- 如果某些高清长扫描 PDF 超过 24MB：用任意免费 PDF 压缩工具（如手机 App「PDF 压缩」、或 ilovepdf.com）压到 24MB 内再上传即可；或后续我可以加「KV 分块」让附件无大小限制。

## 七、故障排除

| 现象 | 原因 / 解决 |
| --- | --- |
| 提示「连接云端失败」 | Worker URL 复制错了（前后有空格）；或密钥与 VAULT_KEY 不一致；或 KV 绑定名不是 `KV` |
| 浏览器 Console 报 `HTTP 401` | 密钥不对（VAULT_KEY 与工作台填的不一致） |
| 浏览器 Console 报 `HTTP 404` | 第一次同步前 vault 不存在属正常；若持续 404，检查 Worker 是否部署成功 |
| 数据没同步 | 确认两个浏览器填的是 **同一个 Worker URL + 同一个密钥**；点「立即同步」手动触发 |
| 附件下载不到 | KV 文件被删；重新上传一次即可 |

## 八、备份

Cloudflare KV 里随时可通过控制台查看 `vault` 键。也可在工作台左侧点 **「⤓ 完整备份」** 导出一份 JSON 存本地，双保险。

> Cloudflare 是「别人已经开好的全球边缘服务器」，你只管部署一个 Worker、填 URL 用，最省心。无需自建 server.js 或跑容器，不花钱、不绑卡。
