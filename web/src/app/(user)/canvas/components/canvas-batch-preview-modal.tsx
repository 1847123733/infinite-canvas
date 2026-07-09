"use client";

import { Button, Modal } from "antd";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasNodeData } from "../types";

export function CanvasBatchPreviewModal({ nodes, index, open, onIndexChange, onClose }: { nodes: CanvasNodeData[]; index: number; open: boolean; onIndexChange: (index: number) => void; onClose: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const safeIndex = nodes.length ? Math.min(index, nodes.length - 1) : 0;
    const node = nodes[safeIndex];
    const canSwitch = nodes.length > 1;
    const content = node?.metadata?.content;
    const switchImage = (step: number) => {
        if (!nodes.length) return;
        onIndexChange((safeIndex + step + nodes.length) % nodes.length);
    };
    const title = (
        <div className="flex items-center justify-between gap-4 pr-10">
            <span>批量查看大图</span>
            {nodes.length ? (
                <span className="text-xs font-normal" style={{ color: theme.node.muted }}>
                    {safeIndex + 1} / {nodes.length}
                </span>
            ) : null}
        </div>
    );

    return (
        <Modal className="canvas-batch-preview-modal" title={title} open={open && Boolean(content)} centered footer={null} width="min(92vw, 1180px)" onCancel={onClose} styles={{ body: { padding: 0 }, content: { overflow: "hidden" } }}>
            {content ? (
                <div className="relative flex h-[78vh] min-h-[420px] w-full items-center justify-center overflow-hidden p-4 sm:p-6" style={{ background: theme.node.panel, color: theme.node.text }}>
                    {canSwitch ? (
                        <Button
                            type="text"
                            shape="circle"
                            aria-label="上一张"
                            icon={<ChevronLeft className="size-5" />}
                            className="!absolute left-3 top-1/2 z-10 !h-11 !w-11 -translate-y-1/2 backdrop-blur"
                            style={{ background: theme.toolbar.panel, border: `1px solid ${theme.toolbar.border}`, color: theme.node.text }}
                            onClick={() => switchImage(-1)}
                        />
                    ) : null}
                    <img src={content} alt={node.title || "图片"} className="max-h-full max-w-full object-contain" draggable={false} />
                    {canSwitch ? (
                        <Button
                            type="text"
                            shape="circle"
                            aria-label="下一张"
                            icon={<ChevronRight className="size-5" />}
                            className="!absolute right-3 top-1/2 z-10 !h-11 !w-11 -translate-y-1/2 backdrop-blur"
                            style={{ background: theme.toolbar.panel, border: `1px solid ${theme.toolbar.border}`, color: theme.node.text }}
                            onClick={() => switchImage(1)}
                        />
                    ) : null}
                </div>
            ) : null}
        </Modal>
    );
}
