"use client";

import { Button } from "antd";
import { FileImage, ImagePlus, RefreshCcw, Upload } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";

import { formatBytes } from "@/lib/image-utils";
import { cn } from "@/lib/utils";

type Props = {
    file: File | null;
    accept: string;
    hint: string;
    onPick: (file?: File) => void;
    onClear: () => void;
};

export function ConverterFilePicker({ file, accept, hint, onPick, onClear }: Props) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [previewUrl, setPreviewUrl] = useState("");
    const [dragging, setDragging] = useState(false);

    useEffect(() => {
        if (!file) {
            setPreviewUrl("");
            return;
        }
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    const onDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDragging(false);
        onPick(event.dataTransfer.files?.[0]);
    };

    return (
        <div>
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
                            <img src={previewUrl} alt={file?.name || "待转换图片"} className="max-h-[280px] max-w-full rounded-md object-contain shadow-sm shadow-stone-300/80 dark:shadow-none" />
                        </div>
                        <div className="border-t border-stone-200 bg-background/95 p-4 dark:border-stone-800">
                            <div className="flex min-w-0 items-start gap-3">
                                <FileImage className="mt-0.5 size-5 shrink-0 text-stone-500 dark:text-stone-400" />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium text-stone-950 dark:text-stone-100">{file?.name}</div>
                                    <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">{file ? `${file.type || "image/*"} · ${formatBytes(file.size)}` : ""}</div>
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
                        <span className="mt-2 max-w-xs text-sm leading-6 text-stone-500 dark:text-stone-400">{hint}</span>
                    </button>
                )}
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
                <Button icon={<Upload className="size-4" />} onClick={() => inputRef.current?.click()}>
                    {file ? "重新上传" : "添加图片"}
                </Button>
                {file ? (
                    <Button icon={<RefreshCcw className="size-4" />} onClick={onClear}>
                        清空
                    </Button>
                ) : null}
            </div>

            <input
                ref={inputRef}
                type="file"
                accept={accept}
                className="hidden"
                onChange={(event) => {
                    onPick(event.target.files?.[0]);
                    event.target.value = "";
                }}
            />
        </div>
    );
}
