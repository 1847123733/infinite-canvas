<p align="center">
  <img src="web/public/logo.svg" width="96" alt="infinite-canvas logo">
</p>

<h1 align="center">无限画布 (infinite-canvas)</h1>

无限画布是一款面向图片创作的开源工作台。它把画布编排、AI 图片生成、参考图编辑、对话助手和素材沉淀放在同一个界面里，适合用来探索视觉方案并连续迭代图片结果。

## 核心功能

- 无限画布：多画布项目、节点拖拽缩放、连线、小地图、撤销重做、导入导出。
- AI 创作：支持 OpenAI 兼容接口的文生图、图生图、参考图编辑、文本问答和视频生成；Seedance 2.0 可通过火山方舟 Agent Plan 接入。
- 画布助手：围绕选中节点和上游节点对话、生图，并把结果插回画布。
- 素材沉淀：在本地管理图片、文本和生成记录，并可插回画布继续创作。

## 技术栈

- 前端：Next.js、React、TypeScript、Tailwind CSS、Ant Design、Zustand、TanStack Query。
- 后端：Go、Gin、GORM。
- 桌面端：Electron。

构建桌面安装包：

```bash
npm run dist
```

应用会自动拉起本地 Go API 和 Next.js，并打开桌面窗口。SQLite 数据默认保存在系统 `userData/data/infinite-canvas.db`。
