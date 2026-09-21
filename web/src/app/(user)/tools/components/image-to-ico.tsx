"use client";

import { App, Button, InputNumber, Tag } from "antd";
import { AppWindow, CheckCircle2, Download, Grid2X2, Info, WandSparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { ConverterFilePicker } from "@/app/(user)/tools/components/converter-file-picker";
import { createIco, ICO_SIZES, imageFileName, type ConvertedFile, validateImageFile } from "@/app/(user)/tools/utils/image-converter";
import { saveConvertedFile } from "@/app/(user)/tools/utils/save-converted-file";
import { formatBytes } from "@/lib/image-utils";
import { cn } from "@/lib/utils";

const ICO_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/x-icon", "image/vnd.microsoft.icon", "image/webp"]);

type IcoResult = ConvertedFile & { sizes: number[] };

export function ImageToIco() {
    const { message } = App.useApp();
    const [file, setFile] = useState<File | null>(null);
    const [selectedSizes, setSelectedSizes] = useState<number[]>([...ICO_SIZES]);
    const [customSize, setCustomSize] = useState<number | null>(null);
    const [result, setResult] = useState<IcoResult | null>(null);
    const [converting, setConverting] = useState(false);
    const [saving, setSaving] = useState(false);
    const outputSizes = useMemo(() => [...new Set([...selectedSizes, ...(customSize ? [customSize] : [])])].sort((a, b) => a - b), [customSize, selectedSizes]);

    const pickFile = (nextFile?: File) => {
        if (!nextFile) return;
        const error = validateImageFile(nextFile, ICO_MIME_TYPES, /\.(png|jpe?g|ico|webp)$/i);
        if (error) {
            message.error(error === "不支持该图片格式" ? "请选择 PNG、JPG、JPEG、ICO 或 WEBP 图片" : error);
            return;
        }
        setFile(nextFile);
        setResult(null);
    };

    const toggleSize = (size: number) => {
        setSelectedSizes((current) => (current.includes(size) ? current.filter((item) => item !== size) : [...current, size]));
        setResult(null);
    };

    const convert = async () => {
        if (!file || !outputSizes.length) return;
        setConverting(true);
        try {
            const blob = await createIco(file, outputSizes);
            setResult({ blob, name: imageFileName(file, "ico"), sizes: outputSizes });
            message.success("ICO 图标已生成");
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
            if (await saveConvertedFile(result.blob, result.name, "ico", "ICO 图标")) message.success("文件已保存");
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
                        <AppWindow className="size-4" />
                        本地图标工具
                    </div>
                    <h2 className="mt-2 text-2xl font-semibold tracking-normal text-stone-950 dark:text-stone-100">图片转 ICO 图标</h2>
                </div>
                <Tag className="m-0 w-fit rounded-full px-3 py-1 text-xs">PNG / JPG / ICO / WEBP · 最大 10 MB</Tag>
            </div>

            <div className="grid min-h-[540px] gap-0 lg:grid-cols-[minmax(300px,42%)_minmax(0,1fr)]">
                <div className="border-b border-stone-200 p-5 lg:border-b-0 lg:border-r dark:border-stone-800">
                    <ConverterFilePicker file={file} accept="image/png,image/jpeg,image/x-icon,image/vnd.microsoft.icon,image/webp,.png,.jpg,.jpeg,.ico,.webp" hint="上传不超过 10 MB 的图片，多个尺寸会合并进同一个 ICO 文件。" onPick={pickFile} onClear={clear} />
                </div>

                <div className="flex min-w-0 flex-col p-5">
                    <div className="rounded-lg border border-stone-200 bg-stone-50 p-5 dark:border-stone-800 dark:bg-stone-950/50">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-sm font-semibold text-stone-950 dark:text-stone-100"><Grid2X2 className="size-4" />图标尺寸</div>
                            <div className="flex gap-3 text-xs">
                                <button type="button" className="text-stone-600 hover:text-stone-950 dark:text-stone-400 dark:hover:text-stone-100" onClick={() => { setSelectedSizes([...ICO_SIZES]); setResult(null); }}>全选</button>
                                <button type="button" className="text-stone-600 hover:text-stone-950 dark:text-stone-400 dark:hover:text-stone-100" onClick={() => { setSelectedSizes([]); setResult(null); }}>清空</button>
                            </div>
                        </div>

                        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
                            {ICO_SIZES.map((size) => {
                                const selected = selectedSizes.includes(size);
                                return (
                                    <button
                                        key={size}
                                        type="button"
                                        aria-pressed={selected}
                                        className={cn(
                                            "rounded-md border px-2 py-2.5 text-xs font-medium transition",
                                            selected
                                                ? "border-stone-950 bg-stone-950 dark:border-stone-100 dark:bg-stone-100"
                                                : "border-stone-200 bg-background hover:border-stone-400 dark:border-stone-700 dark:bg-stone-900",
                                        )}
                                        onClick={() => toggleSize(size)}
                                    >
                                        <span className={selected ? "text-white dark:text-stone-950" : "text-stone-600 dark:text-stone-300"}>{size}×{size}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-stone-200 pt-4 dark:border-stone-800">
                            <label htmlFor="custom-ico-size" className="text-sm font-medium text-stone-700 dark:text-stone-300">自定义</label>
                            <InputNumber
                                id="custom-ico-size"
                                className="!w-28"
                                min={1}
                                max={256}
                                precision={0}
                                placeholder="1 - 256"
                                value={customSize}
                                onChange={(value) => {
                                    setCustomSize(typeof value === "number" && value >= 1 && value <= 256 ? Math.round(value) : null);
                                    setResult(null);
                                }}
                            />
                            <span className="text-xs text-stone-500 dark:text-stone-400">输入后自动加入，最大 256×256</span>
                        </div>
                        <div className="mt-4 text-xs text-stone-500 dark:text-stone-400">将写入 {outputSizes.length} 个尺寸：{outputSizes.length ? outputSizes.join("、") : "请至少选择一个尺寸"}</div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                        <Button type="primary" size="large" disabled={!file || !outputSizes.length} loading={converting} icon={<WandSparkles className="size-4" />} onClick={convert}>
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
                            <div><div className="font-medium">转换完成</div><div className="mt-1 opacity-80">{result.name} · {result.sizes.length} 个尺寸 · {formatBytes(result.blob.size)}</div></div>
                        </div>
                    ) : null}

                    <div className="mt-auto pt-6">
                        <div className="flex gap-3 rounded-lg border border-stone-200 bg-background p-4 text-sm leading-6 text-stone-600 dark:border-stone-800 dark:bg-stone-950/30 dark:text-stone-300">
                            <Info className="mt-0.5 size-4 shrink-0" />
                            <p>非正方形图片会按原比例居中缩放，空白区域保持透明。全部转换均在当前设备完成。</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
