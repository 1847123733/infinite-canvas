---
title: Electron 桌面端开发计划
description: Electron、Go 和 Next.js 接入云端账号、生成票据、OSS 上传及只读控制的可开发实施方案
---

# Electron 桌面端开发计划

## 1. 目标与范围

桌面项目：

```text
D:\work\Ai\image2\image1\infinite-canvas
```

技术栈：Electron、Go + Gin + GORM、Next.js App Router + React + TypeScript、本地 SQLite 和 `localforage`。

目标：

- 使用 `vben-admin-monorepo-template` 的 PostgreSQL 用户登录。
- 每次图片生成必须取得云端一次性票据。
- Go 在本机调用模型并上传最终图片到 OSS。
- 云端能按账号查看最终图片和任务日志。
- 账号禁用、会话失效或云端不可用时进入只读模式。
- 只读时仍能查看本地图片、素材和无限画布数据。

本地 SQLite 不再作为用户、权限、模型配置和算力点的权威来源。

## 2. 三层职责

Electron：

- 启动和管理 Go、Next.js。
- 保存稳定的安装设备 ID。
- 使用 Electron `safeStorage` 加密持久化 Refresh Token。
- 暴露最小会话 IPC。

Next.js：

- 登录、退出、恢复会话和在线校验。
- 在内存保存 Access Token。
- 展示云端图片模型。
- 生成前申请一次性票据。
- 控制在线、只读和退出状态。
- 继续维护本地画布、图片和历史记录。

Go：

- 使用票据向云端交换任务快照。
- 调用模型供应商。
- 解析最终图片。
- 使用 STS 临时凭证上传 OSS。
- 上报事件、成功或失败。
- 返回图片给 Next.js 做本地保存。

## 3. 运行模式

```ts
type DesktopRuntimeMode =
  | 'initializing'
  | 'online'
  | 'readonly'
  | 'logged_out';

type ReadonlyReason =
  | 'cloud_unreachable'
  | 'account_disabled'
  | 'permission_revoked'
  | 'session_revoked'
  | 'token_expired';
```

模式含义：

- `initializing`：正在恢复和校验会话。
- `online`：账号、会话、权限和云端正常，可以生成。
- `readonly`：本地数据可查看，不允许任何新 AI 请求。
- `logged_out`：没有有效会话，显示登录页。

只读模式允许：

- 打开、平移、缩放和查看无限画布。
- 查看本地生成图片、历史和“我的素材”。
- 导出已有图片或画布。

只读模式禁止：

- 图片工作台生成。
- 画布生成、重绘、扩图等 AI 操作。
- 获取生成票据。
- 调用旧 Go 接口绕过票据。
- 配置本地图片模型 API Key。

前端按钮禁用只负责交互，Go 必须再次强制校验票据。

## 4. 桌面会话

### 4.1 Token 保存

- Access Token 只保存在 Next.js 运行时内存，不使用 `localStorage`。
- Refresh Token 通过 preload IPC 交给 Electron 主进程。
- 主进程使用 `safeStorage.encryptString` 加密后写入 `electron-store`。
- Session ID 可与加密后的 Refresh Token 一起保存。
- 当前用户信息可做非敏感缓存，但启动时必须重新校验。
- 当前平台不支持 `safeStorage` 时不明文保存 Refresh Token，要求重新登录。

### 4.2 设备 ID

首次启动生成随机 UUID 并持久化：

```text
desktop-installation-id
```

规则：

- 同一次安装保持稳定。
- 不使用 MAC 地址、硬盘序列号等硬件隐私信息。
- 登录、刷新和 Go 票据交换使用同一个 ID。

### 4.3 启动恢复

1. Electron 启动 Go 和 Next.js。
2. Next.js 通过 IPC 读取 `sessionId + refreshToken`。
3. 无会话时进入 `logged_out`。
4. 有会话时调用云端刷新接口。
5. 刷新成功后保存轮换后的 Refresh Token。
6. 调用 `/auth/me` 获取用户和生成权限。
7. 成功进入 `online`。
8. 网络错误进入 `readonly`，不删除本地数据。
9. 账号禁用、权限撤销或会话撤销时清除会话，并进入对应只读状态。

### 4.4 持续校验

- 窗口重新获得焦点时调用 `/auth/me`。
- `online` 模式每 60 秒调用一次 `/auth/me`。
- 每次申请票据前必须依赖云端实时响应。
- 网络恢复后允许自动校验并从 `readonly` 回到 `online`。
- 账号禁用、权限撤销和会话撤销不得仅靠本地状态自动恢复。

## 5. Electron 文件级清单

建议新增：

```text
desktop/src/main/cloud-session-store.ts
desktop/src/main/device-id.ts
```

建议修改：

```text
desktop/src/main/index.ts
desktop/src/preload/index.ts
```

### 5.1 会话存储

`cloud-session-store.ts` 只提供：

```ts
getCloudSession()
setCloudSession(session)
clearCloudSession()
```

持久化结构：

```ts
interface StoredCloudSession {
  sessionId: string;
  encryptedRefreshToken: string;
}
```

不向渲染进程暴露任意 `electron-store` 读写能力。

### 5.2 Preload IPC

```ts
window.desktopAuth.getSession()
window.desktopAuth.saveSession(input)
window.desktopAuth.clearSession()
window.desktopApp.getDeviceId()
window.desktopApp.getVersion()
```

主进程校验所有 IPC 参数类型和长度。

### 5.3 云端地址

新增统一环境变量：

```text
INFINITE_CANVAS_CLOUD_BASE_URL
```

Electron 启动 Go 和 Next.js 时同时传入。生产环境只允许 `https://`，开发环境可允许本机 HTTP。

## 6. Next.js 状态与 API

### 6.1 全局 Store

建议新增：

```text
web/src/stores/cloud-auth-store.ts
web/src/stores/desktop-runtime-store.ts
```

`cloud-auth-store`：

- Access Token。
- 当前云端用户。
- Session ID。
- 登录、刷新、退出、恢复动作。
- Access Token 不启用 Zustand persist。

`desktop-runtime-store`：

- `mode`。
- `readonlyReason`。
- `lastOnlineAt`。
- 在线、只读和退出状态动作。

### 6.2 云端 API

建议新增：

```text
web/src/services/api/cloud-auth.ts
web/src/services/api/cloud-generation.ts
web/src/services/api/cloud-model.ts
```

接口：

```text
cloud-auth.ts
  login
  refresh
  getCurrentUser
  logout

cloud-model.ts
  listImageModels

cloud-generation.ts
  createGenerationTicket
```

把云端错误映射为只读原因：

```text
DESKTOP_ACCOUNT_DISABLED   -> account_disabled
DESKTOP_PERMISSION_DENIED  -> permission_revoked
DESKTOP_SESSION_INVALID    -> session_revoked
DESKTOP_TOKEN_INVALID      -> token_expired
网络错误                    -> cloud_unreachable
```

### 6.3 初始化入口

修改现有 `ClientRootInit`：

1. 保留本地画布、素材和设置初始化。
2. 增加云端会话恢复。
3. 恢复期间使用 `initializing`。
4. 云端失败时不清空 `localforage`。
5. 初始化结束后展示登录、正常应用或只读提示。

### 6.4 登录页

登录只提交：

- 用户名和密码。
- Electron 提供的设备 ID。
- 设备名和客户端版本。

成功后：

- Access Token 写入内存。
- Refresh Token 通过 IPC 加密保存。
- 拉取云端模型列表。
- 进入 `online`。

不再使用本地 SQLite 用户表完成登录。

## 7. 前端生成链路

### 7.1 单个生成槽位

当前图片工作台已把多图拆成独立槽位，继续沿用。每个槽位：

1. 检查模式必须为 `online`。
2. 取得用户输入的 `userPrompt`。
3. 复用现有拼接逻辑得到 `finalPrompt`。
4. 调云端创建票据。
5. 把票据和参考图发送给本地 Go 新接口。
6. Go 完成生成、上传和云端登记。
7. Next.js 取得最终图片。
8. 沿用现有逻辑写入 `localforage`、历史和画布节点。

生成 N 张图片时，每个槽位独立申请票据。一个失败不取消其他槽位。

### 7.2 Prompt 规则

`userPrompt`：

- 用户输入框原文。
- 不含系统提示词。
- 不含程序加入的画布上下文。

`finalPrompt`：

- 实际发送模型的完整内容。
- 包含现有系统提示词。
- 包含参考图文字说明。
- 包含画布节点上下文。

创建票据时同时提交两者。Go 使用云端票据快照中的 `finalPrompt`，不接受渲染进程二次覆盖。

### 7.3 图片工作台

重点修改：

```text
web/src/app/(user)/image/page.tsx
web/src/services/api/image.ts
```

要求：

- 保留现有并行槽位、进度和本地历史 UI。
- 删除该链路本地积分检查和扣减。
- 模型选项来自云端 `/models`。
- 不再从本地 settings 选择图片 API Key 或渠道。
- 生成统一调用新的 Go 编排接口。
- `readonly` 时禁用生成并显示原因。

### 7.4 无限画布

重点检查：

```text
web/src/app/(user)/canvas/
web/src/app/(user)/canvas/canvas-node-generation.ts
```

要求：

- 保留现有画布节点和 `localforage` 存储。
- 节点生成前申请票据。
- 用户输入作为 `userPrompt`。
- 当前上下文组装结果作为 `finalPrompt`。
- 参考图发送本地 Go，不写入云端任务表。
- 成功后继续创建本地图片节点。
- 只读模式不阻止查看、移动、缩放和导出。

### 7.5 模型设置 UI

- 隐藏或移除图片生成相关的自定义渠道设置。
- 图片模型只展示云端允许的选项。
- 不在浏览器本地保存云端模型 API Key。
- 其他功能仍使用的本地设置不顺手删除。

## 8. Next.js 到 Go 的接口

新增：

```http
POST /api/v1/desktop/images/generations
Content-Type: multipart/form-data
```

字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `ticket_id` | string | 是 | 云端票据 ID |
| `ticket_token` | string | 是 | 一次性密钥 |
| `device_id` | string | 是 | Electron 安装 ID |
| `reference_images` | file[] | 否 | 参考图片 |

尺寸、质量和最终 Prompt 以云端票据快照为准，不信任渲染进程重复提交。

成功响应：

```json
{
  "code": 0,
  "data": {
    "taskId": "uuid",
    "image": {
      "mimeType": "image/png",
      "base64": "...",
      "ossObjectKey": "daily_orange_ai/infinite_canvas/1/20260612/random.png"
    }
  },
  "msg": "生成成功"
}
```

第一阶段返回 Base64 以兼容现有本地保存流程，暂不扩展本地临时文件 URL。

Go 不得保留无需票据即可调用同一图片模型的旁路。

## 9. Go 模块设计

建议新增：

```text
handler/desktop_generation.go
service/cloud_client.go
service/desktop_generation.go
service/image_provider.go
service/oss_uploader.go
model/desktop_generation.go
```

建议修改：

```text
router/router.go
handler/ai.go
service/settings.go
```

实际路径按项目现有目录调整，继续遵循 `handler/service/repository/model` 分层。

### 9.1 Handler

`handler/desktop_generation.go` 只负责：

- 解析 multipart 参数。
- 校验文件大小和 MIME。
- 调用 `DesktopGenerationService.Generate`。
- 返回 `OK/Fail`。

不在 handler 请求云端、调用模型或上传 OSS。

### 9.2 云端客户端

`service/cloud_client.go` 负责：

- 票据交换。
- 任务事件上报。
- 成功回调。
- 失败回调。
- HTTP 超时、有限重试和错误解析。
- 在内存中持有交换响应的 `taskReportToken`，只用于当前任务的事件和结果接口。

建议超时：

```text
票据交换：10 秒
事件上报：5 秒
完成/失败回调：10 秒
```

事件和完成回调只对网络错误、429 和服务端 5xx 有限重试。

票据交换不自动重试。交换结果不明确时，本次槽位失败，由用户重新发起并创建新任务；云端定时把旧票据和悬空任务收口，避免一次性票据被重复使用。

### 9.3 生成编排

`service/desktop_generation.go`：

```text
校验本地请求
  -> 云端交换票据
  -> 取得任务、模型和 OSS 快照
  -> 上报 provider_request_started
  -> 调用模型
  -> 解析一张最终图片
  -> 上报 provider_request_finished
  -> 上报 oss_upload_started
  -> 上传指定 Object Key
  -> 上报 oss_upload_finished
  -> 调用 complete
  -> 返回图片给 Next.js
```

任一步失败：

1. 映射标准错误码。
2. 脱敏错误。
3. 尽力调用云端 `fail`。
4. 返回本地统一错误响应。

### 9.4 模型调用

`service/image_provider.go` 从现有 `handler/ai.go` 提取能力，但不能继续只做透明代理。

需要支持：

- 文生图 JSON 请求。
- 参考图 multipart 请求。
- OpenAI 兼容 `b64_json` 响应。
- OpenAI 兼容 URL 响应，Go 下载为字节。
- MIME 识别。
- 单任务只取一张最终图片。

禁止保存完整请求头、API Key、图片 Base64 日志和完整上游响应。

### 9.5 OSS 上传

`service/oss_uploader.go` 使用成熟阿里云 OSS Go SDK，不手写签名。

输入：

- STS AccessKey ID、Secret 和 Security Token。
- Endpoint、Bucket。
- Python 指定的 Object Key。
- 图片字节和 MIME。

对象路径规则：

- Go 不参与 `targetPath` 或目录规则拼接。
- Python 会先复用管理端现有 `oss_config.targetPath` 作为根前缀，再生成完整 `objectKey`。
- 固定子路径始终为：

```text
infinite_canvas/{user_id}/{yyyy}{mm}{dd}/{random}.{ext}
```

- 当管理端当前配置 `targetPath = daily_orange_ai/` 时，Go 实际收到的 `objectKey` 为：

```text
daily_orange_ai/infinite_canvas/{user_id}/{yyyy}{mm}{dd}/{random}.{ext}
```

要求：

- 调用方不能修改 Object Key。
- 设置正确 `Content-Type`。
- 返回文件大小、宽高等元数据。
- STS 只在调用生命周期内存在。
- 不写 SQLite、配置文件或日志。

### 9.6 SQLite 调整

保留：

- 其他桌面功能仍使用的本地数据。
- 现有画布、图片和补偿任务需要的数据。

停止作为权威来源：

- 本地用户和登录态。
- 图片模型渠道和 API Key。
- OSS 配置。
- 算力点。

项目尚未上线，不做旧数据迁移或兼容分支。新链路稳定后直接移除旧图片链路中的账号、积分和渠道依赖，但不删除其他功能仍使用的表。

## 10. 错误处理

Go 返回稳定错误码：

| 错误码 | 前端行为 |
| --- | --- |
| `CLOUD_UNREACHABLE` | 进入只读模式 |
| `ACCOUNT_DISABLED` | 清会话，显示账号禁用 |
| `PERMISSION_REVOKED` | 清会话，显示权限撤销 |
| `SESSION_REVOKED` | 清会话，显示会话失效 |
| `TICKET_EXPIRED` | 当前槽位提示重试 |
| `TICKET_CONSUMED` | 当前槽位失败，不重复生成 |
| `MODEL_REQUEST_FAILED` | 显示模型请求失败 |
| `OSS_UPLOAD_FAILED` | 显示云端保存失败 |
| `CLOUD_REPORT_FAILED` | 图片已生成但云端登记失败 |

模型生成成功但云端登记失败时，不能显示为完整成功。图片可暂时展示，但本地历史需标记“云端未登记”。

## 11. 幂等与恢复

### 11.1 事件

每次事件、成功和失败回调生成 `eventId`，重试复用原 ID。

### 11.2 上传

Object Key 由 Python 固定分配。同一任务重试只能覆盖同一 Key，不能生成第二个路径。

### 11.3 完成回调补偿

OSS 上传成功后：

- `complete` 网络失败最多重试 3 次。
- 使用相同 `eventId` 和结果元数据。
- 应用退出前仍失败，可将不含密钥的补偿记录写入 SQLite。
- 下次在线启动只重试完成回调，不重新生成、不重新上传。

允许持久化：

```text
task_id
event_id
bucket
object_key
mime_type
size
width
height
created_at
retry_count
```

禁止持久化模型 API Key、STS 凭证和 Ticket Token。

## 12. 实施顺序

### 阶段 A：Electron 会话

1. 增加设备 ID。
2. 增加 `safeStorage` 会话 IPC。
3. 增加云端地址配置。
4. 增加认证 Store 和 API。
5. 接入登录、刷新、退出和 `/auth/me`。

完成标准：重启后可恢复会话，新设备登录后旧设备失效。

### 阶段 B：只读控制

1. 增加 runtime store。
2. 修改 `ClientRootInit`。
3. 增加定时和窗口聚焦校验。
4. 禁用工作台和画布全部 AI 入口。
5. 验证本地画布、图片和素材仍能打开。

完成标准：断网或禁用账号后没有新的 Go 模型请求，但历史数据可查看。

### 阶段 C：Go 云端编排

1. 新增票据交换客户端。
2. 从透明代理提取模型请求和响应解析。
3. 接入 OSS SDK 和 STS 上传。
4. 接入事件、成功和失败回调。
5. 新增带票据的本地生成接口。

完成标准：Go 不读取本地模型或 OSS 配置，只凭票据完成一张图片生成和上传。

### 阶段 D：图片工作台

1. 模型列表改用云端数据。
2. 每个生成槽位申请票据。
3. 调用新 Go 接口。
4. 保留现有本地历史保存。
5. 删除该链路积分扣减。

完成标准：并行生成 N 张时，云端出现 N 条独立任务。

### 阶段 E：无限画布

1. 接入 `userPrompt/finalPrompt`。
2. 接入参考图 multipart。
3. 结果继续创建本地图片节点。
4. 覆盖只读模式下全部画布 AI 操作。

完成标准：云端看到最终图片和两份 Prompt，本地继续保存完整画布。

### 阶段 F：旧链路收口

1. 关闭无需票据的旧图片生成接口。
2. 移除图片生成对本地用户、积分和模型渠道的依赖。
3. 保留其他功能仍需要的本地设置。
4. 更新数据库、待办和待测试文档。

## 13. 联调清单

1. 正常登录并生成单张图片。
2. 一次生成四张，对应四条云端任务。
3. 无限画布使用两张参考图生成。
4. 用户 A 只写入用户 A 的 OSS 目录。
5. 日期目录使用 `yyyyMMdd`，例如 `20260612`。
6. 运行中禁用账号，下一次校验后立即只读。
7. 后台强制下线后不能再申请票据。
8. 云端断网时已有画布和图片可查看，新生成被阻止。
9. 模型失败时云端任务为 `failed`，日志已脱敏。
10. OSS 上传失败时本地不显示完整成功。
11. OSS 成功、完成回调超时时可幂等补偿。
12. 同一票据重复请求不能生成第二张图片。
13. SQLite、日志、`localStorage` 和 `localforage` 中不存在任何云端密钥。
14. 票据交换超时后不会自动重复交换，云端能自动收口旧任务。

## 14. 完成定义

- 登录只认云端 PostgreSQL 用户。
- 本地 SQLite 不再决定账号状态和生成权限。
- 每次图片生成都关联云端任务和一次性票据。
- Go 执行模型调用并上传最终图片。
- OSS 路径固定为：

```text
daily_orange_ai/infinite_canvas/{user_id}/{yyyy}{mm}{dd}/{random}.{ext}
```

- 云端不可用、账号禁用、权限撤销或会话失效时不能继续生成。
- 只读时仍能查看本地图片、素材和无限画布。
- 云端可查看对应账号的最终图片、两份 Prompt 和任务日志。
- 本地不存在无需票据的图片生成旁路。
- 不引入算力点。
