# DEPLOY_GIST.md — 用 GitHub Gist 实现多设备同步

`小琦的碎片库` 是纯前端应用，数据默认只保存在浏览器本地。
如果想在手机、微信、电脑之间**自动共享同一份数据**，可以把它同步到 **GitHub Gist**（免费的私有云存储）。

## 原理

- 应用在本地生成一个完整的 JSON 数据文件（板块、子模块、记录）。
- 每次数据变化后，前端会用你的 **GitHub Token** 把这个 JSON 推送到一个 **私有 Gist**。
- 在新设备上登录同一个 Gist，就能把所有数据拉下来。
- 所有操作走 GitHub 官方 API（`api.github.com`），在国内通常可以访问。

---

## 一、创建 GitHub Personal Access Token

1. 登录 GitHub：https://github.com
2. 点击右上角头像 → **Settings**
3. 左侧最下方菜单 → **Developer settings**
4. 左侧 **Personal access tokens** → **Tokens (classic)**
5. 点击 **Generate new token (classic)**
6. 输入一个备注，比如：`小琦的碎片库同步`
7. 勾选权限：**`gist`** 这一项即可，其他都不要勾
8. 点 **Generate token**
9. 把生成的那串 `ghp_xxxxxxxxxxxxxxxxxxxx` **复制保存好**（只显示一次）

> ⚠️ 这个 Token 相当于一把「只读写 Gist」的钥匙，不要截图发到公开地方。

---

## 二、在应用里开启同步

1. 打开网站：https://xiaozan-w.github.io/kitty-knowledge/
2. 点左下角 **⚙️ AI 设置**
3. 找到下面两项：
   - **GitHub Token**：粘贴刚才复制的 `ghp_xxxxxxxxxxxxxxxxxxxx`
   - **Gist ID**：第一次留空，后面设备再填同步后得到的 ID
4. 点 **保存设置**
5. 点 **立即同步**

第一次点击后，应用会帮你在 GitHub 新建一个**私有 Gist**，并自动把 Gist ID 保存到本地。
如果你看到提示「已创建同步 Gist：xxxxxx」，说明成功了。

---

## 三、在第二台设备上同步

1. 用同样的网址打开应用
2. 进入 **⚙️ AI 设置**
3. **GitHub Token** 填同一个 Token
4. **Gist ID** 填第一台设备上得到的 ID（可以在第一台设备的设置面板里看到，或去 GitHub → Your gists 里找名为「小琦的碎片库 · 云端同步备份」的那个）
5. 点 **保存设置** → **立即同步**

数据就会从 GitHub 拉下来，两边保持一致。

---

## 四、常见问题

### Q1：Token 泄露了怎么办？
回到 GitHub 的 Tokens 页面，把那个 Token 删除，重新生成一个新的，再填到所有设备里即可。

### Q2：Gist 能存多大的数据？
GitHub Gist 单文件建议不超过 10MB。如果你上传了很多大文件/图片，Gist 可能会超限。这种情况建议只同步文字记录，大文件手动备份。

### Q3：同步冲突怎么办？
应用会按每条记录的 `updatedAt` 时间戳做「后改覆盖先改」的合并，正常不会丢数据。

---

## 五、和 Cloudflare Worker 方案的区别

之前尝试过 Cloudflare Worker + KV 同步，但 `*.workers.dev` 域名在部分网络环境下无法访问（连接超时）。
GitHub Gist 方案不需要部署任何后端，只要一个 GitHub Token，网络可达性更好。
