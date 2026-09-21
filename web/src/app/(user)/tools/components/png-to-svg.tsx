"use client";

import { App, Button, Tag } from "antd";
import { CheckCircle2, Download, FileCode2, Info, WandSparkles } from "lucide-react";
import { useState } from "react";

import { ConverterFilePicker } from "@/app/(user)/tools/components/converter-file-picker";
import { createEmbeddedSvg, imageFileName, type ConvertedFile, validateImageFile } from "@/app/(user)/tools/utils/image-converter";
import { saveConvertedFile } from "@/app/(user)/tools/utils/save-converted-file";
import { formatBytes } from "@/lib/image-utils";

const PNG_MIME_TYPES = new Set(["image/png"]);

type SvgResult = ConvertedFile & { width: number; height: number };

export function PngToSvg() {
    const { message } = App.useApp();
    const [file, setFile] = useState<File | null>(null);
    const [result, setResult] = useState<SvgResult | null>(null);
    const [converting, setConverting] = useState(false);
    const [saving, setSaving] = useState(false);

    const pickFile = (nextFile?: File) => {
        if (!nextFile) return;
        const error = validateImageFile(nextFile, PNG_MIME_TYPES, /\.png$/i);
        if (error) {
            message.error(error === "不支持该图片格式" ? "请选择 PNG 图片" : error);
            return;
        }
        setFile(nextFile);
        setResult(null);
    };

    const convert = async () => {
        if (!file) return;
        setConverting(true);
        try {
            const converted = await createEmbeddedSvg(file);
            setResult({ ...converted, name: imageFileName(file, "svg") });
            message.success("SVG 已生成");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "转换失败");
        } finally {
            setConverting(false);
        }
    };

    const save = async () => {
        if (!result) return;
        setSaving(true);
        try {
            if (await saveConvertedFile(result.blob, result.name, "svg", "SVG 图片")) message.success("文件已保存");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存文件失败");
        } finally {
            setSaving(false);
        }
    };

    const clear = () => {
        setFile(null);
        setResult(null);
    };

    return (
        <section className="min-w-0 overflow-hidden rounded-lg border border-stone-200 bg-background/95 shadow-sm shadow-stone-200/70 backdrop-blur dark:border-stone-800 dark:shadow-none">
            <div className="flex flex-col gap-3 border-b border-stone-200 px-5 py-4 sm:flex-row sm:items-start sm:justify-between dark:border-stone-800">
                <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-stone-500 dark:text-stone-400">
                        <FileCode2 className="size-4" />
                        本地格式转换
                    </div>
                    <h2 className="mt-2 text-2xl font-semibold tracking-normal text-stone-950 dark:text-stone-100">PNG 转 SVG</h2>
                </div>
                <Tag className="m-0 w-fit rounded-full px-3 py-1 text-xs">PNG · 最大 10 MB</Tag>
            </div>

            <div className="grid min-h-[470px] gap-0 lg:grid-cols-[minmax(300px,42%)_minmax(0,1fr)]">
                <div className="border-b border-stone-200 p-5 lg:border-b-0 lg:border-r dark:border-stone-800">
                    <ConverterFilePicker file={file} accept="image/png,.png" hint="上传不超过 10 MB 的 PNG，转换过程不会上传到服务器。" onPick={pickFile} onClear={clear} />
                </div>

                <div className="flex min-w-0 flex-col p-5">
                    <div className="rounded-lg border border-stone-200 bg-stone-50 p-5 dark:border-stone-800 dark:bg-stone-950/50">
                        <h3 className="text-sm font-semibold text-stone-950 dark:text-stone-100">输出设置</h3>
                        <div className="mt-4 grid gap-3 text-sm text-stone-500 dark:text-stone-400">
                            <div className="flex items-center justify-between gap-4"><span>输出格式</span><span className="font-medium text-stone-800 dark:text-stone-200">SVG</span></div>
                            <div className="flex items-center justify-between gap-4"><span>图片尺寸</span><span className="font-medium text-stone-800 dark:text-stone-200">保持原始尺寸</span></div>
                            <div className="flex items-center justify-between gap-4"><span>透明背景</span><span className="font-medium text-stone-800 dark:text-stone-200">保留</span></div>
                        </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                        <Button type="primary" size="large" disabled={!file} loading={converting} icon={<WandSparkles className="size-4" />} onClick={convert}>
                            开始转换
                        </Button>
                        {result ? (
                            <Button size="large" loading={saving} icon={<Download className="size-4" />} onClick={save}>
                                选择位置并保存
                            </Button>
                        ) : null}
                    </div>

                    {result ? (
                        <div className="mt-5 flex gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-100">
                            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                            <div><div className="font-medium">转换完成</div><div className="mt-1 opacity-80">{result.name} · {result.width} × {result.height} · {formatBytes(result.blob.size)}</div></div>
                        </div>
                    ) : null}

                    <div className="mt-auto pt-6">
                        <div className="flex gap-3 rounded-lg border border-stone-200 bg-background p-4 text-sm leading-6 text-stone-600 dark:border-stone-800 dark:bg-stone-950/30 dark:text-stone-300">
                            <Info className="mt-0.5 size-4 shrink-0" />
                            <p>为保持原图细节，此工具会把 PNG 无损嵌入 SVG 容器，不会将位图自动描摹为矢量路径。</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
