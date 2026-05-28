# LanDrop-WebUI

> LanDrop 的 Web 管理界面 — 安全的去中心化即时通讯客户端

[![Vue 3](https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vue.js)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF?logo=vite)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 项目简介

LanDrop-WebUI 是一个纯前端 SPA（单页应用），作为 LanDrop 系统的 Web 管理界面。它提供房间管理、即时通讯、文件传输、成员管理等核心功能。

**技术栈：** Vue 3 + TypeScript + Vite + Pinia + Vue Router

**后端依赖：** 需要独立的 LanDrop Kotlin 后端服务提供 REST API 和 WebSocket 支持。

## 快速开始（开发）

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器（默认 http://localhost:3000）
npm run dev
```

> 开发模式下，Vite 代理会将 `/api` 和 `/ws` 请求转发到 `http://localhost:8080`（后端默认地址）。

## 生产构建

```bash
# 构建生产版本
npm run build

# 产物输出到 dist/ 目录
```

或使用部署脚本：

```bash
bash deploy/deploy.sh
```

### 构建产物

```
dist/
├── index.html              # 入口 HTML（约 0.7 KB）
├── assets/
│   ├── index-xxxx.css      # 样式（约 7 KB gzip）
│   ├── vendor-xxxx.js      # Vue/Router/Pinia 框架（约 38 KB gzip）
│   ├── index-xxxx.js       # 应用代码（约 26 KB gzip）
│   └── cropper-xxxx.js     # 头像裁剪库（约 12 KB gzip）
```

**总大小约 84 KB（gzip 后），非常轻量。**

## 部署

### 本地预览

构建后启动预览服务器（默认端口 **3000**）：

```bash
bash deploy/deploy.sh --preview
# → http://localhost:3000
```

### Nginx 部署

使用部署脚本一键安装：

```bash
sudo bash deploy/deploy.sh --install [你的域名]
```

脚本会自动完成：

1. 构建前端
2. 复制文件到 `/var/www/landrop/`
3. 生成 Nginx 配置到 `/etc/nginx/sites-available/landrop`
4. 启用站点并重载 Nginx

默认 Nginx 配置（[`deploy/landrop-nginx.conf`](deploy/landrop-nginx.conf)）是一个**纯静态文件服务器**，不包含后端反向代理。后端地址由用户在登录页的「服务器配置」中自行填写。

### 纯静态托管

将 `dist/` 目录下的文件部署到任何静态托管平台（Nginx、Apache、S3、CDN 等）。

```bash
npm run build
# 将 dist/ 下所有文件上传到你的静态服务器
```

**用户端操作：**
- 打开前端页面
- 点击「服务器配置」
- 填写 HTTP 地址和 WebSocket 地址，指向你的 Kotlin 后端
- 勾选「记住服务器地址」（下次自动填充）

---

### 部署脚本

[`deploy/deploy.sh`](deploy/deploy.sh) 提供一键构建和部署功能：

```bash
# 仅构建
bash deploy/deploy.sh

# 构建 + 本地预览（http://localhost:3000）
bash deploy/deploy.sh --preview

# 构建 + 安装到系统 Nginx
sudo bash deploy/deploy.sh --install

# 指定域名安装
sudo bash deploy/deploy.sh --install chat.example.com

# 清理构建产物
bash deploy/deploy.sh --clean
```

## 环境要求

| 环境 | 版本 | 用途 |
|------|------|------|
| Node.js | >= 18 | 构建 |
| npm | >= 9 | 包管理 |
| Nginx（可选） | >= 1.20 | 生产部署 |

## 项目结构

```
src/
├── main.ts                 # 应用入口
├── App.vue                 # 根组件
├── router/                 # 路由配置（哈希路由）
├── stores/                 # Pinia 状态管理
│   ├── auth.ts             # 认证状态（JWT、服务器 URL）
│   └── chat.ts             # 聊天状态（消息、房间、成员）
├── composables/            # 组合式 API
│   ├── useApi.ts           # HTTP API 封装
│   └── useWebSocket.ts     # WebSocket 连接管理
├── components/             # UI 组件
│   ├── dialogs/            # 对话框组件
│   │   ├── AdminPanel.vue  # 系统管理（任命管理员、添加用户）
│   │   └── ...
│   └── ...
├── views/                  # 页面
│   ├── LoginPage.vue       # 登录页
│   └── ChatPage.vue        # 聊天页面
├── types/                  # TypeScript 类型定义
└── utils/                  # 工具
    ├── BlobCache.ts        # Blob URL 缓存
    └── IndexedDbCache.ts   # IndexedDB 持久化
```

## 认证机制

LanDrop-WebUI 使用 Ed25519 非对称加密进行挑战-响应认证：

1. **注册**：由系统管理员在「系统管理」面板中为用户注册，生成 Ed25519 密钥对
2. **登录**：服务端下发随机 challenge，客户端用私钥签名后验证
3. **会话**：JWT access token + refresh token 维持登录状态

## 常见问题

**Q: 前端启动后无法连接后端？**
- 开发模式：检查后端是否在 `localhost:8080` 运行
- 生产模式：在登录页展开「服务器配置」手动输入后端地址
- 勾选「记住服务器地址」避免重复输入

**Q: 如何修改后端代理地址？**
- 开发模式：修改 [`vite.config.ts`](vite.config.ts) 中的 `server.proxy` 配置
- 生产模式：在登录页「服务器配置」中填写后端 HTTP/WS 地址

**Q: WebSocket 连接不稳定？**
- 确认后端 WebSocket 心跳间隔是否合理
- 如果使用了反向代理，确保代理的超时时间足够大

**Q: 用户如何注册？**
- LanDrop-WebUI 不开放自主注册
- 由拥有 owner/public_admin 角色的管理员在「系统管理」面板中添加用户
- 管理员注册后获得私钥，需安全地发给对应用户
