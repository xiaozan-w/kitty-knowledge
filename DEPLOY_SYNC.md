# 部署云端同步（Cloudflare Worker + KV）⚠️ 已废弃

> **此方案已废弃。**
> 因为 `*.workers.dev` 域名在部分网络环境下无法访问（连接超时），现在改用 **GitHub Gist 同步方案**，不需要部署任何后端。
> 请直接使用 **`DEPLOY_GIST.md`**。

---

这份文档保留旧步骤作为参考。

## 一、准备

---

## 一、准备

1. 注册免费 Cloudflare 账号：https://dash.cloudflare.com/sign-up
2. 打开本机 **命令提示符（cmd）**（推荐，避免 PowerShell 执行策略拦截）：
   - 按 `Win + R`，输入 `cmd`，回车
3. 把 WorkBuddy 自带的 Node 临时加到环境变量，并进入同步 Worker 目录：
   ```cmd
   set PATH=C:\Users\小赞\.workbuddy\binaries\node\versions\22.22.2;%PATH%
   cd /d "D:\WorkBuddy\2026-07-30-13-22-07\kitty-knowledge\sync-worker"
   ```
4. 安装依赖并登录（浏览器授权）：
   ```cmd
   npm install
   npx wrangler login
   ```

> **如果你坚持用 PowerShell**：请先执行 `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process`，否则 `npm`/`npx` 的 `.ps1` 脚本会被系统禁止运行。

---

## 二、创建 KV 存储

```cmd
npx wrangler kv namespace create VAULT
```

终端会返回一段 JSON，形如：
```
{ "id": "a1b2c3d4....", "title": "kitty-sync-VAULT" }
```
把这串 `id` 复制下来。

---

## 三、填配置

打开本仓库 `sync-worker/wrangler.toml`，把：

```toml
id = "REPLACE_WITH_YOUR_KV_ID"
```

替换成上一步拿到的 id。

---

## 四、部署

```cmd
cd /d "D:\WorkBuddy\2026-07-30-13-22-07\kitty-knowledge\sync-worker"
npx wrangler deploy
```

成功后终端会打印你的 Worker 地址，类似：
```
https://kitty-sync.<你的子域>.workers.dev
```
记下这个地址。

---

## 五、在应用里开启同步

1. 打开 https://xiaozan-w.github.io/kitty-knowledge/
2. 点左下角 **⚙️ AI 设置**（同步设置放在同一个面板里）
3. 填写：
   - **同步服务器地址**：填上面的 Worker 地址，例如 `https://kitty-sync.xxx.workers.dev`
   - **保险库密钥**：你自己随便设一个口令（比如 `xiaoqi2026`），**所有设备必须填同一个**，它决定数据归属于哪一份保险库
4. 点 **保存设置**
5. 点 **立即同步**

之后：
- 在任意设备添加/修改数据，应用会在 1 秒内自动推送到云端
- 在另一台设备打开应用，会自动从云端拉取最新数据
- 微信、手机浏览器、电脑浏览器从此共享同一份内容

---

## 六、常见问题

- **多设备数据冲突？** 按「最后修改时间」自动合并，一般不会丢数据。
- **密钥忘了？** 换个新密钥就等于新建一个空保险库，旧数据还在老密钥下（记得备份）。
- **想换密钥/清空？** 在设置里改「保险库密钥」保存并立即同步即可。
- **不想同步了？** 把「同步服务器地址」清空保存即可，数据仍留在本地。
