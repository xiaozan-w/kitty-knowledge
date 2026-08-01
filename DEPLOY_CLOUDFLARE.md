# 云端同步部署指南（Cloudflare Workers + R2 · 完全免费）

「小琦的碎片库」用 **Cloudflare Workers + R2** 做云端同步层。**不需要你的服务器、不跑 Docker、不装任何后端**，也不需要像腾讯云那样付费或实名。

只要在 Cloudflare 部署一个 Worker（代码已备好），拿到 **Worker URL** 和 **密钥**，填进工作台设置，微信 / Chrome / 任意浏览器打开同一个网址，看到的都是同一份数据。

---

## 一、注册 Cloudflare

1. 打开 https://dash.cloudflare.com/sign-up ，用邮箱注册（**无需实名认证**）。
2. 注册后进入控制台首页。

> 提示：Cloudflare 的免费额度对个人完全够用——Workers 每天 10 万次请求、R2 每月 10GB 存储，碎片库用不完。

## 二、创建 R2 存储桶

1. 左侧菜单进入 **R2 Object Storage**（或「对象存储」）。
2. 点 **Create bucket**（创建存储桶）。
3. 名称填：`kitty-vault`（记下这个名字，后面绑定要用）。
4. 创建。

> 注意：创建 R2 桶时 Cloudflare 可能会要求 **绑定一张信用卡** 用于身份验证（美国区常见），但**免费额度内不会扣费**。如果不想绑卡，可以试「欧洲」或「亚太」区域，部分区域创建桶不需要绑卡。这一步是 Cloudflare 平台要求，和本工作台无关。

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

## 四、绑定 R2 桶 + 设置密钥

1. 在刚创建的 Worker 页面，进入 **Settings → Variables**（变量）。
2. **绑定 R2 存储桶**：
   - 找 **R2 Bucket Bindings**（R2 桶绑定）
   - 点 **Add binding**（添加绑定）
   - Variable name（变量名）填：**`BUCKET`**
   - R2 bucket（存储桶）选：**`kitty-vault`**
   - 保存。
3. **设置密钥（VAULT_KEY）**：
   - 在 **Environment Variables**（环境变量）里点 **Add variable**
   - Variable name 填：**`VAULT_KEY`**
   - Value 填一个你自己定的随机字符串，例如 `kitty2026secret`（**记住它**，一会儿填到工作台）
   - 保存。

> 不想绑卡也能用：如果你卡在「绑卡」这步无法创建 R2 桶，告诉我，我可以改成「纯 Workers KV 存储」版本（KV 不需要绑卡，但单值上限 25MB，适合文字但附件要另行处理）。

## 五、在工作台填 Worker URL + 密钥

1. 打开 https://xiaozan-w.github.io/kitty-knowledge/
2. 点左下角 **⚙️ AI 设置**
3. 在「☁️ 云端同步（Cloudflare Workers + R2）」里：
   - **Worker URL**：填第三节拿到的地址，如 `https://kitty-vault-sync.xxx.workers.dev`
   - **同步密钥**：填第四节设置的 `VAULT_KEY` 值
4. 点 **保存设置**（会自动连接并拉取云端数据），或点 **立即同步** 做一次双向同步。
5. 在微信、Chrome 等不同浏览器都填 **同一个 Worker URL + 同一个密钥**，数据就互通了。

## 六、关于附件 / 大文件

- 你上传的每个文件会单独上传到 R2（类似网盘），云端 JSON 记录里只留一个引用 ID。
- 限制从「单条数据大小」变成「R2 总配额」——免费额度够个人长期用。
- 单个附件 >100MB 时会被本次同步跳过并提示，但 **文字照常同步**，不会整库失败。普通含图 / 扫描 PDF 都在 100MB 内，可正常跨浏览器同步与下载。

## 七、故障排除

| 现象 | 原因 / 解决 |
| --- | --- |
| 提示「连接云端失败」 | Worker URL 复制错了（前后有空格）；或密钥与 VAULT_KEY 不一致；或 R2 绑定名不是 `BUCKET` |
| 浏览器 Console 报 `HTTP 401` | 密钥不对（VAULT_KEY 与工作台填的不一致） |
| 浏览器 Console 报 `HTTP 404` | 第一次同步前 vault.json 不存在属正常；若持续 404，检查 Worker 是否部署成功 |
| 数据没同步 | 确认两个浏览器填的是 **同一个 Worker URL + 同一个密钥**；点「立即同步」手动触发 |
| 附件下载不到 | R2 文件被删；重新上传一次即可 |

## 八、备份

Cloudflare R2 桶里随时可下载 `vault.json` 和 `files/`。也可在工作台左侧点 **「⤓ 完整备份」** 导出一份 JSON 存本地，双保险。

> Cloudflare 是「别人已经开好的全球边缘服务器」，你只管部署一个 Worker、填 URL 用，最省心。无需自建 server.js 或跑容器，也不花钱。
