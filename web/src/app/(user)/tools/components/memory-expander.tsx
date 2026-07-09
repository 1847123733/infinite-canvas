"use client";

import { Download, FileImage, ImagePlus, Info, RefreshCcw, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { App, Button, InputNumber, Tag } from "antd";
import { saveAs } from "file-saver";

import { formatBytes } from "@/lib/image-utils";
import { cn } from "@/lib/utils";

const MAX_TARGET_BYTES = 200 * 1024 * 1024;
const PADDING_CHUNK_BYTES = 1024 * 1024;
const SUPPORTED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/bmp"]);

type ExpandedFile = {
    blob: Blob;
    name: string;
    size: number;
};

export function MemoryExpander() {
    const { message } = App.useApp();
    const inputRef = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [targetKb, setTargetKb] = useState<number | null>(null);
    const [previewUrl, setPreviewUrl] = useState("");
    const [dragging, setDragging] = useState(false);
    const [expandedFile, setExpandedFile] = useState<ExpandedFile | null>(null);

    useEffect(() => {
        if (!file) {
            setPreviewUrl("");
            return;
        }
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    const targetBytes = useMemo(() => Math.round((targetKb || 0) * 1024), [targetKb]);
    const canExpand = Boolean(file && targetBytes > file.size && targetBytes <= MAX_TARGET_BYTES);

    const pickFile = (nextFile?: File) => {
        if (!nextFile) return;
        if (!isSupportedImageFile(nextFile)) {
            message.error("请选择 PNG、JPG、WEBP 或 BMP 图片");
            return;
        }
        if (nextFile.size >= MAX_TARGET_BYTES) {
            message.error("图片需要小于 200 MB");
            return;
        }
        setFile(nextFile);
        setExpandedFile(null);
        setTargetKb(Math.ceil(nextFile.size / 1024) + 100);
    };

    const expandFile = () => {
        if (!file) {
            message.warning("请先选择图片");
            return;
        }
        if (targetBytes <= file.size) {
            message.warning("指定大小需要大于原图大小");
            return;
        }
        if (targetBytes > MAX_TARGET_BYTES) {
            message.warning("目标大小不能超过 200 MB");
            return;
        }

        const blob = buildExpandedImageBlob(file, targetBytes);
        const result = { blob, name: createOutputFileName(file, targetKb || 0), size: blob.size };
        setExpandedFile(result);
        saveAs(blob, result.name);
        message.success("已生成并下载图片");
    };

    const downloadExpandedFile = () => {
        if (!expandedFile) return;
        saveAs(expandedFile.blob, expandedFile.name);
    };

    const resetFile = () => {
        setFile(null);
        setTargetKb(null);
        setExpandedFile(null);
        if (inputRef.current) inputRef.current.value = "";
    };

    const onDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDragging(false);
        pickFile(event.dataTransfer.files?.[0]);
    };

    return (
        <section className="min-w-0 overflow-hidden rounded-lg border border-stone-200 bg-background/95 shadow-sm shadow-stone-200/70 backdrop-blur dark:border-stone-800 dark:shadow-none">
            <div className="flex flex-col gap-3 border-b border-stone-200 px-5 py-4 sm:flex-row sm:items-start sm:justify-between dark:border-stone-800">
                <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-stone-500 dark:text-stone-400">
                        <FileImage className="size-4" />
                        本地图片工具
                    </div>
                    <h2 className="mt-2 text-2xl font-semibold tracking-normal text-stone-950 dark:text-stone-100">内存变大</h2>
                </div>
                <Tag className="m-0 w-fit rounded-full px-3 py-1 text-xs">PNG / JPG / WEBP / BMP</Tag>
            </div>

            <div className="grid min-h-[470px] gap-0 lg:grid-cols-[minmax(300px,42%)_minmax(0,1fr)]">
                <div className="border-b border-stone-200 p-5 lg:border-b-0 lg:border-r dark:border-stone-800">
                    <div
                        className={cn(
                            "group relative flex min-h-[340px] flex-col overflow-hidden rounded-lg border border-dashed bg-stone-50/70 transition dark:bg-stone-950/40",
                            dragging ? "border-stone-950 bg-stone-100 dark:border-stone-100 dark:bg-stone-900" : "border-stone-300 hover:border-stone-500 dark:border-stone-700 dark:hover:border-stone-500",
                        )}
                        onDragOver={(event) => {
                            event.preventDefault();
                            setDragging(true);
                        }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={onDrop}
                    >
                        {previewUrl ? (
                            <>
                                <div className="flex min-h-0 flex-1 items-center justify-center bg-[linear-gradient(45deg,rgba(120,113,108,.08)_25%,transparent_25%,transparent_75%,rgba(120,113,108,.08)_75%),linear-gradient(45deg,rgba(120,113,108,.08)_25%,transparent_25%,transparent_75%,rgba(120,113,108,.08)_75%)] bg-[length:22px_22px] bg-[position:0_0,11px_11px] p-4">
                                    <img src={previewUrl} alt={file?.name || "待处理图片"} className="max-h-[280px] max-w-full rounded-md object-contain shadow-sm shadow-stone-300/80 dark:shadow-none" />
                                </div>
                                <div className="border-t border-stone-200 bg-background/95 p-4 dark:border-stone-800">
                                    <div className="flex min-w-0 items-start gap-3">
                                        <FileImage className="mt-0.5 size-5 shrink-0 text-stone-500 dark:text-stone-400" />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-medium text-stone-950 dark:text-stone-100">{file?.name}</div>
                                            <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">{file ? formatFileMeta(file) : ""}</div>
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <button type="button" className="flex min-h-[340px] flex-1 flex-col items-center justify-center px-6 text-center" onClick={() => inputRef.current?.click()}>
                                <span className="flex size-16 items-center justify-center rounded-lg bg-stone-950 text-white shadow-sm shadow-stone-300 dark:bg-stone-100 dark:text-stone-950 dark:shadow-none">
                                    <ImagePlus className="size-7" />
                                </span>
                                <span className="mt-5 text-lg font-semibold text-stone-950 dark:text-stone-100">选择或拖入图片</span>
                                <span className="mt-2 max-w-xs text-sm leading-6 text-stone-500 dark:text-stone-400">选择后输入目标 KB，生成的新文件会自动下载。</span>
                            </button>
                        )}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                        <Button icon={<Upload className="size-4" />} onClick={() => inputRef.current?.click()}>
                            {file ? "重新上传" : "添加图片"}
                        </Button>
                        {file ? (
                            <Button icon={<RefreshCcw className="size-4" />} onClick={resetFile}>
                                清空
                            </Button>
                        ) : null}
                    </div>
                </div>

                <div className="flex min-w-0 flex-col p-5">
                    <div className="rounded-lg border border-stone-200 bg-stone-50 p-5 dark:border-stone-800 dark:bg-stone-950/50">
                        <label className="text-sm font-medium text-stone-950 dark:text-stone-100">指定大小</label>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                            <InputNumber className="!w-36" min={1} max={Math.floor(MAX_TARGET_BYTES / 1024)} precision={0} value={targetKb} onChange={(value) => setTargetKb(typeof value === "number" ? value : null)} />
                            <span className="text-sm text-stone-600 dark:text-stone-300">KB = {formatMb(targetBytes)}</span>
                        </div>
                        <div className="mt-4 grid gap-2 text-sm text-stone-500 dark:text-stone-400">
                            <div>原图大小：{file ? formatBytes(file.size) : "未选择"}</div>
                            <div>增加容量：{file && targetBytes > file.size ? formatBytes(targetBytes - file.size) : "0 B"}</div>
                        </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                        <Button type="primary" size="large" disabled={!canExpand} icon={<Download className="size-4" />} onClick={expandFile}>
                            立即修改
                        </Button>
                        {expandedFile ? (
                            <Button size="large" icon={<Download className="size-4" />} onClick={downloadExpandedFile}>
                                下载结果
                            </Button>
                        ) : null}
                    </div>

                    {expandedFile ? (
                        <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-100">
                            已生成：{expandedFile.name}，文件大小 {formatBytes(expandedFile.size)}
                        </div>
                    ) : null}

                    <div className="mt-auto pt-6">
                        <div className="flex gap-3 rounded-lg border border-stone-200 bg-background p-4 text-sm leading-6 text-stone-600 dark:border-stone-800 dark:bg-stone-950/30 dark:text-stone-300">
                            <Info className="mt-0.5 size-4 shrink-0" />
                            <p>该工具只改变文件体积，不改变图片尺寸和画面内容；目标大小必须大于原图大小。</p>
                        </div>
                    </div>
                </div>
            </div>

            <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/bmp"
                className="hidden"
                onChange={(event) => {
                    pickFile(event.target.files?.[0]);
                    event.target.value = "";
                }}
            />
        </section>
    );
}

function buildExpandedImageBlob(file: File, targetBytes: number) {
    const parts: BlobPart[] = [file];
    let remaining = targetBytes - file.size;
    while (remaining > 0) {
        const size = Math.min(PADDING_CHUNK_BYTES, remaining);
        parts.push(new Uint8Array(size));
        remaining -= size;
    }
    return new Blob(parts, { type: file.type || "application/octet-stream" });
}

function isSupportedImageFile(file: File) {
    if (SUPPORTED_MIME_TYPES.has(file.type.toLowerCase())) return true;
    return /\.(png|jpe?g|webp|bmp)$/i.test(file.name);
}

function formatFileMeta(file: File) {
    return [file.type || "image/*", formatBytes(file.size)].filter(Boolean).join(" · ");
}

function formatMb(bytes: number) {
    if (!bytes) return "0 MB";
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function createOutputFileName(file: File, targetKb: number) {
    const extension = file.name.match(/\.([a-z0-9]+)$/i)?.[1] || imageFileExtension(file.type);
    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    return `${baseName}-memory-${Math.round(targetKb)}kb.${extension}`;
}

function imageFileExtension(mimeType: string) {
    if (mimeType.includes("jpeg")) return "jpg";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("bmp")) return "bmp";
    return "png";
}
