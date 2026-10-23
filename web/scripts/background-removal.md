# 离线抠图资源

图片节点的“扣白底图”在独立浏览器 Worker 中使用 IMG.LY 和 ONNX Runtime 推理，不需要 AI API Key。

- `bun run prepare:background-removal` 准备 Worker、模型、WASM、MJS 和许可证；首次准备需要联网下载约 167 MB，后续使用本地文件并校验 SHA-256。
- `dev`、`build` 会先执行资源准备。桌面版沿用 `build:web` 对 `public` 的复制流程，无需另行打包模型。
- 资源生成在 `web/public/background-removal/1.7.0/`，不纳入 Git；运行时只从桌面版本地 HTTP 服务加载，首次抠图也可断网。
- WebGPU 使用 `isnet_fp16`；适配器或 `shader-f16` 不可用、初始化失败或推理失败时，销毁 Worker 并使用 `isnet_quint8` 在 CPU 上重试。未开启跨源隔离时，ONNX 自动使用单线程 WASM。
- 成功抠图后在本机 `localStorage` 记录使用的 GPU / CPU 方式；兼容模式成功后，后续直接使用 CPU，刷新或重启后仍保留。取消或失败不记录，升级抠图库版本后重新选择。
- 每次只处理一张图片，支持取消；结束后销毁 Worker 释放模型与显存。结果保持原图尺寸，以透明 PNG 保存到现有浏览器本地图片存储，并新增画布节点。
- 此功能按主体分割背景，不是对白色像素做颜色替换。

库与资源版本固定为 1.7.0，ONNX Runtime 固定为 1.21.0。升级时需同时更新依赖和 `background-removal-types.ts` 的版本，并重新准备资源。分发保留生成目录内的 AGPL 许可证与第三方声明。
