"use client";

import { useQuery } from "@tanstack/react-query";
import { Button, Descriptions, Empty, Input, Modal, Spin, Tag, Tooltip, Typography } from "antd";
import { BookOpenText, ChevronDown, ExternalLink, Eye, ImageIcon, PanelLeftClose, Plus, RefreshCw, Search } from "lucide-react";
import { memo, useDeferredValue, useMemo, useState, useTransition, type CSSProperties } from "react";

import { canvasThemes } from "@/lib/canvas-theme";
import { fetchAllCreativeWorkshopPrompts, fetchCreativeWorkshopFilterOptions, type CreativeWorkshopPrompt } from "@/services/api/creative-workshop";
import { useCloudAuthStore } from "@/stores/use-cloud-auth-store";
import { useThemeStore } from "@/stores/use-theme-store";

type CanvasPromptLibraryPanelProps = {
    onCollapse: () => void;
    onInsert: (item: CreativeWorkshopPrompt) => void;
};

type PromptGroup = {
    id: number;
    name: string;
    order: number;
    items: CreativeWorkshopPrompt[];
};

const rowRenderStyle = { contentVisibility: "auto", containIntrinsicSize: "64px" } as CSSProperties;

export function CanvasPromptLibraryPanel({ onCollapse, onInsert }: CanvasPromptLibraryPanelProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const cloudBaseUrl = useCloudAuthStore((state) => state.cloudBaseUrl);
    const cloudUser = useCloudAuthStore((state) => state.user);
    const isCloudReady = useCloudAuthStore((state) => state.isReady);
    const getValidAccessToken = useCloudAuthStore((state) => state.getValidAccessToken);
    const [keyword, setKeyword] = useState("");
    const deferredKeyword = useDeferredValue(keyword.trim().toLocaleLowerCase());
    const [openSources, setOpenSources] = useState<Set<number>>(() => new Set());
    const [, startGroupTransition] = useTransition();
    const [previewItem, setPreviewItem] = useState<CreativeWorkshopPrompt | null>(null);
    const [detailItem, setDetailItem] = useState<CreativeWorkshopPrompt | null>(null);
    const canRequest = isCloudReady && Boolean(cloudBaseUrl && cloudUser);

    const query = useQuery({
        queryKey: ["creative-workshop", "canvas-library", cloudBaseUrl, cloudUser?.id],
        queryFn: async () => {
            const token = await getValidAccessToken();
            const [items, filters] = await Promise.all([fetchAllCreativeWorkshopPrompts(cloudBaseUrl, token), fetchCreativeWorkshopFilterOptions(cloudBaseUrl, token)]);
            return { items, sources: filters.sources };
        },
        enabled: canRequest,
        staleTime: 5 * 60_000,
        retry: false,
    });

    const sourceOrder = useMemo(() => new Map((query.data?.sources || []).map((source, index) => [source.value, index])), [query.data?.sources]);
    const searchIndex = useMemo(
        () =>
            (query.data?.items || []).map((item) => ({
                item,
                text: [item.title, item.prompt, item.description, item.author, item.sourceName, item.tags.join(" ")].join("\n").toLocaleLowerCase(),
            })),
        [query.data?.items],
    );
    const groups = useMemo(() => {
        const grouped = new Map<number, PromptGroup>();
        for (const entry of searchIndex) {
            if (deferredKeyword && !entry.text.includes(deferredKeyword)) continue;
            const item = entry.item;
            const group = grouped.get(item.sourceId);
            if (group) group.items.push(item);
            else grouped.set(item.sourceId, { id: item.sourceId, name: item.sourceName || "其他来源", order: sourceOrder.get(item.sourceId) ?? Number.MAX_SAFE_INTEGER, items: [item] });
        }
        return Array.from(grouped.values()).sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
    }, [deferredKeyword, searchIndex, sourceOrder]);
    const resultCount = useMemo(() => groups.reduce((count, group) => count + group.items.length, 0), [groups]);

    const toggleSource = (sourceId: number) => {
        startGroupTransition(() => {
            setOpenSources((current) => {
                const next = new Set(current);
                if (next.has(sourceId)) next.delete(sourceId);
                else next.add(sourceId);
                return next;
            });
        });
    };

    const panelStyle = {
        background: theme.node.panel,
        borderColor: theme.node.stroke,
        color: theme.node.text,
        "--prompt-hover": theme.toolbar.itemHover,
    } as CSSProperties;

    return (
        <aside className="flex h-full w-[340px] shrink-0 flex-col border-r" style={panelStyle}>
            <header className="flex h-16 shrink-0 items-center justify-between border-b px-4" style={{ borderColor: theme.node.stroke }}>
                <div className="flex min-w-0 items-center gap-2.5">
                    <BookOpenText className="size-4.5 shrink-0" />
                    <div className="min-w-0">
                        <h2 className="text-sm font-semibold leading-5">提示词库</h2>
                        <div className="truncate text-[11px]" style={{ color: theme.node.muted }}>
                            {query.data ? `${query.data.items.length} 条提示词` : "创意工坊"}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <Tooltip title="刷新提示词">
                        <Button
                            type="text"
                            className="!h-8 !w-8 !min-w-8 !p-0"
                            disabled={!canRequest}
                            loading={query.isFetching}
                            icon={<RefreshCw className="size-4" />}
                            style={{ color: theme.node.muted }}
                            aria-label="刷新提示词"
                            onClick={() => void query.refetch()}
                        />
                    </Tooltip>
                    <Tooltip title="收起提示词库">
                        <Button type="text" className="!h-8 !w-8 !min-w-8 !p-0" icon={<PanelLeftClose className="size-4" />} style={{ color: theme.node.muted }} aria-label="收起提示词库" onClick={onCollapse} />
                    </Tooltip>
                </div>
            </header>

            <div className="shrink-0 p-3 pb-2">
                <Input allowClear value={keyword} prefix={<Search className="size-3.5" style={{ color: theme.node.faint }} />} placeholder="前端搜索提示词" onChange={(event) => setKeyword(event.target.value)} />
                {query.data ? (
                    <div className="mt-2 px-1 text-[11px]" style={{ color: theme.node.muted }}>
                        {deferredKeyword ? `找到 ${resultCount} 条结果` : ""}
                    </div>
                ) : null}
            </div>

            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                {!isCloudReady || (canRequest && query.isLoading) ? (
                    <div className="flex h-40 items-center justify-center">
                        <Spin size="small" />
                    </div>
                ) : !canRequest ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请先登录桌面账号" className="py-14" />
                ) : query.isError ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={query.error instanceof Error ? query.error.message : "提示词加载失败"} className="py-14">
                        <Button size="small" onClick={() => void query.refetch()}>
                            重新加载
                        </Button>
                    </Empty>
                ) : groups.length ? (
                    groups.map((group) => {
                        const expanded = Boolean(deferredKeyword) || openSources.has(group.id);
                        return (
                            <section key={group.id} className="mb-1">
                                <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-[var(--prompt-hover)]" onClick={() => toggleSource(group.id)}>
                                    <ChevronDown className={`size-3.5 shrink-0 transition-transform ${expanded ? "" : "-rotate-90"}`} />
                                    <BookOpenText className="size-3.5 shrink-0" />
                                    <span className="min-w-0 flex-1 truncate text-xs font-semibold">{group.name}</span>
                                    <span className="text-[11px] tabular-nums" style={{ color: theme.node.faint }}>
                                        {group.items.length}
                                    </span>
                                </button>
                                {expanded ? (
                                    <div className="pb-1">
                                        {group.items.map((item) => (
                                            <PromptLibraryRow key={item.id} item={item} theme={theme} onPreview={setPreviewItem} onDetail={setDetailItem} onInsert={onInsert} />
                                        ))}
                                    </div>
                                ) : null}
                            </section>
                        );
                    })
                ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到提示词" className="py-14" />
                )}
            </div>

            <Modal
                title={previewItem?.title || "提示词封面"}
                open={Boolean(previewItem?.coverUrl)}
                centered
                footer={null}
                width="min(900px, 92vw)"
                onCancel={() => setPreviewItem(null)}
                styles={{ body: { padding: 0, display: "flex", justifyContent: "center", maxHeight: "78vh" } }}
            >
                {previewItem?.coverUrl ? <img src={previewItem.coverUrl} alt={previewItem.title} className="max-h-[78vh] max-w-full object-contain" /> : null}
            </Modal>

            <PromptDetailModal item={detailItem} onClose={() => setDetailItem(null)} />
        </aside>
    );
}

const PromptLibraryRow = memo(function PromptLibraryRow({
    item,
    theme,
    onPreview,
    onDetail,
    onInsert,
}: {
    item: CreativeWorkshopPrompt;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onPreview: (item: CreativeWorkshopPrompt) => void;
    onDetail: (item: CreativeWorkshopPrompt) => void;
    onInsert: (item: CreativeWorkshopPrompt) => void;
}) {
    return (
        <div className="group flex min-h-16 items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-[var(--prompt-hover)]" style={rowRenderStyle}>
            <button
                type="button"
                className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg border"
                style={{ borderColor: theme.node.stroke, background: theme.node.fill }}
                onClick={() => item.coverUrl && onPreview(item)}
                aria-label={item.coverUrl ? `放大${item.title}封面` : `${item.title}暂无封面`}
            >
                {item.coverUrl ? <img src={item.coverUrl} alt="" loading="lazy" className="size-full object-cover" /> : <ImageIcon className="size-4" style={{ color: theme.node.faint }} />}
            </button>
            <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium leading-5">{item.title || "未命名提示词"}</div>
                <div className="truncate text-[11px] leading-4" style={{ color: theme.node.muted }}>
                    {item.prompt || item.description || "暂无内容"}
                </div>
            </div>
            <div className="flex shrink-0 flex-col items-center gap-0.5">
                <Tooltip title="查看提示词详情" placement="right">
                    <Button type="text" className="!h-6 !w-6 !min-w-6 !p-0" icon={<Eye className="size-3.5" />} style={{ color: theme.node.muted }} aria-label={`查看${item.title}详情`} onClick={() => onDetail(item)} />
                </Tooltip>
                <Tooltip title="插入画布" placement="right">
                    <Button type="text" className="!h-6 !w-6 !min-w-6 !p-0" icon={<Plus className="size-3.5" />} style={{ color: theme.node.muted }} aria-label={`将${item.title}插入画布`} onClick={() => onInsert(item)} />
                </Tooltip>
            </div>
        </div>
    );
});

function PromptDetailModal({ item, onClose }: { item: CreativeWorkshopPrompt | null; onClose: () => void }) {
    return (
        <Modal title="提示词详情" open={Boolean(item)} centered footer={null} width={720} onCancel={onClose}>
            {item ? (
                <div className="space-y-4">
                    <div>
                        <Typography.Title level={4} className="!mb-1">
                            {item.title || "未命名提示词"}
                        </Typography.Title>
                        <Typography.Text type="secondary">{item.description || "暂无说明"}</Typography.Text>
                    </div>
                    <div className="rounded-lg border p-4" style="height: 200, overflow: auto">
                        <Typography.Text type="secondary" className="text-xs">
                            提示词正文
                        </Typography.Text>
                        <Typography.Paragraph className="!mb-0 !mt-2 whitespace-pre-wrap leading-6">{item.prompt || "暂无内容"}</Typography.Paragraph>
                    </div>
                    {item.tags.length ? (
                        <div className="flex flex-wrap gap-1.5">
                            {item.tags.map((tag) => (
                                <Tag key={tag} className="m-0">
                                    {tag}
                                </Tag>
                            ))}
                        </div>
                    ) : null}
                    <Descriptions
                        size="small"
                        column={2}
                        items={[
                            { key: "source", label: "来源", children: item.sourceName || "-" },
                            { key: "author", label: "作者", children: item.author || "-" },
                            { key: "mode", label: "图片模式", children: item.imageMode || "-" },
                            { key: "model", label: "图片模型", children: item.imageModel || "-" },
                            { key: "created", label: "来源时间", children: item.sourceCreatedAt || "-" },
                            {
                                key: "url",
                                label: "原始地址",
                                children: item.sourceUrl ? (
                                    <Button type="link" size="small" className="!h-auto !p-0" href={item.sourceUrl} target="_blank" icon={<ExternalLink className="size-3.5" />}>
                                        打开来源
                                    </Button>
                                ) : (
                                    "-"
                                ),
                            },
                        ]}
                    />
                </div>
            ) : null}
        </Modal>
    );
}
