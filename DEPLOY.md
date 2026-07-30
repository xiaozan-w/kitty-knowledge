# 🎀 碎知识 Kitty 部署指南

## 应用已完成（使用原始源码 + PWA 支持）

应用文件全部就绪，位于：`D:\WorkBuddy\2026-07-30-13-22-07\kitty-knowledge\`

```
kitty-knowledge/
├── index.html              # 主页面（已添加 PWA 标签）
├── styles.css              # 粉色 Hello Kitty 主题完整样式
├── app.js                  # 完整应用逻辑（原始源码）
├── index.standalone.html   # 离线单文件版（原始源码）
├── server.js               # Node.js 后端（本地使用，GitHub Pages 不需要）
├── start.sh                # 本地启动脚本
├── manifest.json            # PWA 清单
├── sw.js                    # Service Worker（离线缓存）
├── .nojekyll                # 禁用 GitHub Pages Jekyll
├── icons/                   # PWA 图标（粉色 🎀）
│   ├── icon-192.png
│   └── icon-512.png
└── .github/workflows/deploy.yml  # GitHub Actions 自动部署
```

### 原版完整功能保留：
- ✅ 侧边栏 + 主内容区布局（可拖拽调宽度）
- ✅ IndexedDB 本地存储（支持 PDF/图片 Blob 文件）
- ✅ PDF 在线预览（pdf.js）
- ✅ 图片 OCR 文字识别（Tesseract.js）
- ✅ 豆包 AI 智能概括（可选，需 API Key）
- ✅ 拖拽排序（板块、模块）
- ✅ 最近删除回收站（7天恢复）
- ✅ 星标收藏 + 跨记录关联
- ✅ 全局总目录 + 局部目录
- ✅ 离线版导出
- ✅ 文本/Markdown 导出导入
- ✅ PWA 支持（可安装到手机桌面）

### 部署到 GitHub Pages 后的变化：
- 数据存储：IndexedDB（浏览器本地）—— 原来的后端存储不可用，但 IndexedDB 完全够用
- AI 概括：豆包 AI 代理不可用，但本地文本提取概括仍然可用
- 离线版下载：仍然可用（index.standalone.html 已包含在部署中）

---

## 🚀 部署到 GitHub Pages（3 步搞定）

### 第 1 步：在 GitHub 创建仓库

打开 https://github.com/new ，创建新仓库：

| 设置项 | 值 |
|--------|-----|
| **Repository name** | `kitty-knowledge` |
| **Description** | 碎知识 Kitty · 个人知识收纳（可选） |
| **Public/Private** | **Public**（Public 才能用 GitHub Pages 免费版） |
| **其他选项** | 全部不勾选（不要初始化 README、.gitignore、license） |

点击 **Create repository**。

### 第 2 步：推送代码到 GitHub

```bash
cd "D:\WorkBuddy\2026-07-30-13-22-07\kitty-knowledge"

git remote add origin https://github.com/xiaozan-w/kitty-knowledge.git

git push -u origin main
```

> 💡 Git remote 已经配置好了，直接运行 `git push -u origin main` 即可。
> 第一次推送会要求你输入 GitHub 用户名和密码（或 Personal Access Token）。

**如果要求 Personal Access Token：**
1. 打开 https://github.com/settings/tokens/new
2. Note 填 `kitty-deploy`
3. Expiration 选 `No expiration` 或 `90 days`
4. 勾选 `repo` 权限
5. 点击 **Generate token**，复制 token
6. 推送时用这个 token 当密码

### 第 3 步：启用 GitHub Pages

回到 GitHub 仓库页面：

1. 点击 **Settings** → 左侧 **Pages**
2. **Source** 选择：**GitHub Actions**
3. 等待 1-2 分钟，Actions 会自动部署

### ✅ 完成！

你的永久链接：**https://xiaozan-w.github.io/kitty-knowledge/**

打开浏览器访问，手机 Safari/Chrome 还能「添加到主屏幕」当成 App 用 🎀

---

## 🔧 常见问题

### 推送时提示 "repository not found"
- 检查用户名是否正确
- 确认仓库已创建且是 Public

### 部署后页面空白或 404
- 等待 2-3 分钟让 GitHub Actions 完成部署
- 查看仓库 **Actions** 标签页确认部署状态

### 数据丢失怎么办？
- 应用内有「⤓ 完整备份」功能，建议定期导出 JSON 备份
- 换一个浏览器/电脑需要重新导入备份
- 跨域名的数据不会自动同步

### 想在本地使用完整后端版？
```bash
cd "D:\WorkBuddy\2026-07-30-13-22-07\kitty-knowledge"
bash start.sh
```
这会启动 Node.js 服务器，支持服务端文件持久化。

### 想换成自己的域名？
- 仓库根目录新建 `CNAME` 文件，写入你的域名（如 `kitty.example.com`）
- 在你的域名 DNS 添加 CNAME 记录指向 `<用户名>.github.io`
