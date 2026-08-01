# 🎀 碎知识 Kitty · 个人知识收纳

私人知识碎片管理 PWA 应用。永久部署在 GitHub Pages，支持离线使用，可安装到手机桌面。

## 🌐 在线访问

部署后访问：`https://<你的GitHub用户名>.github.io/kitty-knowledge/`

## ✨ 功能特性

- 📚 **三层结构**：板块 → 子模块 → 记录，支持拖拽排序
- 📄 **文件上传**：支持 PDF / 图片 / 纯文字，文件存于浏览器 IndexedDB
- 🔍 **PDF 预览**：内置 pdf.js，上传后直接在线查看
- 🖼️ **图片 OCR**：Tesseract.js 自动识别图片中的文字
- ✨ **智能概括**：本地文本提取概括 + 可选豆包 AI 概括
- 🔗 **跨领域关联**：记录之间可建立关联链接
- ⭐ **星标收藏**：重要记录置顶展示
- 🗑️ **回收站**：删除记录 7 天内可恢复
- 🔍 **全局搜索**：搜索标题、标签
- 🎀 **Hello Kitty 粉色主题**：精致可爱的视觉风格
- 📱 **PWA 支持**：可安装到手机桌面，离线使用
- 💾 **数据备份**：JSON 全库/分板块导出导入 + Markdown 文本导出
- 📦 **离线版导出**：生成单文件 HTML，可保存到任意位置永久使用
- 🎨 **响应式设计**：手机/平板/桌面完美适配

## 🚀 部署到 GitHub Pages

详细步骤见 [DEPLOY.md](./DEPLOY.md)，核心 3 步：

1. 在 https://github.com/new 创建名为 `kitty-knowledge` 的 Public 仓库
2. 推送代码：`git remote add origin https://github.com/<用户名>/kitty-knowledge.git && git push -u origin main`
3. 仓库 Settings → Pages → Source 选 **GitHub Actions**

## 💻 本地使用

### 纯前端模式（推荐，无需任何后端）
```bash
cd kitty-knowledge
python -m http.server 8765
# 访问 http://localhost:8765
```

> 应用为纯前端 + 浏览器本地存储（IndexedDB），不依赖任何后端服务器。

## 📁 文件结构

```
kitty-knowledge/
├── index.html              # 主页面（含 PWA 标签）
├── styles.css              # Hello Kitty 粉色主题完整样式
├── app.js                  # 完整应用逻辑（IndexedDB + CRUD + 搜索 + 导入导出）
├── index.standalone.html   # 离线单文件版
├── manifest.json            # PWA 清单
├── sw.js                    # Service Worker（离线缓存）
├── .nojekyll                # 禁用 GitHub Pages Jekyll
├── icons/                   # PWA 图标（粉色 🎀）
└── .github/workflows/deploy.yml  # GitHub Actions 自动部署
```

## 🛠 技术栈

- **前端**：纯 HTML/CSS/JS（无框架，原生实现）
- **数据存储**：IndexedDB（浏览器本地，纯前端无后端）
- **PDF 预览**：pdf.js
- **图片 OCR**：Tesseract.js
- **AI 概括**：本地文本提取（自动生成摘要与标签）
- **PWA**：manifest.json + Service Worker
- **部署**：GitHub Pages + GitHub Actions
