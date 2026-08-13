"use client";

import { useCallback, useEffect, useState } from "react";
import { App, Button, Modal, Spin, theme as antdTheme } from "antd";
import { HardDrive, RefreshCw, Trash2 } from "lucide-react";

import { cleanupUnusedCanvasStorage, getCanvasStorageProtectedData, getCanvasStorageStats, type CanvasStorageStats } from "@/services/canvas-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import { useCanvasStore } from "../stores/use-canvas-store";

type CanvasStorageModalProps = {
    open: boolean;
    getProtectedData?: () => unknown;
    onClose: () => void;
};

export function CanvasStorageModal({ open, getProtectedData, onClose }: CanvasStorageModalProps) {
    const { message } = App.useApp();
    const { token } = antdTheme.useToken();
    const [stats, setStats] = useState<CanvasStorageStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [cleaning, setCleaning] = useState(false);

    const getUsedData = useCallback(
        () => ({
            projects: useCanvasStore.getState().projects,
            assets: useAssetStore.getState().assets,
            protectedData: getProtectedData?.() ?? getCanvasStorageProtectedData(),
        }),
        [getProtectedData],
    );

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            setStats(await getCanvasStorageStats(getUsedData()));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取存储占用失败");
        } finally {
            setLoading(false);
        }
    }, [getUsedData, message]);

    useEffect(() => {
        if (open) void refresh();
    }, [open, refresh]);

    const clean = async () => {
        setCleaning(true);
        try {
            const result = await cleanupUnusedCanvasStorage(getUsedData());
            message.success(result.deleted ? `已清理 ${result.deleted} 个文件，释放 ${formatBytes(result.freedBytes)}` : "没有可清理的缓存");
            await refresh();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "清理画布缓存失败");
        } finally {
            setCleaning(false);
        }
    };

    const usagePercent = stats?.browserQuota ? Math.min(100, (stats.browserUsage / stats.browserQuota) * 100) : 0;

    return (
        <Modal
            title={
                <span className="flex items-center gap-2">
                    <HardDrive className="size-4" />
                    画布存储
                </span>
            }
            open={open}
            centered
            width={520}
            onCancel={onClose}
            footer={
                <>
                    <Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void refresh()}>
                        刷新
                    </Button>
                    <Button type="primary" icon={<Trash2 className="size-4" />} loading={cleaning} disabled={!stats?.reclaimableFiles} onClick={() => void clean()}>
                        安全清理
                    </Button>
                </>
            }
        >
            {loading && !stats ? (
                <div className="flex h-48 items-center justify-center">
                    <Spin />
                </div>
            ) : (
                <div className="space-y-4 py-2">
                    <div className="grid grid-cols-2 gap-3">
                        <StorageMetric label="画布媒体" value={formatBytes(stats?.managedBytes || 0)} detail={`${stats?.managedFiles || 0} 个图片、音视频文件`} />
                        <StorageMetric label="可安全清理" value={formatBytes(stats?.reclaimableBytes || 0)} detail={`${stats?.reclaimableFiles || 0} 个无引用文件`} />
                    </div>
                    <div className="rounded-xl border p-4" style={{ borderColor: token.colorBorderSecondary, background: token.colorFillAlter }}>
                        <div className="flex items-center justify-between text-sm">
                            <span style={{ color: token.colorTextSecondary }}>应用本地总占用</span>
                            <span className="font-medium">
                                {formatBytes(stats?.browserUsage || 0)}
                                {stats?.browserQuota ? ` / ${formatBytes(stats.browserQuota)}` : ""}
                            </span>
                        </div>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full" style={{ background: token.colorFillSecondary }}>
                            <div className="h-full rounded-full transition-[width]" style={{ width: `${usagePercent}%`, background: token.colorPrimary }} />
                        </div>
                    </div>
                    <p className="text-xs leading-5" style={{ color: token.colorTextTertiary }}>
                        安全清理只删除所有画布、“我的素材”和当前撤销历史均未引用的文件，不会影响仍在使用的节点。
                    </p>
                </div>
            )}
        </Modal>
    );
}

function StorageMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
    const { token } = antdTheme.useToken();
    return (
        <div className="rounded-xl border p-4" style={{ borderColor: token.colorBorderSecondary, background: token.colorBgContainer }}>
            <div className="text-xs" style={{ color: token.colorTextSecondary }}>
                {label}
            </div>
            <div className="mt-2 text-xl font-semibold tabular-nums">{value}</div>
            <div className="mt-1 text-xs" style={{ color: token.colorTextTertiary }}>
                {detail}
            </div>
        </div>
    );
}

function formatBytes(bytes: number) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** index;
    return `${value >= 100 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}
