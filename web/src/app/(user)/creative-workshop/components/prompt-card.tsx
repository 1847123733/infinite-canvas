"use client";

import { Button, Image, Tag } from "antd";
import { Copy, FolderPlus, ImageIcon } from "lucide-react";

import type { CreativeWorkshopPrompt } from "@/services/api/creative-workshop";

type PromptCardProps = {
    item: CreativeWorkshopPrompt;
    onAdd: (item: CreativeWorkshopPrompt) => void;
    onCopy: (item: CreativeWorkshopPrompt) => void;
    onDetail: (item: CreativeWorkshopPrompt) => void;
};

export function PromptCard({ item, onAdd, onCopy, onDetail }: PromptCardProps) {
    return (
        <article className="group flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-stone-200/90 bg-background transition duration-200 hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-lg hover:shadow-stone-950/5 dark:border-stone-800 dark:hover:border-stone-700 dark:hover:shadow-black/20">
            <div className="relative aspect-[16/10] overflow-hidden bg-stone-100 dark:bg-stone-900">
                {item.coverUrl ? (
                    <Image
                        src={item.coverUrl}
                        alt={item.title}
                        loading="lazy"
                        rootClassName="!block !size-full"
                        className="!size-full !object-cover transition duration-500 group-hover:scale-[1.025]"
                        preview={{ mask: "点击图片放大" }}
                    />
                ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-2 text-stone-400 dark:text-stone-600">
                        <ImageIcon className="size-8 stroke-[1.25]" />
                        <span className="text-xs">暂无封面</span>
                    </div>
                )}
                <div className="pointer-events-none absolute left-3 top-3 max-w-[calc(100%-24px)] truncate rounded-md bg-black/65 px-2 py-1 text-[11px] text-white backdrop-blur-sm">{item.sourceName || "创意工坊"}</div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col p-4">
                <button type="button" className="rounded-md text-left outline-none transition hover:opacity-70 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 dark:focus-visible:ring-stone-600" onClick={() => onDetail(item)}>
                    <span className="line-clamp-1 text-[15px] font-semibold tracking-tight text-stone-950 dark:text-stone-100">{item.title || "未命名提示词"}</span>
                    <span className="mt-2 line-clamp-4 text-xs leading-5 text-stone-500 dark:text-stone-400">{item.prompt || item.description || "暂无提示词内容"}</span>
                </button>

                <div className="mt-3 flex min-h-6 flex-wrap content-start gap-1.5">
                    {item.tags.slice(0, 3).map((tag) => (
                        <Tag key={tag} className="m-0 max-w-full truncate text-[11px]">
                            {tag}
                        </Tag>
                    ))}
                    {item.tags.length > 3 ? <span className="self-center text-[11px] text-stone-400">+{item.tags.length - 3}</span> : null}
                </div>

                <div className="mt-auto flex items-center gap-2 border-t border-stone-100 pt-4 dark:border-stone-800">
                    <Button size="small" type="text" icon={<Copy className="size-3.5" />} onClick={() => onCopy(item)}>
                        复制
                    </Button>
                    <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => onAdd(item)}>
                        加入资产
                    </Button>
                </div>
            </div>
        </article>
    );
}
