# 桌面版云端 OSS 保守改版设计

## 目标

在不打断现有云端 OSS 其他用途的前提下，为 `infinite-canvas` 桌面版生图链路补齐一套可控、固定路径、服务端签发 STS 的 OSS 配置流程。

本次设计只做保守改版：

- 继续沿用 `system_settings.oss_config` 作为唯一 OSS 设置来源。
- 保留现有根级字段和旧用途，不拆新设置 key。
- 桌面版链路复用现有 `targetPath` 作为根前缀。
- 桌面版固定子路径为 `infinite_canvas/{user_id}/{yyyy}{mm}{dd}/{random}.{ext}`。
- Python 服务端直接生成完整 `objectKey`，前端和 Go 都不能覆盖。
- 不新增 `enabled`、`region` 这类桌面专用开关或独立地域配置。

## 已确认决策

### 1. 路径规则

管理端已存在通用 OSS 根前缀 `targetPath`，例如：

```text
daily_orange_ai/
```

桌面版无限画布最终上传路径固定为：

```text
{targetPath}infinite_canvas/{user_id}/{yyyy}{mm}{dd}/{random}.{ext}
```

按当前配置，实际 `objectKey` 为：

```text
daily_orange_ai/infinite_canvas/{user_id}/{yyyy}{mm}{dd}/{random}.{ext}
```

对应记录格式为：

```text
oss://decent-lancheng/daily_orange_ai/infinite_canvas/{user_id}/{yyyy}{mm}{dd}/{random}.{ext}
```

### 2. `oss_config` 扩展方式

继续沿用现有 `system_settings.oss_config`，仅新增最小桌面专用字段：

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

约束：

- 不新增 `enabled`，桌面版 OSS 上传默认属于新链路的一部分。
- 不新增 `region`，服务端从 `endpoint` 推导地域。
- `bucketNameOverride` 留空时回退根级 `bucketName`。
- `targetPath` 继续由管理员维护，但桌面版只复用它作为根前缀，不允许继续自定义后半段目录结构。

## 后台配置流程

### 1. 通用 OSS 配置

后台继续保留现有字段：

- `accessKeyId`
- `accessKeySecret`
- `endpoint`
- `bucketName`
- `targetPath`
- `acl`

这部分继续服务旧的 `skills`、旧工具箱上传、旧 canvas 上传等能力。

### 2. 桌面版 STS 配置

在同一页新增桌面版专用配置区，只暴露：

- `RAM Role ARN`
- `STS 有效期秒数`
- `Bucket 覆盖值（可空）`

页面新增只读预览：

```text
对象 Key 规则：
{targetPath}infinite_canvas/{user_id}/{yyyy}{mm}{dd}/{random}.{ext}

OSS 路径预览：
oss://{bucket}/{targetPath}infinite_canvas/{user_id}/{yyyy}{mm}{dd}/{random}.{ext}
```

### 3. 校验规则

服务端在桌面票据交换或 STS 签发前检查：

- `accessKeyId`
- `accessKeySecret`
- `endpoint`
- 根级或覆盖后的 `bucketName`
- `targetPath`
- `infiniteCanvasDesktop.ramRoleArn`
- `infiniteCanvasDesktop.stsDurationSeconds`

任一关键项缺失或非法时，返回 `DESKTOP_CONFIG_INVALID`。

## 服务端流程

### 1. 生成 `objectKey`

Python 在票据交换时：

1. 读取 `oss_config`。
2. 规范化 `targetPath`：
   - 去掉前导 `/`
   - 保证尾部 `/`
3. 计算最终 bucket：
   - 优先 `bucketNameOverride`
   - 否则使用根级 `bucketName`
4. 推导 `endpoint` 对应地域。
5. 直接生成完整 `objectKey`：

```text
{targetPath}infinite_canvas/{user_id}/{yyyy}{mm}{dd}/{random}.{ext}
```

### 2. STS 签发

Python 使用根级永久凭证和 `ramRoleArn` 签发 STS 临时凭证，权限仅允许：

- 当前 bucket
- 当前 object key
- 当前任务时效

交换响应返回：

- `endpoint`
- `bucket`
- `accessKeyId`
- `accessKeySecret`
- `securityToken`
- `expiresAt`
- `objectKey`

### 3. 完成回调校验

Go 调用 `complete` 时，Python 必须再次校验：

- `bucket` 与签发时一致
- `objectKey` 与签发时一致
- 对象真实存在

不允许客户端补传第二个路径，也不允许在上传失败后改写到其他 key。

## 客户端与 Go 流程

### Next.js

- 不接触永久 OSS 密钥。
- 不编辑 bucket、prefix、object key。
- 只申请票据并把票据传给 Go。

### Go

- 只消费云端返回的完整 `objectKey`。
- 不再自行拼接 `targetPath`。
- 不读取本地 OSS 配置。
- 上传后按同一个 `bucket + objectKey` 回传 `complete`。

## 不在本次范围内

- 不处理旧功能前端永久密钥直传的彻底收口。
- 不拆分新的 OSS 设置 key。
- 不为桌面版增加独立目录输入框。
- 不支持桌面端自由指定上传目录。

## 建议落地顺序

1. 先更新三份桌面云端方案文档口径。
2. 再改云端后台 OSS 设置页结构与说明。
3. 然后改 Python `oss_sts_service.py` 的配置读取、`targetPath` 规范化和完整 `objectKey` 生成。
4. 最后改 Go 只接收并上传完整 `objectKey`，不再参与路径计算。
