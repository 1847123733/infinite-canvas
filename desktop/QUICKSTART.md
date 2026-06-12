# Quick Start - Desktop Development

桌面版快速开始指南。

## 一键构建和运行

### 1. 安装依赖

```bash
cd desktop
npm install
```

### 2. 构建所有组件

```bash
npm run build:all
```

这会：
- 构建 Go API 二进制文件
- 构建 Next.js standalone 输出
- 构建 Electron 应用

### 3. 运行应用

```bash
npm run dev
```

### 4. 打包安装包

```bash
npm run dist
```

## 目录结构

```
desktop/
├─ src/
│   ├─ main/index.ts      # Electron 主进程
│   ├─ preload/index.ts   # 预加载脚本
│   └─ renderer/          # 渲染进程（可选）
├─ resources/
│   ├─ api/              # Go API 二进制（构建后）
│   └─ web/              # Next.js 输出（构建后）
├─ scripts/
│   ├─ build-api.mjs     # Go 构建脚本
│   └─ build-web.mjs     # Next.js 构建脚本
└─ dist-electron/        # 最终打包输出
```

## 数据存储

应用数据存储位置：

- **Windows**: `C:\Users\用户名\AppData\Roaming\InfiniteCanvas`
- **macOS**: `~/Library/Application Support/InfiniteCanvas`
- **Linux**: `~/.config/InfiniteCanvas`

## 常见问题

### Q: 如何修改端口？

A: 编辑 `.env` 文件：

```env
API_PORT=8080
WEB_PORT=3000
```

### Q: 如何添加图标？

A: 参考 [BUILD.md](./BUILD.md#应用图标)

### Q: 构建失败怎么办？

A: 查看 [BUILD.md](./BUILD.md#故障排查)

### Q: 如何测试健康检查？

A: 应用启动后会自动测试以下端点：

- Go API: `http://127.0.0.1:8080/api/health`
- Next.js: `http://127.0.0.1:3000/`

## 下一步

- 📖 阅读 [README.md](./README.md) 了解详细架构
- 🔧 查看 [BUILD.md](./BUILD.md) 了解构建选项
- 🚀 开始开发！

## 技术支持

有问题？提交 Issue：https://github.com/basketikun/infinite-canvas/issues