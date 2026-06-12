# Infinite Canvas Desktop

Infinite Canvas 桌面版，基于 Electron + Go + Next.js + SQLite。

## 技术架构

```
Electron App
├─ Electron Main Process
├─ Go API Server (localhost:xxxxx)
├─ Next.js Server (localhost:xxxxx)
└─ BrowserWindow (加载 Next.js 页面)
```

## 项目结构

```
desktop/
├─ src/
│   ├─ main/           # Electron 主进程
│   ├─ preload/        # 预加载脚本
│   └─ renderer/       # 渲染进程 (可选)
├─ resources/
│   ├─ api/           # Go API 二进制文件
│   └─ web/           # Next.js 打包输出
├─ scripts/
│   ├─ build-api.mjs  # 构建 Go API
│   └─ build-web.mjs  # 构建 Next.js
├─ build/             # 图标和打包资源
└─ dist-electron/     # 最终打包输出
```

## 开发环境要求

- Node.js 18+
- Go 1.21+
- Bun 或 npm

## 开发流程

### 1. 安装依赖

```bash
cd desktop
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件配置端口等参数
```

### 3. 构建 Go API

```bash
npm run build:api
```

这会在 `resources/api/` 目录下生成 Go 二进制文件。

### 4. 构建 Next.js

```bash
npm run build:web
```

这会在 `resources/web/` 目录下生成 Next.js standalone 打包输出。

### 5. 运行开发版本

```bash
npm run dev
```

### 6. 构建生产版本

```bash
npm run build:all
npm run dist
```

## 完整构建流程

### 构建所有组件

```bash
npm run build:all
```

这会依次执行：
1. 构建 Go API
2. 构建 Next.js
3. 构建 Electron

### 打包安装包

```bash
# Windows
npm run dist:win

# macOS
npm run dist:mac

# Linux
npm run dist:linux

# 当前平台
npm run dist
```

## 配置说明

### API 端口配置

在 `.env` 文件中配置：

```env
API_HOST=127.0.0.1
API_PORT=8080
WEB_PORT=3000
```

应用会自动查找可用端口。

### 数据存储位置

应用数据存储在系统 UserData 目录：

- **Windows**: `C:\Users\用户名\AppData\Roaming\InfiniteCanvas`
- **macOS**: `~/Library/Application Support/InfiniteCanvas`
- **Linux**: `~/.config/InfiniteCanvas`

目录结构：

```
userData/
├─ data/
│   └─ infinite-canvas.db      # SQLite 数据库
├─ uploads/                    # 上传文件
├─ prompts/                    # 提示词库
├─ logs/                       # 日志文件
│   ├─ api.log
│   ├─ web.log
│   └─ desktop.log
├─ backups/                    # 自动备份
└─ config.json                 # 应用配置
```

## 进程管理

Electron 主进程会自动管理 Go API 和 Next.js 进程：

- 应用启动时依次启动 Go API 和 Next.js
- 健康检查确保服务正常
- 应用退出时自动关闭所有进程
- 支持手动重启服务（通过 IPC）

## IPC API

主进程通过 IPC 向渲染进程暴露以下 API：

```typescript
// 获取配置
await window.electronAPI.getConfig()

// 设置配置
await window.electronAPI.setConfig(config)

// 获取应用信息
const info = await window.electronAPI.getAppInfo()
// { name, version, apiPort, webPort, userDataPath }

// 重启服务
const result = await window.electronAPI.restartServers()
// { success: boolean, error?: string, apiPort?: number, webPort?: number }

// 平台信息
console.log(window.electronAPI.platform) // win32, darwin, linux
console.log(window.electronAPI.arch)     // x64, arm64
```

## 首次启动

首次启动时会自动：

1. 创建所有必要的目录
2. 生成默认配置文件
3. 生成随机 JWT 密钥
4. 启动 Go API 和 Next.js 服务

后续可以添加首次启动向导。

## 故障排查

### 端口冲突

如果端口被占用，应用会自动查找可用端口。

### API 健康检查失败

检查 `logs/api.log` 查看错误信息。

### Next.js 启动失败

检查 `logs/web.log` 查看错误信息。

## 自动更新（待实现）

计划使用 `electron-updater` 实现：

- 检查更新
- 下载更新
- 自动安装
- 自动重启

## 安全说明

- Go API 仅绑定到 `127.0.0.1`，仅本机可访问
- Electron 窗口使用 `contextIsolation` 和 `nodeIntegration: false`
- 敏感配置存储在系统 UserData 目录

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！
