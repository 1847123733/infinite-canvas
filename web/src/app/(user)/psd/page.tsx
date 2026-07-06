"use client";

import { App, Button, Empty, Image, Progress, Tag, Typography } from "antd";
import { Archive, Clock3, Download, FileJson, FileType2, ImageUp, Layers3, LoaderCircle, Play, RotateCcw, Trash2, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { createPSDTask, fetchPSDTaskFile, type PSDTaskFile } from "@/services/api/psd";
import { formatDuration } from "@/lib/image-utils";
import { usePSDTaskStore } from "@/stores/use-psd-task-store";

const outputLabels: Record<PSDTaskFile["name"], string> = {
    source: "原图",
    preview: "预览图",
    psd: "PSD",
    zip: "图层 ZIP",
    manifest: "Manifest",
    config: "配置 JSON",
};

const outputIcons: Record<PSDTaskFile["name"], LucideIcon> = {
    source: ImageUp,
    preview: ImageUp,
    psd: FileType2,
    zip: Archive,
    manifest: FileJson,
    config: FileJson,
};

export default function PSDWorkbenchPage() {
    const { message } = App.useApp();
    const inputRef = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [previewUrl, setPreviewUrl] = useState("");
    const [sourceUrl, setSourceUrl] = useState("");
    const tasks = usePSDTaskStore((state) => state.tasks);
    const activeTaskId = usePSDTaskStore((state) => state.activeTaskId);
    const upsertTask = usePSDTaskStore((state) => state.upsertTask);
    const setActiveTaskId = usePSDTaskStore((state) => state.setActiveTaskId);
    const removeTask = usePSDTaskStore((state) => state.removeTask);
    const task = activeTaskId ? tasks.find((item) => item.id === activeTaskId) || null : null;
    const running = task?.status === "pending" || task?.status === "running";

    useEffect(() => {
        if (!task?.startedAt || !running) return;
        const startedAt = Date.parse(task.startedAt);
        const timer = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);
        setElapsedMs(Date.now() - startedAt);
        return () => window.clearInterval(timer);
    }, [running, task?.startedAt]);

    useEffect(() => {
        if (!file) return;
        const url = URL.createObjectURL(file);
        setSourceUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    useEffect(() => {
        if (!task || file?.name === task.sourceName) return;
        const source = task.files.find((item) => item.name === "source");
        if (!source) return;
        let url = "";
        void fetchPSDTaskFile(source.url)
            .then((blob) => {
                url = URL.createObjectURL(blob);
                setSourceUrl(url);
            })
            .catch(() => message.error("读取原图失败"));
        return () => {
            if (url) URL.revokeObjectURL(url);
            setSourceUrl("");
        };
    }, [file?.name, message, task]);

    useEffect(() => {
        if (task?.status !== "success") return;
        const preview = task.files.find((item) => item.name === "preview");
        if (!preview) return;
        let url = "";
        void fetchPSDTaskFile(preview.url)
            .then((blob) => {
                url = URL.createObjectURL(blob);
                setPreviewUrl(url);
            })
            .catch(() => message.error("读取预览失败"));
        return () => {
            if (url) URL.revokeObjectURL(url);
            setPreviewUrl("");
        };
    }, [message, task]);

    const statusTag = useMemo(() => {
        if (!task) return <Tag>待开始</Tag>;
        if (task.status === "success") return <Tag color="success">已完成</Tag>;
        if (task.status === "failed") return <Tag color="error">失败</Tag>;
        return <Tag color="processing">处理中</Tag>;
    }, [task]);

    const durationText = task?.finishedAt && task.startedAt ? formatDuration(Date.parse(task.finishedAt) - Date.parse(task.startedAt)) : formatDuration(elapsedMs);

    async function startTask() {
        if (!file) {
            message.warning("请先选择图片");
            return;
        }
        setSubmitting(true);
        setPreviewUrl("");
        try {
            const next = await createPSDTask(file);
            upsertTask(next);
            setActiveTaskId(next.id);
            message.success("PSD 任务已开始");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "创建任务失败");
        } finally {
            setSubmitting(false);
        }
    }

    async function downloadFile(item: PSDTaskFile) {
        try {
            const blob = await fetchPSDTaskFile(item.url);
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = downloadName(item, task?.id || "psd-task");
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "下载失败");
        }
    }

    function resetTask() {
        setActiveTaskId("");
        setFile(null);
        setElapsedMs(0);
        setPreviewUrl("");
        setSourceUrl("");
    }

    function selectHistoryTask(id: string) {
        setFile(null);
        setActiveTaskId(id);
    }

    return (
        <main className="h-full overflow-y-auto bg-[#f3f6f7] px-5 py-6 text-stone-950 dark:bg-[#151515] dark:text-stone-100">
            <div className="mx-auto grid min-h-full max-w-[1500px] gap-5 xl:grid-cols-[300px_minmax(0,1fr)_360px]">
                <aside className="min-h-0 border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-[#1d1d1b]">
                    <TaskHistory tasks={tasks} activeTaskId={task?.id || ""} onSelect={selectHistoryTask} onRemove={removeTask} />
                </aside>

                <section className="min-h-0">
                    <div className="border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-[#1d1d1b]">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-4 dark:border-stone-800">
                            <div className="flex items-center gap-3">
                                <span className="flex size-10 items-center justify-center bg-emerald-600 text-white dark:bg-emerald-400 dark:text-stone-950">
                                    <Layers3 className="size-5" />
                                </span>
                                <div>
                                    <Typography.Title level={2} className="!m-0 !text-xl !font-medium dark:!text-stone-100">
                                        PSD工作台
                                    </Typography.Title>
                                    <div className="mt-1 text-sm text-stone-500 dark:text-stone-400">任务 {task?.id || "未创建"} · {statusTag}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button icon={<ImageUp className="size-4" />} onClick={() => inputRef.current?.click()}>
                                    选择图片
                                </Button>
                                <Button icon={<RotateCcw className="size-4" />} onClick={resetTask} disabled={running}>
                                    重置
                                </Button>
                                <Button type="primary" icon={running ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />} loading={submitting} disabled={running} onClick={() => void startTask()}>
                                    开始任务
                                </Button>
                            </div>
                        </div>

                        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(event) => setFile(event.target.files?.[0] || null)} />
                        <div className="mt-5">
                            <PanelTitle title="原图" extra={task?.sourceName || file?.name || ""} />
                            <button type="button" className="mt-3 flex h-[360px] w-full items-center justify-center border border-dashed border-stone-300 bg-[#f8faf9] p-5 text-center transition hover:border-emerald-600 hover:bg-white dark:border-stone-700 dark:bg-[#171716] dark:hover:border-emerald-300 dark:hover:bg-[#20201e]" onClick={() => inputRef.current?.click()}>
                                {sourceUrl ? (
                                    <img src={sourceUrl} alt="PSD 原图" className="max-h-full max-w-full object-contain" />
                                ) : (
                                    <div className="flex flex-col items-center gap-3 text-stone-500">
                                        <ImageUp className="size-10" />
                                        <span className="text-base font-medium text-stone-700 dark:text-stone-200">选择图片</span>
                                        <span className="text-sm">支持海报、App 截图、营销图</span>
                                    </div>
                                )}
                            </button>
                        </div>
                    </div>
                </section>

                <aside className="min-h-0 space-y-5">
                    <div className="border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-[#1d1d1b]">
                        <div className="flex items-center justify-between">
                            <Typography.Title level={3} className="!m-0 !text-base !font-medium dark:!text-stone-100">
                                任务状态
                            </Typography.Title>
                            {statusTag}
                        </div>

                        <div className="mt-5 space-y-4">
                            <Metric label="已执行" value={durationText} />
                            <Metric label="文本模型" value={task?.model || "-"} />
                            <Metric label="源文件" value={task?.sourceName || file?.name || "-"} />
                            {running ? <Progress percent={task?.status === "pending" ? 18 : 62} status="active" showInfo={false} /> : null}
                            {task?.error ? <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">{task.error}</div> : null}
                        </div>
                    </div>

                    <div className="border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-[#1d1d1b]">
                        <PanelTitle title="产物" extra={task?.status === "success" ? "可下载" : running ? "处理中" : ""} />
                        <div className="mt-3 space-y-4">
                            <div className="flex min-h-[220px] items-center justify-center border border-stone-200 bg-[#f8fafc] p-4 dark:border-stone-800 dark:bg-[#181817]">
                                {previewUrl ? (
                                    <Image src={previewUrl} alt="PSD 图层预览" className="max-h-[280px] object-contain" />
                                ) : (
                                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={running ? "正在生成图层预览" : "任务完成后显示预览"} />
                                )}
                            </div>
                            <div className="space-y-2">
                                {(task?.files || [])
                                    .filter((item) => item.name !== "preview" && item.name !== "source")
                                    .map((item) => {
                                        const Icon = outputIcons[item.name];
                                        return (
                                            <Button key={item.name} block className="!h-11 !justify-start" icon={<Icon className="size-4" />} disabled={task?.status !== "success"} onClick={() => void downloadFile(item)}>
                                                <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                                                    <span>{outputLabels[item.name]}</span>
                                                    <Download className="size-4 text-stone-400" />
                                                </span>
                                            </Button>
                                        );
                                    })}
                                {!task ? <div className="text-sm text-stone-500">暂无产物</div> : null}
                            </div>
                        </div>
                    </div>
                </aside>
            </div>
        </main>
    );
}

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div className="border-b border-stone-100 pb-3 dark:border-stone-800">
            <div className="text-xs text-stone-500">{label}</div>
            <div className="mt-1 break-all text-sm font-medium">{value}</div>
        </div>
    );
}

function PanelTitle({ title, extra }: { title: string; extra?: string }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <Typography.Title level={3} className="!m-0 !text-base !font-medium dark:!text-stone-100">
                {title}
            </Typography.Title>
            {extra ? <span className="truncate text-sm text-stone-500">{extra}</span> : null}
        </div>
    );
}

function TaskHistory({ tasks, activeTaskId, onSelect, onRemove }: { tasks: Array<{ id: string; status: string; sourceName: string; startedAt: string }>; activeTaskId: string; onSelect: (id: string) => void; onRemove: (id: string) => void }) {
    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                    <Clock3 className="size-4" />
                    历史记录
                </div>
                <span className="text-xs text-stone-500">{tasks.length} 条</span>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {tasks.length ? (
                    tasks.map((task) => {
                        const active = task.id === activeTaskId;
                        return (
                            <div key={task.id} className={`group flex items-center gap-2 border p-2 text-left ${active ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20" : "border-stone-200 dark:border-stone-800"}`}>
                                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onSelect(task.id)}>
                                    <div className="truncate text-sm font-medium">{task.sourceName || task.id}</div>
                                    <div className="mt-1 flex items-center gap-2 text-xs text-stone-500">
                                        <span>{task.id.slice(0, 15)}</span>
                                        <TaskStatusText status={task.status} />
                                    </div>
                                </button>
                                <button type="button" className="flex size-7 shrink-0 items-center justify-center text-stone-400 hover:text-red-500" onClick={() => onRemove(task.id)} aria-label="删除历史">
                                    <Trash2 className="size-4" />
                                </button>
                            </div>
                        );
                    })
                ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无历史" />
                )}
            </div>
        </div>
    );
}

function TaskStatusText({ status }: { status: string }) {
    if (status === "success") return <span className="text-emerald-600">已完成</span>;
    if (status === "failed") return <span className="text-red-500">失败</span>;
    return <span className="text-blue-500">处理中</span>;
}

function downloadName(item: PSDTaskFile, taskId: string) {
    if (item.name === "psd") return `${taskId}.psd`;
    if (item.name === "zip") return `${taskId}-layers.zip`;
    if (item.name === "manifest") return `${taskId}-manifest.json`;
    if (item.name === "config") return `${taskId}-layers.json`;
    if (item.name === "source") return `${taskId}-source.png`;
    return `${taskId}.png`;
}
