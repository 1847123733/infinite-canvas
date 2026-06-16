# 前端锁定云端渠道设计

## 目标

将当前产品前端改为只暴露云端渠道流程，不再向用户展示本地直连入口，也不再允许前端运行时切回本地直连。

本次只做保守收口：

- 前端设置弹窗中隐藏“本地直连 / 云端渠道”切换。
- 前端配置与运行时统一强制使用 `remote`。
- 保留现有本地直连字段、类型和请求实现代码，先不删除，后续如需恢复可继续启用。

## 用户流程

用户进入桌面端后，只保留以下流程：

1. 登录账号密码。
2. 使用云端渠道模型。
3. 需要时点击“同步云端控制 LLM 配置”刷新本地缓存的公开模型配置。

设置弹窗中不再出现：

- 本地直连切换
- `Base URL`
- `API Key`
- 本地拉取模型列表
- 本地模型可选项
- 本地系统提示词

## 实现范围

### 1. 设置弹窗

文件：`web/src/components/layout/app-config-modal.tsx`

调整：

- 将 `effectiveMode` 固定为 `remote`。
- 将原先依赖 `allowCustomChannel` 和 `config.channelMode` 的本地分支保留但不再进入。
- 完成按钮保存时，不再校验本地 `Base URL` / `API Key`。
- 保留“云端渠道”说明和“同步云端控制 LLM 配置”按钮。

### 2. 配置 store 运行时行为

文件：`web/src/stores/use-config-store.ts`

调整：

- `resolveEffectiveConfig` 改为前端统一返回 `remote` 模式。
- 持久化配置合并时，将 `channelMode` 归一为 `remote`，避免历史本地用户继续带出本地模式。
- 其他本地直连字段继续保留，不删除。

## 明确不做

- 不删除本地直连底层请求实现。
- 不修改后台管理页中的 `allowCustomChannel` 等配置项。
- 不删除 `AiConfig` 里的 `baseUrl`、`apiKey`、`channelMode` 字段。
- 不修改管理员维护云端模型渠道的能力。

## 风险与回退

风险较低，主要影响是历史本地直连用户进入新版后会被前端统一切回云端模式。

如需回退，只需要恢复：

- 设置弹窗中的本地模式 UI 分支
- `use-config-store` 中对 `channelMode` 的前端强制逻辑

底层本地直连代码本次不删，因此回退成本较低。
