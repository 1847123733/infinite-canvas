# Desktop Build Guide

完整的桌面应用构建指南。

## 前置要求

- Node.js 18+ （用于构建 Electron）
- Go 1.21+ （用于构建 Go API）
- Windows/macOS/Linux 系统

## 开发环境设置

### 1. 克隆仓库

```bash
git clone https://github.com/basketikun/infinite-canvas.git
cd infinite-canvas
```

### 2. 安装依赖

```bash
# 安装 Electron 桌面依赖
cd desktop
npm install

# 安装 Web 依赖（在 web 目录）
cd ../web
bun install  # 或 npm install
```

## 构建流程

### 方法 1：使用 npm 脚本（推荐）

在项目根目录：

```bash
cd desktop

# 完整构建（API + Web + Electron）
npm run build:all

# 打包安装包（当前平台）
npm run dist

# 或者分步执行
npm run build:api    # 构建 Go API
npm run build:web    # 构建 Next.js
npm run build        # 构建 Electron
```

### 方法 2：手动分步构建

#### 步骤 1：构建 Go API

```bash
# 在项目根目录
go build -o desktop/resources/api/api.exe main.go  # Windows
# 或
go build -o desktop/resources/api/api main.go      # macOS/Linux
```

#### 步骤 2：构建 Next.js

```bash
cd web
bun run build  # 或 npm run build

# 复制 standalone 输出到 desktop/resources/web
# 这会生成：
# - server.js
# - .next/
# - public/
# - node_modules/
```

#### 步骤 3：构建 Electron

```bash
cd ../desktop
npm run build
```

#### 步骤 4：打包安装包

```bash
npm run dist
```

## 平台特定构建

### Windows

```bash
npm run dist:win
```

输出：
- `dist-electron/Infinite Canvas Setup x64.exe`

### macOS

```bash
npm run dist:mac
```

输出：
- `dist-electron/Infinite Canvas-arm64.dmg` (Apple Silicon)
- `dist-electron/Infinite Canvas-x64.dmg` (Intel)

### Linux

```bash
npm run dist:linux
```

输出：
- `dist-electron/Infinite Canvas-x64.AppImage`
- `dist-electron/infinite-canvas-desktop_0.2.5_amd64.deb`

## 应用图标

### 准备图标文件

1. 创建 1024x1024 的 PNG 图标文件（命名为 `icon.png`）
2. 将其放在 `desktop/build/` 目录

### 生成图标

安装工具：

```bash
npm install --save-dev electron-icon-builder
```

生成图标：

```bash
npx electron-icon-builder --input=build/icon.png --output=build
```

这会生成：
- `build/icon.ico` (Windows)
- `build/icon.icns` (macOS)
- `build/icon.png` (Linux)

### 图标要求

- Windows: `.ico` 格式，支持 256x256 及以上
- macOS: `.icns` 格式，支持 512x512 及以上
- Linux: `.png` 格式，建议 1024x1024

## 配置说明

### 端口配置

编辑 `desktop/.env` 文件：

```env
API_HOST=127.0.0.1
API_PORT=8080
WEB_HOST=127.0.0.1
WEB_PORT=3000
```

### Go API 配置

Electron 会通过环境变量传递以下配置给 Go API：

```env
BIND_ADDR=127.0.0.1
PORT=8080
DATABASE_DSN=<userData>/data/infinite-canvas.db
JWT_SECRET=<随机生成的密钥>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<用户设置>
LOG_PATH=<userData>/logs/api.log
```

### Next.js 配置

Electron 会通过环境变量传递以下配置给 Next.js：

```env
HOSTNAME=127.0.0.1
PORT=3000
API_BASE_URL=http://127.0.0.1:8080
```

## 故障排查

### Go 构建失败

```bash
# 检查 Go 版本
go version  # 需要 1.21+

# 清理缓存
go clean -modcache
go mod download
```

### Next.js 构建失败

```bash
cd web
rm -rf .next node_modules
bun install  # 或 npm install
bun run build
```

### Electron 构建失败

```bash
cd desktop
rm -rf dist node_modules
npm install
npm run build
```

### 端口被占用

应用会自动查找可用端口，但也可以手动修改 `.env` 文件。

### 健康检查失败

检查日志：

- API 日志：`<userData>/logs/api.log`
- Web 日志：`<userData>/logs/web.log`
- Desktop 日志：`<userData>/logs/desktop.log`

## 开发模式

运行开发版本：

```bash
cd desktop
npm run dev
```

这会：
1. 启动 Electron（带 DevTools）
2. 自动检测 Go 和 Next.js 构建
3. 如果没有构建，尝试从源码运行

## CI/CD 集成

### GitHub Actions

可以在 `.github/workflows/` 下添加构建流程：

```yaml
name: Build Desktop

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [windows-latest, macos-latest, ubuntu-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: '1.21'
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: cd desktop && npm ci
      - run: npm run build:all
      - run: npm run dist
      - uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.os }}-build
          path: dist-electron/*
```

## 自动更新（待实现）

计划使用 `electron-updater` 实现自动更新：

1. 在 GitHub Releases 发布新版本
2. 应用检查更新
3. 下载并安装

## 许可证

MIT