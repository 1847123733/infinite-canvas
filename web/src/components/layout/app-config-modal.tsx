"use client";

import { App, Button, Form, Input, Modal } from "antd";
import { useState } from "react";

import { ModelPicker } from "@/components/model-picker";
import { useConfigStore, useEffectiveConfig, type ModelCapability } from "@/stores/use-config-store";

type ModelGroup = {
    capability: ModelCapability;
    modelKey: "imageModel" | "textModel";
    defaultLabel: string;
};

const modelGroups: ModelGroup[] = [
    { capability: "image", modelKey: "imageModel", defaultLabel: "默认生图模型" },
    { capability: "text", modelKey: "textModel", defaultLabel: "默认文本模型" },
];

export function AppConfigModal() {
    const { message } = App.useApp();
    const [syncingCloudModels, setSyncingCloudModels] = useState(false);
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isConfigOpen = useConfigStore((state) => state.isConfigOpen);
    const shouldPromptContinue = useConfigStore((state) => state.shouldPromptContinue);
    const setConfigDialogOpen = useConfigStore((state) => state.setConfigDialogOpen);
    const clearPromptContinue = useConfigStore((state) => state.clearPromptContinue);
    const publicSettings = useConfigStore((state) => state.publicSettings);
    const isPublicSettingsLoading = useConfigStore((state) => state.isPublicSettingsLoading);
    const syncPublicSettings = useConfigStore((state) => state.syncPublicSettings);
    const effectiveConfig = useEffectiveConfig();
    const modelChannel = publicSettings?.modelChannel;

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
                </Form>
            </div>
        </Modal>
    );
}

function normalizeImageCount(value: string) {
    return String(Math.max(1, Math.min(15, Math.floor(Math.abs(Number(value)) || 3))));
}
