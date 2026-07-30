# 用于腾讯云 CloudBase 云托管的容器镜像
FROM node:18-alpine

WORKDIR /app

# 只复制必要文件，利用缓存
COPY package.json ./
RUN npm install --production 2>/dev/null || true

COPY . .

# 云托管会把持久化文件存储挂载到 /data（本服务默认写入 /data）
RUN mkdir -p /data/uploads

EXPOSE 3000

CMD ["node", "server.js"]
