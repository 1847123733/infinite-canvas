---
title: 桌面版云端控制开发计划
description: vben-admin 云端账号、生成票据、模型配置、OSS、图片记录与日志的可开发实施方案
---

# 桌面版云端控制开发计划

## 1. 目标与范围

云端项目：

```text
D:\work\Ai\vben-admin-monorepo-template
```

技术栈：Vue 3 + Vben Admin、Python + FastAPI + SQLAlchemy、PostgreSQL、阿里云 OSS。

本阶段实现：

- 云端 PostgreSQL 账号登录和单点会话。
- 账号禁用、角色权限收回和强制下线。
- 图片模型列表和一次性生成票据。
- 向本地 Go 下发单次任务所需配置。
- 最终图片 OSS 登记、Prompt 和日志查询。
- Vue 管理后台查看账号对应的图片、任务和在线设备。

本阶段不实现算力点，不同步完整无限画布数据，不在云端执行图片生成。

## 2. 权威数据边界

云端是以下数据的唯一权威来源：

- 用户、密码、角色和账号状态。
- 桌面登录权限、会话和设备状态。
- 图片模型及调用配置。
- OSS 配置。
- 生成任务、一次性票据、最终图片和运行日志。

桌面端本地数据库不得决定用户是否可以登录或生成。

## 3. 安全硬约束

1. 每次生成前必须申请一次性票据，默认 120 秒过期。
2. 票据只能消费一次，消费时再次检查账号、权限、会话和模型状态。
3. 账号禁用、会话撤销或角色权限收回后不得签发或消费票据。
4. 票据原文和 Refresh Token 原文不入库，只保存哈希值。
5. 模型 API Key 只下发给本地 Go，在内存中使用，不能写日志或落盘。
6. OSS 永久 AccessKey Secret 不下发桌面端。Python 使用云端 OSS 配置签发限定 Object Key 的 STS 临时凭证。
7. Next.js 和 Vue 只能取得脱敏模型信息，不能取得模型密钥或 OSS 凭证。
8. 全部外部接口使用 HTTPS。
9. 云端同时保存 `user_prompt` 和 `final_prompt`。

> 因为模型请求仍由本地 Go 执行，模型 API Key 会短暂进入用户机器内存，无法做到绝对不可提取。若后续要求完全隐藏模型密钥，需要改成云端代理模型请求。

## 4. PostgreSQL 表结构

### 4.1 `desktop_sessions`

记录一个账号在一台桌面设备上的登录会话。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | UUID | 主键 | 会话 ID |
| `user_id` | INTEGER | 非空、索引 | `system_users.id` |
| `device_id` | VARCHAR(64) | 非空、索引 | Electron 安装 ID |
| `device_name` | VARCHAR(128) | 可空 | 设备名称 |
| `client_version` | VARCHAR(32) | 可空 | 桌面版版本 |
| `refresh_token_hash` | VARCHAR(128) | 非空、唯一 | Refresh Token 哈希 |
| `status` | VARCHAR(16) | 非空、索引 | `active/revoked/expired` |
| `last_seen_at` | TIMESTAMPTZ | 可空 | 最近鉴权时间 |
| `expires_at` | TIMESTAMPTZ | 非空、索引 | 会话过期时间 |
| `revoked_at` | TIMESTAMPTZ | 可空 | 撤销时间 |
| `created_at` | TIMESTAMPTZ | 非空 | 创建时间 |
| `updated_at` | TIMESTAMPTZ | 非空 | 更新时间 |

约束：

- `UNIQUE(refresh_token_hash)`。
- `INDEX(user_id, status)`。
- `INDEX(device_id, status)`。
- 单点登录按“一个账号只保留一个 active 会话”实现。创建新会话时，在同一事务内撤销该账号其他 active 会话。

### 4.2 `desktop_generation_tasks`

当前桌面 UI 的每个生成槽位对应一条任务，一条任务登记一张最终图片。

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | UUID | 主键 | 任务 ID |
| `user_id` | INTEGER | 非空、索引 | 所属用户 |
| `session_id` | UUID | 非空、索引 | 发起会话 |
| `scene` | VARCHAR(32) | 非空、索引 | `image_workbench/canvas` |
| `model_id` | VARCHAR(64) | 非空 | 云端模型 ID |
| `model_name` | VARCHAR(128) | 非空 | 模型名称快照 |
| `user_prompt` | TEXT | 非空 | 用户原始输入 |
| `final_prompt` | TEXT | 非空 | 实际发送模型的 Prompt |
| `status` | VARCHAR(16) | 非空、索引 | 任务状态 |
| `request_meta` | JSONB | 非空、默认 `{}` | 尺寸、质量、参考图数量等 |
| `result_bucket` | VARCHAR(128) | 可空 | OSS Bucket |
| `result_object_key` | VARCHAR(512) | 可空、唯一 | OSS Object Key |
| `result_url` | TEXT | 可空 | 展示地址 |
| `result_mime_type` | VARCHAR(64) | 可空 | MIME |
| `result_size` | BIGINT | 可空 | 字节数 |
| `result_width` | INTEGER | 可空 | 宽度 |
| `result_height` | INTEGER | 可空 | 高度 |
| `error_code` | VARCHAR(64) | 可空 | 标准错误码 |
| `error_message` | TEXT | 可空 | 脱敏错误 |
| `started_at` | TIMESTAMPTZ | 可空 | 开始时间 |
| `finished_at` | TIMESTAMPTZ | 可空 | 结束时间 |
| `created_at` | TIMESTAMPTZ | 非空、索引 | 创建时间 |
| `updated_at` | TIMESTAMPTZ | 非空 | 更新时间 |

状态机：

```text
pending -> running -> uploading -> succeeded
                    \-> failed
pending/running/uploading -> revoked
```

规则：

- `succeeded` 必须存在 Bucket 和 Object Key。
- `failed` 必须存在 `error_code`。
- `succeeded/failed/revoked` 为终态，普通事件不能覆盖终态。

### 4.3 `desktop_generation_tickets`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | UUID | 主键 | 票据 ID |
| `task_id` | UUID | 非空、唯一 | 对应任务 |
| `user_id` | INTEGER | 非空、索引 | 所属用户 |
| `session_id` | UUID | 非空、索引 | 所属会话 |
| `secret_hash` | VARCHAR(128) | 非空、唯一 | 票据密钥哈希 |
| `status` | VARCHAR(16) | 非空、索引 | `issued/consumed/expired/revoked` |
| `expires_at` | TIMESTAMPTZ | 非空、索引 | 失效时间 |
| `consumed_at` | TIMESTAMPTZ | 可空 | 消费时间 |
| `created_at` | TIMESTAMPTZ | 非空 | 创建时间 |

消费使用 `SELECT ... FOR UPDATE` 或原子条件更新。只有 `issued` 且未过期的票据可消费，并发消费只能有一个请求成功。

增加定时清理任务：

- 未消费且过期的票据更新为 `expired`。
- 对应仍为 `pending` 的任务更新为 `failed`，错误码为 `TICKET_EXPIRED`。
- 超过配置时长仍停留在 `running/uploading` 的任务更新为 `failed`，错误码为 `TASK_TIMEOUT`。

### 4.4 `desktop_generation_logs`

| 字段 | 类型 | 约束 | 说明 |
| --- | --- | --- | --- |
| `id` | BIGSERIAL | 主键 | 日志 ID |
| `event_id` | UUID | 非空、唯一 | 客户端幂等 ID |
| `task_id` | UUID | 非空、索引 | 任务 ID |
| `user_id` | INTEGER | 非空、索引 | 用户 ID |
| `level` | VARCHAR(16) | 非空 | `info/warning/error` |
| `event_type` | VARCHAR(32) | 非空、索引 | 事件类型 |
| `message` | TEXT | 可空 | 脱敏描述 |
| `payload` | JSONB | 非空、默认 `{}` | 耗时、状态码等 |
| `created_at` | TIMESTAMPTZ | 非空、索引 | 入库时间 |

事件类型：

```text
generation_started
provider_request_started
provider_request_finished
oss_upload_started
oss_upload_finished
generation_succeeded
generation_failed
```

日志不得保存请求头、模型 API Key、OSS 凭证、图片 Base64 或完整上游响应。

### 4.5 复用现有表

- 用户：`system_users`。
- 桌面登录权限：`system_roles.can_login_infinite_canvas`。
- 模型：`llm_models`。
- OSS 配置：`system_settings.oss_config`。

需要补齐：

- `llm_models` 的稳定 ID、图片模型类型、启用状态、模型名、Base URL 和 API Key。
- `oss_config` 根级字段继续复用现有 `accessKeyId/accessKeySecret/endpoint/bucketName/targetPath/acl`，并在 `infiniteCanvasDesktop` 下增加 `ramRoleArn`、`stsDurationSeconds`、`bucketNameOverride`。
- `system_users.status != 1` 时，全部桌面接口立即拒绝。

桌面版 OSS 规则：

- 不新增 `enabled` 开关。
- 不新增 `region` 字段，服务端从 `endpoint` 推导。
- 桌面版固定复用根级 `targetPath` 作为目录前缀。
- `bucketNameOverride` 留空时回退根级 `bucketName`。

可参考的 `oss_config` 结构：

```json
{
  "accessKeyId": "",
  "accessKeySecret": "",
  "endpoint": "http://oss-cn-beijing.aliyuncs.com",
  "bucketName": "decent-lancheng",
  "targetPath": "daily_orange_ai/",
  "acl": "public-read",
  "infiniteCanvasDesktop": {
    "ramRoleArn": "",
    "stsDurationSeconds": 900,
    "bucketNameOverride": ""
  }
}
```

## 5. API 约定

统一前缀：

```text
/api/infinite-canvas
```

保持现有 FastAPI 响应结构：

```json
{
  "code": 0,
  "data": {},
  "message": "ok"
}
```

Access Token 建议 15 分钟，Refresh Token 建议 30 天。

标准错误：

| HTTP | `code` | 场景 |
| --- | --- | --- |
| 400 | `DESKTOP_BAD_REQUEST` | 参数错误 |
| 401 | `DESKTOP_TOKEN_INVALID` | Access Token 无效 |
| 401 | `DESKTOP_SESSION_INVALID` | 会话撤销或过期 |
| 403 | `DESKTOP_ACCOUNT_DISABLED` | 账号禁用 |
| 403 | `DESKTOP_PERMISSION_DENIED` | 无桌面权限 |
| 403 | `DESKTOP_GENERATION_FORBIDDEN` | 当前不可生成 |
| 404 | `DESKTOP_MODEL_NOT_FOUND` | 模型不可用 |
| 409 | `DESKTOP_TICKET_CONSUMED` | 票据已消费 |
| 410 | `DESKTOP_TICKET_EXPIRED` | 票据已过期 |
| 500 | `DESKTOP_CONFIG_INVALID` | 模型或 OSS 配置错误 |

## 6. 桌面认证接口

### 6.1 登录

```http
POST /api/infinite-canvas/auth/login
```

请求：

```json
{
  "username": "admin",
  "password": "******",
  "deviceId": "installation-uuid",
  "deviceName": "DESKTOP-001",
  "clientVersion": "0.1.0"
}
```

响应：

```json
{
  "code": 0,
  "data": {
    "accessToken": "jwt",
    "accessTokenExpiresIn": 900,
    "refreshToken": "opaque-random-token",
    "refreshTokenExpiresIn": 2592000,
    "sessionId": "uuid",
    "user": {
      "id": 1,
      "username": "admin",
      "displayName": "管理员"
    }
  },
  "message": "登录成功"
}
```

处理顺序：

1. 校验用户名和密码。
2. 校验用户 `status == 1`。
3. 校验角色 `can_login_infinite_canvas`。
4. 在事务中撤销该账号其他 active 会话和未消费票据。
5. 创建新会话。
6. 签发包含 `user_id/session_id/token_type=desktop_access` 的 JWT。

### 6.2 刷新

```http
POST /api/infinite-canvas/auth/refresh
```

```json
{
  "sessionId": "uuid",
  "refreshToken": "opaque-random-token"
}
```

每次刷新重新校验账号和权限，并采用 Refresh Token Rotation：旧 Token 失效，返回新 Token。

### 6.3 当前用户

```http
GET /api/infinite-canvas/auth/me
```

```json
{
  "code": 0,
  "data": {
    "user": {
      "id": 1,
      "username": "admin",
      "displayName": "管理员"
    },
    "sessionId": "uuid",
    "canGenerate": true
  },
  "message": "ok"
}
```

桌面端定时调用。账号禁用或会话撤销后，下次校验立即进入只读模式。

### 6.4 退出

```http
POST /api/infinite-canvas/auth/logout
```

撤销当前会话及该会话全部 `issued` 票据。

## 7. 模型接口

```http
GET /api/infinite-canvas/models
```

只返回 UI 字段：

```json
{
  "code": 0,
  "data": [
    {
      "id": "model-id",
      "name": "图片模型",
      "modelName": "provider-model-name",
      "supportsReferenceImage": true,
      "enabled": true
    }
  ],
  "message": "ok"
}
```

不得返回 API Key、OSS 配置或供应商私密参数。

## 8. 生成票据接口

### 8.1 创建任务并签发票据

```http
POST /api/infinite-canvas/generation-tickets
```

请求：

```json
{
  "modelId": "model-id",
  "scene": "canvas",
  "userPrompt": "用户原始输入",
  "finalPrompt": "加入系统提示词和画布上下文后的最终内容",
  "requestMeta": {
    "size": "1024x1024",
    "quality": "standard",
    "referenceImageCount": 2
  }
}
```

响应：

```json
{
  "code": 0,
  "data": {
    "taskId": "uuid",
    "ticketId": "uuid",
    "ticketToken": "one-time-secret",
    "expiresAt": "ISO-8601"
  },
  "message": "票据创建成功"
}
```

服务流程：

1. 校验 Access Token、会话、账号和角色。
2. 校验场景只允许 `image_workbench/canvas`。
3. 校验模型存在、启用且属于图片模型。
4. 校验 Prompt 和请求参数长度。
5. 创建 `pending` 任务。
6. 创建 `issued` 票据，只保存票据哈希。

前端生成 N 张图片时创建 N 个任务和 N 张票据。

### 8.2 Go 交换配置

```http
POST /api/infinite-canvas/generation-tickets/exchange
X-Generation-Ticket: <ticketToken>
```

请求：

```json
{
  "ticketId": "uuid",
  "deviceId": "installation-uuid"
}
```

响应：

```json
{
  "code": 0,
  "data": {
    "task": {
      "id": "uuid",
      "scene": "canvas",
      "userPrompt": "原始提示词",
      "finalPrompt": "最终提示词",
      "requestMeta": {
        "size": "1024x1024",
        "quality": "standard"
      }
    },
    "model": {
      "baseUrl": "https://provider.example/v1",
      "apiKey": "secret",
      "modelName": "provider-model-name",
      "requestMode": "image"
    },
    "oss": {
      "endpoint": "https://oss-cn-beijing.aliyuncs.com",
      "bucket": "decent-lancheng",
      "accessKeyId": "sts-access-key-id",
      "accessKeySecret": "sts-access-key-secret",
      "securityToken": "sts-token",
      "expiresAt": "ISO-8601",
      "objectKey": "daily_orange_ai/infinite_canvas/1/20260612/random.png"
    },
    "taskReportToken": "task-scoped-token"
  },
  "message": "票据消费成功"
}
```

Object Key 由 Python 生成，格式固定：

```text
{targetPath}infinite_canvas/{user_id}/{yyyy}{mm}{dd}/{random}.{ext}
```

云端流程：

1. 读取 `system_settings.oss_config`。
2. 规范化根级 `targetPath` 为“无前导 `/`、有尾随 `/`”。
3. 取 `infiniteCanvasDesktop.bucketNameOverride`，为空时回退根级 `bucketName`。
4. 从 `endpoint` 推导地域，不再额外配置 `region`。
5. 直接生成完整 `objectKey`，不从客户端接收目录或 object key。

当当前配置为 `targetPath = daily_orange_ai/` 时，实际结果为：

```text
daily_orange_ai/infinite_canvas/{user_id}/{yyyy}{mm}{dd}/{random}.{ext}
```

STS 权限只允许当前任务指定的 Bucket 和 Object Key，有效期不超过 15 分钟。

交换成功时：

- 票据更新为 `consumed`。
- 任务更新为 `running`。
- 写入 `generation_started` 日志。

## 9. 事件与结果接口

以下接口使用 `taskReportToken`，不使用用户 Access Token。

`taskReportToken` 只允许操作当前任务，建议有效期 30 分钟。Go 只在任务内存中持有，不得持久化。

### 9.1 上报事件

```http
POST /api/infinite-canvas/generation-tasks/{task_id}/events
```

```json
{
  "eventId": "uuid",
  "eventType": "oss_upload_started",
  "level": "info",
  "message": "开始上传最终图片",
  "payload": {
    "elapsedMs": 5320
  }
}
```

按 `eventId` 幂等入库，并校验状态流转。

### 9.2 标记成功

```http
POST /api/infinite-canvas/generation-tasks/{task_id}/complete
```

```json
{
  "eventId": "uuid",
  "bucket": "decent-lancheng",
  "objectKey": "daily_orange_ai/infinite_canvas/1/20260612/random.png",
  "mimeType": "image/png",
  "size": 123456,
  "width": 1024,
  "height": 1024
}
```

服务端验证：

- Bucket 和 Object Key 与票据快照完全一致。
- OSS 对象通过 HeadObject 确认存在。
- 当前任务没有进入其他终态。

Bucket 为私有读时，列表接口实时返回短期签名 URL，不持久化永久签名地址。

### 9.3 标记失败

```http
POST /api/infinite-canvas/generation-tasks/{task_id}/fail
```

```json
{
  "eventId": "uuid",
  "errorCode": "PROVIDER_REQUEST_FAILED",
  "errorMessage": "上游模型请求失败",
  "payload": {
    "providerStatus": 429,
    "elapsedMs": 10052
  }
}
```

Go 和 Python 都要做错误脱敏。

## 10. 管理后台接口

### 10.1 任务列表

```http
GET /api/infinite-canvas/admin/generation-tasks
```

查询参数：

```text
page
pageSize
userId
username
status
scene
modelId
createdFrom
createdTo
```

列表返回任务、用户、模型、Prompt 摘要、状态、缩略图、错误摘要、创建时间和耗时。

### 10.2 任务详情与日志

```http
GET /api/infinite-canvas/admin/generation-tasks/{task_id}
GET /api/infinite-canvas/admin/generation-tasks/{task_id}/logs
```

详情返回两份 Prompt、请求元数据、结果元数据和脱敏错误。日志按时间正序返回。

### 10.3 会话管理

```http
GET  /api/infinite-canvas/admin/sessions
POST /api/infinite-canvas/admin/sessions/{session_id}/revoke
```

强制下线同时撤销该会话全部未消费票据。

## 11. Python 开发清单

建议新增：

```text
apps/ai-server/app/routes/infinite_canvas.py
apps/ai-server/app/services/desktop_auth_service.py
apps/ai-server/app/services/generation_ticket_service.py
apps/ai-server/app/services/generation_task_service.py
apps/ai-server/app/services/oss_sts_service.py
apps/ai-server/app/schemas/infinite_canvas.py
```

建议修改：

```text
apps/ai-server/app/models.py
apps/ai-server/app/main.py
apps/ai-server/app/database.py
```

职责：

- `routes/infinite_canvas.py`：HTTP 参数、鉴权依赖和 `APIResponse`。
- `desktop_auth_service.py`：登录、刷新、单点会话和权限校验。
- `generation_ticket_service.py`：任务创建、票据签发、原子消费和任务令牌。
- `generation_task_service.py`：状态机、事件幂等、结果登记和后台查询。
- `oss_sts_service.py`：读取 `oss_config` 和 `infiniteCanvasDesktop`、规范化 `targetPath`、生成完整 Object Key、签发 STS、HeadObject 和预览 URL。
- `schemas/infinite_canvas.py`：Pydantic 请求响应模型。

不要直接把 `routes/settings.py` 的设置接口开放给桌面端，也不要从一个 route 文件调用另一个 route 的私有函数。

## 12. Vue 管理端开发清单

建议新增：

```text
apps/web-antd/src/api/core/infinite-canvas.ts
apps/web-antd/src/views/ai/infinite-canvas-tasks/index.vue
apps/web-antd/src/views/ai/infinite-canvas-tasks/task-detail.vue
apps/web-antd/src/views/ai/infinite-canvas-sessions/index.vue
```

建议修改：

```text
apps/web-antd/src/router/routes/modules/images.ts
```

生成记录页：

- 按账号、状态、模型、场景和时间筛选。
- 显示缩略图、Prompt 摘要、状态和耗时。
- 详情抽屉显示原始 Prompt、最终 Prompt、图片、元数据和日志时间线。

桌面会话页：

- 显示账号、设备、客户端版本、最后在线时间和状态。
- 支持确认后强制下线。

前端不得展示 API Key、OSS 凭证、票据、Refresh Token 或其哈希。

## 13. 实施顺序

### 阶段 A：数据与认证

1. 新增四张表和状态枚举。
2. 实现登录、刷新、当前用户和退出。
3. 实现单账号单 active 会话。
4. 实现账号禁用、角色权限和后台强制下线。

完成标准：新设备登录后旧会话失效；禁用账号后刷新和票据签发都失败。

### 阶段 B：票据与配置

1. 实现桌面模型列表。
2. 实现任务创建和票据签发。
3. 实现票据原子消费。
4. 实现模型配置快照。
5. 实现 Object Key 和 STS 临时凭证。

完成标准：同一票据并发交换只有一次成功，永久 OSS Secret 不离开云端。

### 阶段 C：状态与结果

1. 实现任务级上报令牌。
2. 实现事件、成功和失败接口。
3. 实现状态机和幂等。
4. 实现 OSS 对象校验和签名预览 URL。

完成标准：Go 重试上报不会产生重复日志或覆盖终态。

### 阶段 D：管理后台

1. 实现任务列表、详情和日志查询。
2. 实现 Vue 生成记录页。
3. 实现会话管理页。

完成标准：管理员能按账号查看最终图片、两份 Prompt、日志并强制下线。

## 14. 测试清单

- 正常登录创建唯一 active 会话。
- 新设备登录撤销旧会话。
- 禁用账号后 `/auth/me`、刷新和票据签发全部失败。
- 无 `can_login_infinite_canvas` 时拒绝登录。
- 停用模型不能创建票据。
- 票据过期或已消费时不能交换。
- 并发交换只有一个成功。
- 定时任务能收口过期票据和长期悬空任务。
- 会话撤销后未消费票据全部失效。
- `events/complete/fail` 按 `eventId` 幂等。
- 非法状态流转被拒绝。
- 非指定 Object Key 不能登记成功。
- 响应和日志不出现任何密钥。
- 多图生成时每张图对应独立任务。
- OSS 上传成功但完成回调超时，重试后仍只得到一条成功记录。

## 15. 完成定义

- PostgreSQL 能查询用户、会话、任务、票据和日志的完整关系。
- 账号禁用、权限收回、会话撤销都能阻止新生成。
- 桌面端不依赖本地用户表决定生成权限。
- 永久 OSS 密钥不离开云端。
- 图片保存到：

```text
oss://decent-lancheng/daily_orange_ai/infinite_canvas/{user_id}/{yyyy}{mm}{dd}/{random}.{ext}
```

- 管理后台能查看指定账号的最终图片、原始 Prompt、最终 Prompt 和日志。
- 实现后同步更新云端项目的接口与数据库文档。
