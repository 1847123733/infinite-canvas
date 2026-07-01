"use client";

import { App, Button, Form, Input, Modal, Progress, Segmented } from "antd";
import { Cloud, RefreshCw, Wifi } from "lucide-react";
import { useState } from "react";

import { ModelPicker } from "@/components/model-picker";
import { syncAppDataToWebdav, type AppSyncDomainKey, type AppSyncProgressEvent } from "@/services/app-sync";
import { testWebdavConnection, WEBDAV_MANIFEST_FILE_NAME } from "@/services/webdav-sync";
import { useConfigStore, useEffectiveConfig, type ModelCapability } from "@/stores/use-config-store";

type ModelGroup = {
    capability: ModelCapability;
    modelKey: "imageModel" | "textModel";
    defaultLabel: string;
};

type WebdavDomainProgress = {
    label: string;
    stage: string;
    current?: number;
    total?: number;
    status?: "active" | "success" | "exception";
};

const modelGroups: ModelGroup[] = [
    { capability: "image", modelKey: "imageModel", defaultLabel: "默认生图模型" },
    { capability: "text", modelKey: "textModel", defaultLabel: "默认文本模型" },
];

const webdavDomainKeys: AppSyncDomainKey[] = ["canvas", "assets", "image-workbench", "video-workbench"];
const webdavDomainLabels: Record<AppSyncDomainKey, string> = {
    canvas: "画布",
    assets: "我的素材",
    "image-workbench": "生图工作台",
    "video-workbench": "视频创作台",
};

function createWebdavDomainProgress(): Record<AppSyncDomainKey, WebdavDomainProgress> {
    return webdavDomainKeys.reduce(
        (progress, key) => ({
            ...progress,
            [key]: { label: webdavDomainLabels[key], stage: "等待同步" },
        }),
        {} as Record<AppSyncDomainKey, WebdavDomainProgress>,
    );
}

export function AppConfigModal() {
    const { message } = App.useApp();
    const [syncingCloudModels, setSyncingCloudModels] = useState(false);
    const [testingWebdav, setTestingWebdav] = useState(false);
    const [syncingWebdav, setSyncingWebdav] = useState(false);
    const [webdavSyncStatus, setWebdavSyncStatus] = useState("");
    const [webdavDomainProgress, setWebdavDomainProgress] = useState(createWebdavDomainProgress);
    const config = useConfigStore((state) => state.config);
    const webdav = useConfigStore((state) => state.webdav);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const updateWebdavConfig = useConfigStore((state) => state.updateWebdavConfig);
    const isConfigOpen = useConfigStore((state) => state.isConfigOpen);
    const shouldPromptContinue = useConfigStore((state) => state.shouldPromptContinue);
    const setConfigDialogOpen = useConfigStore((state) => state.setConfigDialogOpen);
    const clearPromptContinue = useConfigStore((state) => state.clearPromptContinue);
    const publicSettings = useConfigStore((state) => state.publicSettings);
    const isPublicSettingsLoading = useConfigStore((state) => state.isPublicSettingsLoading);
    const syncPublicSettings = useConfigStore((state) => state.syncPublicSettings);
    const effectiveConfig = useEffectiveConfig();
    const modelChannel = publicSettings?.modelChannel;
    const webdavReady = Boolean(webdav.url.trim());

    const finishConfig = () => {
        setConfigDialogOpen(false);
        if (!effectiveConfig.imageModel.trim() || !effectiveConfig.textModel.trim()) return;
        message.success(shouldPromptContinue ? "配置已保存，请继续刚才的请求" : "配置已保存");
        clearPromptContinue();
    };

    const syncCloudModels = async () => {
        setSyncingCloudModels(true);
        try {
            const settings = await syncPublicSettings();
            message.success(`已刷新云端控制 LLM 配置，当前可用 ${settings.modelChannel.availableModels.length} 个模型`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "刷新云端控制 LLM 配置失败");
        } finally {
            setSyncingCloudModels(false);
        }
    };

    const testWebdav = async () => {
        if (!webdavReady) {
            message.error("请先填写 WebDAV 地址");
            return;
        }
        setTestingWebdav(true);
        try {
            await testWebdavConnection(webdav);
            message.success("WebDAV 连接可用");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "WebDAV 连接测试失败");
        } finally {
            setTestingWebdav(false);
        }
    };

    const updateWebdavProgress = (event: AppSyncProgressEvent) => {
        setWebdavSyncStatus(event.stage);
        if (!event.domain) return;
        setWebdavDomainProgress((current) => ({
            ...current,
            [event.domain as AppSyncDomainKey]: {
                label: event.label || webdavDomainLabels[event.domain as AppSyncDomainKey],
                stage: event.stage,
                current: event.current,
                total: event.total,
                status: event.status,
            },
        }));
    };

    const syncWebdav = async () => {
        if (!webdavReady) {
            message.error("请先填写 WebDAV 地址");
            return;
        }
        setSyncingWebdav(true);
        setWebdavDomainProgress(createWebdavDomainProgress());
        setWebdavSyncStatus("准备同步");
        try {
            const result = await syncAppDataToWebdav(webdav, updateWebdavProgress);
            updateWebdavConfig("lastSyncedAt", result.syncedAt);
            message.success(`同步完成：${result.projects} 个画布，${result.assets} 个素材，${result.imageLogs + result.videoLogs} 条记录，本次上传 ${result.uploadedFiles} 个文件 ${formatBytes(result.uploadedBytes)}`);
        } catch (error) {
            setWebdavSyncStatus(error instanceof Error ? error.message : "WebDAV 同步失败");
            message.error(error instanceof Error ? error.message : "WebDAV 同步失败");
        } finally {
            setSyncingWebdav(false);
        }
    };

    return (
        <Modal
            title={
                <div>
                    <div className="text-lg font-semibold">配置与用户偏好</div>
                    <div className="mt-1 text-xs font-normal text-stone-500">模型、渠道和画布默认行为</div>
                </div>
            }
            open={isConfigOpen}
            width={960}
            centered
            onCancel={() => setConfigDialogOpen(false)}
            styles={{ body: { maxHeight: "72vh", overflowY: "auto", paddingRight: 18 } }}
            footer={
                <Button type="primary" onClick={finishConfig}>
                    完成
                </Button>
            }
        >
            <div className="pt-1">
                <Form layout="vertical" requiredMark={false}>
                    {/* Local direct settings are intentionally hidden for now and can be restored later. */}
                    <div className="mb-5 rounded-lg border border-stone-200 p-3 text-sm text-stone-500 dark:border-stone-800">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <div className="font-medium text-stone-900 dark:text-stone-100">云端渠道</div>
                                <div className="mt-1">由系统后台渠道转发请求，当前可用 {modelChannel?.availableModels.length || 0} 个模型。</div>
                                <div className="mt-1 text-xs text-stone-400">点击后会直接读取云端控制服务的可用模型，不再经过本地数据库同步。</div>
                            </div>
                            <Button size="small" loading={syncingCloudModels || isPublicSettingsLoading} onClick={() => void syncCloudModels()}>
                                刷新云端控制 LLM 配置
                            </Button>
                        </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        {modelGroups.map((group) => (
                            <Form.Item key={group.modelKey} label={group.defaultLabel} className="mb-4">
                                <ModelPicker config={effectiveConfig} value={effectiveConfig[group.modelKey]} onChange={(model) => updateConfig(group.modelKey, model)} capability={group.capability} fullWidth />
                            </Form.Item>
                        ))}
                    </div>
                    <div className="grid gap-4 md:grid-cols-1">
                        <Form.Item label="画布默认生图张数" extra="新建画布生图和配置节点默认使用，单个节点仍可单独覆盖。" className="mb-4">
                            <Input
                                type="number"
                                min={1}
                                max={15}
                                value={config.canvasImageCount}
                                onChange={(event) => updateConfig("canvasImageCount", event.target.value)}
                                onBlur={(event) => updateConfig("canvasImageCount", normalizeImageCount(event.target.value))}
                            />
                        </Form.Item>
                    </div>
                    <section className="mt-5 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <div className="flex items-center gap-2 text-sm font-semibold">
                                    <Cloud className="size-4" />
                                    WebDAV 同步
                                </div>
                                <div className="mt-1 text-xs text-stone-500">同步画布、我的素材、生成记录和本地媒体文件，不包含 AI API Key；服务不支持 CORS 时可走 Next.js 转发。</div>
                            </div>
                            <div className="text-xs text-stone-500">{webdav.lastSyncedAt ? `上次同步 ${formatWebdavTime(webdav.lastSyncedAt)}` : "尚未同步"}</div>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <Form.Item label="连接方式" className="mb-4 md:col-span-2">
                                <Segmented
                                    block
                                    value={webdav.proxyMode}
                                    onChange={(value) => updateWebdavConfig("proxyMode", value as typeof webdav.proxyMode)}
                                    options={[
                                        { label: "前端直连", value: "direct" },
                                        { label: "Next.js 转发", value: "nextjs" },
                                    ]}
                                />
                            </Form.Item>
                            <Form.Item label="WebDAV 地址" className="mb-4">
                                <Input value={webdav.url} placeholder="https://nas.example.com/webdav" onChange={(event) => updateWebdavConfig("url", event.target.value)} />
                            </Form.Item>
                            <Form.Item label="远程目录" extra={`会在该目录下分业务目录保存，每个目录包含 ${WEBDAV_MANIFEST_FILE_NAME} 和 files/`} className="mb-4">
                                <Input value={webdav.directory} placeholder="infinite-canvas" onChange={(event) => updateWebdavConfig("directory", event.target.value)} />
                            </Form.Item>
                            <Form.Item label="用户名" className="mb-0">
                                <Input value={webdav.username} autoComplete="username" onChange={(event) => updateWebdavConfig("username", event.target.value)} />
                            </Form.Item>
                            <Form.Item label="密码 / 应用密码" className="mb-0">
                                <Input.Password value={webdav.password} autoComplete="current-password" onChange={(event) => updateWebdavConfig("password", event.target.value)} />
                            </Form.Item>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                            <Button icon={<Wifi className="size-4" />} disabled={!webdavReady || syncingWebdav} loading={testingWebdav} onClick={() => void testWebdav()}>
                                测试连接
                            </Button>
                            <Button type="primary" icon={<RefreshCw className="size-4" />} disabled={!webdavReady || testingWebdav} loading={syncingWebdav} onClick={() => void syncWebdav()}>
                                {syncingWebdav ? "同步中" : "立即同步"}
                            </Button>
                            {webdavSyncStatus ? <span className="text-xs text-stone-500">{webdavSyncStatus}</span> : null}
                        </div>
                        {syncingWebdav || webdavSyncStatus ? (
                            <div className="mt-3 grid gap-2">
                                {webdavDomainKeys.map((key) => {
                                    const item = webdavDomainProgress[key];
                                    const count = item.total ? `${item.current || 0}/${item.total}` : "";
                                    return (
                                        <div key={key} className="rounded-md border border-stone-200 px-3 py-2 dark:border-stone-800">
                                            <div className="mb-1 flex min-w-0 items-center justify-between gap-3 text-xs">
                                                <span className="shrink-0 font-medium text-stone-700 dark:text-stone-200">{item.label}</span>
                                                <span className="min-w-0 truncate text-right text-stone-500">
                                                    {item.stage}
                                                    {count ? ` · ${count}` : ""}
                                                </span>
                                            </div>
                                            <Progress percent={getWebdavProgressPercent(item)} size="small" status={getWebdavProgressStatus(item)} showInfo={false} />
                                        </div>
                                    );
                                })}
                            </div>
                        ) : null}
                    </section>
                </Form>
            </div>
        </Modal>
    );
}

function normalizeImageCount(value: string) {
    return String(Math.max(1, Math.min(15, Math.floor(Math.abs(Number(value)) || 3))));
}

function formatWebdavTime(value: string) {
    return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function getWebdavProgressPercent(item: WebdavDomainProgress) {
    if (item.status === "success") return 100;
    if (item.total) return Math.min(100, Math.round(((item.current || 0) / item.total) * 100));
    if (item.status === "exception") return 100;
    if (item.stage === "等待同步") return 0;
    if (item.stage === "读取远端清单") return 12;
    if (item.stage === "读取本地数据") return 24;
    if (item.stage === "下载缺失媒体") return 36;
    if (item.stage === "写入本地合并结果") return 58;
    if (item.stage === "上传新增媒体") return 66;
    if (item.stage === "媒体已齐全" || item.stage === "媒体无需上传") return 74;
    if (item.stage.startsWith("上传清单")) return 90;
    return item.status === "active" ? 30 : 0;
}

function getWebdavProgressStatus(item: WebdavDomainProgress): "normal" | "active" | "success" | "exception" {
    if (item.status === "success" || item.status === "exception") return item.status;
    return item.status === "active" ? "active" : "normal";
}

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
