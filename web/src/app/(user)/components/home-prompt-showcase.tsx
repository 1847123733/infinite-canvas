"use client";

import { ArrowUpRight, FolderPlus, ImageIcon, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { App, Image } from "antd";

import { cn } from "@/lib/utils";
import { fetchRandomCreativeWorkshopPrompts, type CreativeWorkshopPrompt } from "@/services/api/creative-workshop";
import { useAssetStore } from "@/stores/use-asset-store";
import { useCloudAuthStore } from "@/stores/use-cloud-auth-store";

const SHOWCASE_COUNT = 12;
const CARD_LAYOUTS = [
    "sm:col-span-2 lg:col-span-3 lg:row-span-2",
    "lg:col-span-2",
    "lg:col-span-1",
    "lg:col-span-1",
    "lg:col-span-2",
    "lg:col-span-2",
    "lg:col-span-2",
    "lg:col-span-2",
    "lg:col-span-1",
    "lg:col-span-2",
    "lg:col-span-1",
    "lg:col-span-2",
] as const;

export function HomePromptShowcase() {
    const cloudBaseUrl = useCloudAuthStore((state) => state.cloudBaseUrl);
    const getValidAccessToken = useCloudAuthStore((state) => state.getValidAccessToken);
    const isCloudReady = useCloudAuthStore((state) => state.isReady);
    const cloudUser = useCloudAuthStore((state) => state.user);
    const [items, setItems] = useState<CreativeWorkshopPrompt[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [refreshKey, setRefreshKey] = useState(0);
    const requestIdRef = useRef(0);
    const canRequest = isCloudReady && Boolean(cloudBaseUrl && cloudUser);

    useEffect(() => {
        if (!canRequest) {
            setItems([]);
            setLoading(false);
            return;
        }

        const loadPrompts = async () => {
            const requestId = ++requestIdRef.current;
            setLoading(true);
            setError("");
            try {
                const token = await getValidAccessToken();
                const nextItems = await fetchRandomCreativeWorkshopPrompts(cloudBaseUrl, token, SHOWCASE_COUNT);
                if (requestId === requestIdRef.current) setItems(nextItems);
            } catch (loadError) {
                if (requestId === requestIdRef.current) setError(loadError instanceof Error ? loadError.message : "提示词加载失败");
            } finally {
                if (requestId === requestIdRef.current) setLoading(false);
            }
        };

        const handlePageShow = () => void loadPrompts();
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") void loadPrompts();
        };

        void loadPrompts();
        window.addEventListener("pageshow", handlePageShow);
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => {
            requestIdRef.current += 1;
            window.removeEventListener("pageshow", handlePageShow);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [canRequest, cloudBaseUrl, getValidAccessToken, refreshKey]);

    return (
        <section className="mx-auto w-full max-w-7xl px-6 pb-20">
            <div className="border-t border-stone-200 pt-8 dark:border-stone-800">
                <div className="relative mb-6 flex flex-col items-center gap-4 sm:min-h-[66px] sm:justify-end">
                    <div className="text-center">
                        <p className="text-xs font-medium tracking-[0.18em] text-stone-400 dark:text-stone-500">PROMPT COLLECTION</p>
                        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-950 dark:text-stone-100">沉淀每一次好灵感</h2>
                        {/* <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">每次回到首页，都会随机换一组值得收藏的提示词。</p> */}
                    </div>
                    <Link href="/creative-workshop" className="group inline-flex shrink-0 self-end items-center gap-1.5 text-sm font-medium text-stone-700 transition hover:text-stone-950 sm:absolute sm:bottom-0 sm:right-0 dark:text-stone-300 dark:hover:text-white">
                        查看提示词库
                        <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </Link>
                </div>

                {!isCloudReady ? <PromptGridSkeleton /> : null}

                {isCloudReady && !cloudUser ? (
                    <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 bg-background/70 px-6 text-center dark:border-stone-700">
                        <ImageIcon className="size-7 text-stone-400" />
                        <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">登录桌面账号后即可浏览随机提示词。</p>
                        <Link href="/login?redirect=/" className="mt-3 text-sm font-medium text-stone-950 underline underline-offset-4 dark:text-stone-100">
                            去登录
                        </Link>
                    </div>
                ) : null}

                {canRequest && loading && !items.length ? <PromptGridSkeleton /> : null}

                {canRequest && items.length ? (
                    <div className="grid auto-rows-[210px] grid-cols-1 gap-3 sm:grid-cols-2 lg:auto-rows-[150px] lg:grid-cols-6">
                        {items.map((item, index) => (
                            <PromptShowcaseCard key={item.id} item={item} index={index} />
                        ))}
                    </div>
                ) : null}

                {canRequest && error && !items.length ? (
                    <button
                        type="button"
                        className="flex min-h-48 w-full flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 bg-background/70 px-6 text-stone-500 transition hover:border-stone-400 hover:text-stone-800 dark:border-stone-700 dark:text-stone-400 dark:hover:border-stone-600 dark:hover:text-stone-200"
                        onClick={() => setRefreshKey((value) => value + 1)}
                    >
                        <RefreshCw className="size-6" />
                        <span className="mt-3 text-sm">{error}，点击重试</span>
                    </button>
                ) : null}
            </div>
        </section>
    );
}

function PromptShowcaseCard({ item, index }: { item: CreativeWorkshopPrompt; index: number }) {
    const { message } = App.useApp();
    const addAsset = useAssetStore((state) => state.addAsset);

    const handleAddAsset = () => {
        addAsset({
            kind: "text",
            title: item.title || "创意工坊提示词",
            coverUrl: item.coverUrl || "",
            tags: item.tags || [],
            source: item.sourceName || "创意工坊",
            note: item.description || undefined,
            data: { content: item.prompt },
            metadata: {
                source: "creative-workshop",
                promptId: item.id,
                sourceId: item.sourceId,
                sourceName: item.sourceName,
                author: item.author,
                sourceUrl: item.sourceUrl,
                sourceCreatedAt: item.sourceCreatedAt,
                imageMode: item.imageMode,
                imageModel: item.imageModel,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,
            },
        });
        message.success("已加入我的素材");
    };

    return (
        <div
            className={cn(
                "group relative min-h-0 overflow-hidden rounded-xl border border-stone-200 bg-stone-100 shadow-sm shadow-stone-950/5 transition duration-300 hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-xl hover:shadow-stone-950/10 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-stone-700 dark:hover:shadow-black/35",
                CARD_LAYOUTS[index],
            )}
        >
            <Image
                src={item.coverUrl}
                alt={item.title || "提示词封面"}
                loading={index < 4 ? "eager" : "lazy"}
                rootClassName="!block !size-full"
                className="!size-full !object-cover transition duration-700 ease-out group-hover:scale-[1.035]"
                preview={{ mask: "点击图片放大" }}
            />
            <button
                type="button"
                className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-1.5 text-[11px] font-medium !text-stone-900 shadow-sm backdrop-blur-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                onClick={handleAddAsset}
            >
                <FolderPlus className="size-3.5" />
                加入资产
            </button>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/15 to-transparent opacity-90 transition group-hover:opacity-100" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3.5 lg:p-4">
                <div className="mb-2 flex flex-wrap gap-1.5">
                    {(item.tags.length ? item.tags : [item.sourceName || "创意工坊"]).slice(0, index === 0 ? 3 : 2).map((tag, tagIndex) => (
                        <span key={`${tag}-${tagIndex}`} className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-stone-800 backdrop-blur-sm">
                            {tag}
                        </span>
                    ))}
                </div>
                <h3 className={cn("line-clamp-1 font-medium tracking-tight text-white", index === 0 ? "text-lg lg:text-xl" : "text-sm")}>{item.title || "未命名提示词"}</h3>
                {/* <p className={cn("mt-1 line-clamp-1 text-center text-white/65", index === 0 ? "text-xs" : "text-[11px]")}>点击图片放大</p> */}
            </div>
        </div>
    );
}

function PromptGridSkeleton() {
    return (
        <div className="grid auto-rows-[210px] grid-cols-1 gap-3 sm:grid-cols-2 lg:auto-rows-[150px] lg:grid-cols-6" aria-label="正在加载提示词">
            {CARD_LAYOUTS.map((layout, index) => (
                <div key={index} className={cn("animate-pulse rounded-xl bg-stone-200/80 dark:bg-stone-800/80", layout)} />
            ))}
        </div>
    );
}
