"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Alert, App, Button, Empty, Input, Modal, Pagination, Spin, Tag } from "antd";
import { Copy, FolderPlus, LogIn, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";

import { PromptCard } from "./components/prompt-card";
import { useCopyText } from "@/hooks/use-copy-text";
import { cn } from "@/lib/utils";
import { fetchCreativeWorkshopFilterOptions, fetchCreativeWorkshopPrompts, type CreativeWorkshopPrompt } from "@/services/api/creative-workshop";
import { useAssetStore } from "@/stores/use-asset-store";
import { useCloudAuthStore } from "@/stores/use-cloud-auth-store";

const PAGE_SIZE = 24;

export default function CreativeWorkshopPage() {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const addAsset = useAssetStore((state) => state.addAsset);
    const cloudBaseUrl = useCloudAuthStore((state) => state.cloudBaseUrl);
    const getValidAccessToken = useCloudAuthStore((state) => state.getValidAccessToken);
    const isCloudReady = useCloudAuthStore((state) => state.isReady);
    const cloudUser = useCloudAuthStore((state) => state.user);

    const [keyword, setKeyword] = useState("");
    const deferredKeyword = useDeferredValue(keyword.trim());
    const [sourceId, setSourceId] = useState<number>();
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [detailItem, setDetailItem] = useState<CreativeWorkshopPrompt | null>(null);
    const [page, setPage] = useState(1);
    const canRequest = isCloudReady && Boolean(cloudBaseUrl && cloudUser);

    const promptsQuery = useQuery({
        queryKey: ["creative-workshop", "prompts", cloudBaseUrl, deferredKeyword, sourceId, selectedTags, page],
        queryFn: async () =>
            fetchCreativeWorkshopPrompts(cloudBaseUrl, await getValidAccessToken(), {
                page,
                pageSize: PAGE_SIZE,
                keyword: deferredKeyword,
                sourceId,
                tags: selectedTags,
            }),
        enabled: canRequest,
        placeholderData: keepPreviousData,
        retry: false,
    });

    const filtersQuery = useQuery({
        queryKey: ["creative-workshop", "filters", cloudBaseUrl, sourceId],
        queryFn: async () => fetchCreativeWorkshopFilterOptions(cloudBaseUrl, await getValidAccessToken(), sourceId),
        enabled: canRequest,
        placeholderData: keepPreviousData,
        retry: false,
    });

    useEffect(() => {
        if (!promptsQuery.isError) return;
        message.error(promptsQuery.error instanceof Error ? promptsQuery.error.message : "获取创意工坊失败");
    }, [message, promptsQuery.error, promptsQuery.isError]);

    const items = useMemo(() => (promptsQuery.data?.items || []).filter((item) => item.isVisible && item.mark !== 0), [promptsQuery.data?.items]);
    const sources = filtersQuery.data?.sources || [];
    const tags = filtersQuery.data?.tags || [];
    const total = promptsQuery.data?.total || 0;

    const toggleTag = (tag: string) => {
        setPage(1);
        setSelectedTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
    };

    const addToMyAssets = (item: CreativeWorkshopPrompt) => {
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

    if (!isCloudReady) {
        return (
            <div className="flex h-full items-center justify-center">
                <Spin />
            </div>
        );
    }

    if (!cloudBaseUrl || !cloudUser) {
        return (
            <main className="flex h-full items-center justify-center overflow-y-auto bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-6 py-10 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.16)_1px,transparent_1px)]">
                <section className="w-full max-w-md text-center">
                    <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-stone-200 bg-background dark:border-stone-800">
                        <Sparkles className="size-6 text-stone-700 dark:text-stone-300" />
                    </div>
                    <h1 className="mt-5 text-2xl font-semibold tracking-tight text-stone-950 dark:text-stone-100">登录后进入创意工坊</h1>
                    <p className="mt-2 text-sm leading-6 text-stone-500 dark:text-stone-400">浏览精选提示词，并将喜欢的内容保存到我的素材。</p>
                    <Link href="/login?redirect=/creative-workshop">
                        <Button type="primary" className="mt-6" icon={<LogIn className="size-4" />}>
                            登录桌面账号
                        </Button>
                    </Link>
                </section>
            </main>
        );
    }

    return (
        <main className="h-full overflow-y-auto bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] px-5 py-8 [background-size:16px_16px] dark:bg-[radial-gradient(rgba(245,245,244,.16)_1px,transparent_1px)] lg:px-8">
            <header className="mx-auto max-w-7xl text-center">
                <div className="mx-auto flex w-fit items-center gap-2 text-stone-500 dark:text-stone-400">
                    <Sparkles className="size-4" />
                    <span className="text-xs font-medium tracking-[0.18em]">CREATIVE WORKSHOP</span>
                </div>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950 dark:text-stone-100">创意工坊</h1>
                <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">发现灵感，复制提示词，或保存到我的素材继续创作。</p>
            </header>

            <div className="mx-auto mt-8 grid max-w-7xl items-start gap-6 lg:grid-cols-[210px_minmax(0,1fr)]">
                <aside className="space-y-7 lg:sticky lg:top-6">
                    <FilterGroup title="分类">
                        <FilterButton
                            active={sourceId === undefined}
                            label="全部"
                            onClick={() => {
                                setPage(1);
                                setSourceId(undefined);
                                setSelectedTags([]);
                            }}
                        />
                        {sources.map((source) => (
                            <FilterButton
                                key={source.value}
                                active={sourceId === source.value}
                                label={source.label}
                                count={source.count}
                                onClick={() => {
                                    setPage(1);
                                    setSourceId(source.value);
                                    setSelectedTags([]);
                                }}
                            />
                        ))}
                    </FilterGroup>

                    <FilterGroup title="标签">
                        <div className="flex max-h-72 flex-wrap gap-1.5 overflow-y-auto pr-1">
                            <Tag.CheckableTag
                                checked={selectedTags.length === 0}
                                className={cn("prompt-filter-tag", selectedTags.length === 0 && "is-active")}
                                onChange={() => {
                                    setPage(1);
                                    setSelectedTags([]);
                                }}
                            >
                                全部
                            </Tag.CheckableTag>
                            {tags.map((tag) => (
                                <Tag.CheckableTag key={tag} checked={selectedTags.includes(tag)} className={cn("prompt-filter-tag", selectedTags.includes(tag) && "is-active")} onChange={() => toggleTag(tag)}>
                                    {tag}
                                </Tag.CheckableTag>
                            ))}
                        </div>
                    </FilterGroup>
                </aside>

                <section className="min-w-0">
                    <Input
                        size="large"
                        allowClear
                        prefix={<Search className="size-4 text-stone-400" />}
                        value={keyword}
                        placeholder="搜索标题、提示词、作者或标签"
                        onChange={(event) => {
                            setPage(1);
                            setKeyword(event.target.value);
                        }}
                    />

                    {promptsQuery.isError ? (
                        <Alert
                            showIcon
                            type="error"
                            className="mt-5"
                            title="创意工坊加载失败"
                            description={promptsQuery.error instanceof Error ? promptsQuery.error.message : "请稍后重试"}
                            action={
                                <Button size="small" onClick={() => void promptsQuery.refetch()}>
                                    重新加载
                                </Button>
                            }
                        />
                    ) : null}

                    {promptsQuery.isLoading ? (
                        <div className="flex min-h-96 items-center justify-center">
                            <Spin />
                        </div>
                    ) : (
                        <>
                            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                {items.map((item) => (
                                    <PromptCard key={item.id} item={item} onCopy={(prompt) => copyText(prompt.prompt, "提示词已复制")} onAdd={addToMyAssets} onDetail={setDetailItem} />
                                ))}
                            </div>

                            {!items.length && !promptsQuery.isError ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到符合条件的提示词" className="py-24" /> : null}

                            {total > PAGE_SIZE ? (
                                <div className="mt-8 flex justify-center pb-2">
                                    <Pagination current={page} pageSize={PAGE_SIZE} total={total} showSizeChanger={false} showTotal={(value) => `共 ${value} 条`} onChange={setPage} />
                                </div>
                            ) : null}
                        </>
                    )}
                </section>
            </div>

            <Modal
                title="提示词详情"
                open={Boolean(detailItem)}
                centered
                width={720}
                onCancel={() => setDetailItem(null)}
                footer={
                    detailItem ? (
                        <div className="flex justify-end gap-2">
                            <Button icon={<Copy className="size-4" />} onClick={() => copyText(detailItem.prompt, "提示词已复制")}>
                                复制提示词
                            </Button>
                            <Button type="primary" icon={<FolderPlus className="size-4" />} onClick={() => addToMyAssets(detailItem)}>
                                加入资产
                            </Button>
                        </div>
                    ) : null
                }
            >
                {detailItem ? (
                    <div className="space-y-4">
                        <div>
                            <h2 className="text-lg font-semibold text-stone-950 dark:text-stone-100">{detailItem.title || "未命名提示词"}</h2>
                            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                                {[detailItem.sourceName, detailItem.author].filter(Boolean).join(" · ") || "创意工坊"}
                            </p>
                        </div>
                        {detailItem.description ? <p className="text-sm leading-6 text-stone-600 dark:text-stone-300">{detailItem.description}</p> : null}
                        <div className="max-h-80 overflow-y-auto rounded-lg border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-900/60">
                            <p className="text-xs font-medium text-stone-400">提示词正文</p>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-700 dark:text-stone-200">{detailItem.prompt || "暂无提示词内容"}</p>
                        </div>
                        {detailItem.tags.length ? (
                            <div className="flex flex-wrap gap-1.5">
                                {detailItem.tags.map((tag) => (
                                    <Tag key={tag} className="m-0">
                                        {tag}
                                    </Tag>
                                ))}
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </Modal>
        </main>
    );
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div>
            <h2 className="mb-2 px-2 text-xs font-medium text-stone-400 dark:text-stone-500">{title}</h2>
            <div className="space-y-0.5">{children}</div>
        </div>
    );
}

function FilterButton({ active, label, count, onClick }: { active: boolean; label: string; count?: number; onClick: () => void }) {
    return (
        <button
            type="button"
            className={cn(
                "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition",
                active ? "bg-stone-950 !text-white dark:bg-stone-100 dark:!text-stone-950" : "text-stone-600 hover:bg-stone-100 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100",
            )}
            onClick={onClick}
        >
            <span className="truncate">{label}</span>
            {count !== undefined ? <span className={cn("shrink-0 text-[11px]", active ? "text-white/65 dark:text-stone-950/55" : "text-stone-400")}>{count}</span> : null}
        </button>
    );
}
