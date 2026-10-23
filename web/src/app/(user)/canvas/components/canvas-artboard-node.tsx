"use client";

import { useRef, type KeyboardEvent } from "react";
import { App, Button, ColorPicker, InputNumber, Modal, Switch, Tooltip } from "antd";
import { AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter, Copy, Download, Frame, Layers2, Minus, Plus, Redo2, SendToBack, Trash2, Type, Undo2 } from "lucide-react";
import { ActiveSelection, IText } from "fabric";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { exportArtboardPng, runArtboardAction, type ArtboardAction } from "../utils/canvas-artboard-actions";
import type { ArtboardImageSource } from "../utils/canvas-artboard-data";
import type { CanvasArtboardData, CanvasNodeData } from "../types";
import { useArtboardEditor } from "./use-artboard-editor";

type ArtboardNodeProps = {
    node: CanvasNodeData;
    sources: ArtboardImageSource[];
    onChange: (data: CanvasArtboardData) => void;
    onActivate: () => void;
    expanded: boolean;
    onClose: () => void;
};

export function CanvasArtboardNode({ node, sources, onChange, onActivate, expanded, onClose }: ArtboardNodeProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const data = node.metadata!.artboard!;
    return (
        <div className="flex h-full w-full min-w-0 flex-col" style={{ color: theme.node.text }}>
            <div className="flex h-10 shrink-0 items-center justify-between gap-2 px-3" style={{ background: theme.node.panel }}>
                <span className="flex min-w-0 items-center gap-2 text-xs">
                    <Frame className="size-3.5 shrink-0" />
                    <span className="truncate">自定义画布</span>
                    <span className="opacity-45">
                        {data.width} × {data.height}
                    </span>
                </span>
            </div>
            {expanded ? <div className="grid flex-1 place-items-center text-sm opacity-50">正在弹窗中编辑</div> : <ArtboardSurface data={data} sources={sources} onChange={onChange} onActivate={onActivate} />}
            {/* Portal 事件仍会冒泡到节点，避免弹窗操作触发画布拖动。 */}
            <div onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                <Modal title={`自定义画布 · ${data.width} × ${data.height} px`} open={expanded} onCancel={onClose} footer={null} width="92vw" centered destroyOnHidden styles={{ body: { height: "75vh" } }}>
                    {expanded ? <ArtboardSurface data={data} sources={sources} onChange={onChange} onActivate={onActivate} /> : null}
                </Modal>
            </div>
        </div>
    );
}

const tools = [
    { action: "text", label: "添加文字", icon: Type },
    { action: "copy", label: "复制（Ctrl+C）", icon: Copy },
    { action: "front", label: "置于顶层", icon: Layers2 },
    { action: "back", label: "置于底层", icon: SendToBack },
    { action: "centerX", label: "水平居中", icon: AlignHorizontalJustifyCenter },
    { action: "centerY", label: "垂直居中", icon: AlignVerticalJustifyCenter },
    { action: "delete", label: "删除图层", icon: Trash2 },
] as const;

function ArtboardSurface({ data, sources, onChange, onActivate }: { data: CanvasArtboardData; sources: ArtboardImageSource[]; onChange: (data: CanvasArtboardData) => void; onActivate: () => void }) {
    const element = useRef<HTMLCanvasElement>(null);
    const viewport = useRef<HTMLDivElement>(null);
    const root = useRef<HTMLDivElement>(null);
    const { message } = App.useApp();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { canvas, ready, error, zoom, setZoom, scale, commit, undo } = useArtboardEditor(element, viewport, data, sources, onChange);
    const active = canvas?.getActiveObject();
    const selectedText = active instanceof IText ? active : null;

    const perform = async (action: ArtboardAction) => {
        if (!canvas || !ready) return;
        try {
            await runArtboardAction(canvas, action, data.width, data.height, theme.node.text);
            commit();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "画布操作失败");
        }
    };

    const setBackground = (background: string) => {
        if (!canvas || !ready) return;
        canvas.backgroundColor = background;
        canvas.requestRenderAll();
        commit();
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        event.stopPropagation();
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || (event.target as Element).closest("[contenteditable='true']")) return;
        if (!canvas || !ready || selectedText?.isEditing) return;
        const key = event.key.toLowerCase();
        if (event.ctrlKey || event.metaKey) {
            if (key === "c" || key === "v") {
                event.preventDefault();
                void perform(key === "c" ? "copy" : "paste");
            } else if (key === "a") {
                event.preventDefault();
                canvas.discardActiveObject();
                canvas.setActiveObject(new ActiveSelection(canvas.getObjects(), { canvas }));
                canvas.requestRenderAll();
            } else if (key === "z" || key === "y") {
                event.preventDefault();
                undo(key === "y" || event.shiftKey);
            }
            return;
        }
        if (key === "delete" || key === "backspace") {
            event.preventDefault();
            void perform("delete");
        } else if (key.startsWith("arrow") && active) {
            event.preventDefault();
            const step = event.shiftKey ? 10 : 1;
            active.set({ left: active.left + (key === "arrowleft" ? -step : key === "arrowright" ? step : 0), top: active.top + (key === "arrowup" ? -step : key === "arrowdown" ? step : 0) });
            active.setCoords();
            canvas.requestRenderAll();
            commit();
        }
    };

    return (
        <div
            ref={root}
            className="flex h-full min-h-0 w-full flex-1 cursor-default flex-col outline-none"
            tabIndex={0}
            data-canvas-no-zoom
            onKeyDown={handleKeyDown}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => {
                event.stopPropagation();
                onActivate();
                if (!(event.target as Element).closest("button,input,textarea,.ant-color-picker-trigger")) root.current?.focus({ preventScroll: true });
            }}
            onWheel={(event) => event.stopPropagation()}
            onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
            }}
        >
            <div className="flex shrink-0 flex-wrap items-center gap-0.5 px-2 py-1" style={{ background: theme.node.panel }}>
                {tools.map(({ action, label, icon: Icon }) => (
                    <Tooltip key={action} title={label}>
                        <Button type="text" size="small" disabled={!ready} icon={<Icon className="size-3.5" />} onClick={() => void perform(action)} aria-label={label} />
                    </Tooltip>
                ))}
                <Tooltip title="粘贴（Ctrl+V）">
                    <Button type="text" size="small" disabled={!ready} onClick={() => void perform("paste")}>
                        粘贴
                    </Button>
                </Tooltip>
                <Button type="text" size="small" disabled={!ready} icon={<Undo2 className="size-3.5" />} onClick={() => undo()} aria-label="撤销" />
                <Button type="text" size="small" disabled={!ready} icon={<Redo2 className="size-3.5" />} onClick={() => undo(true)} aria-label="重做" />
                <span className="mx-1 h-4 w-px" style={{ background: theme.node.stroke }} />
                <span className="mr-1 text-xs opacity-55">透明</span>
                <Switch size="small" checked={!data.background} disabled={!ready} onChange={(transparent) => setBackground(transparent ? "" : "#ffffff")} />
                <ColorPicker size="small" disabled={!ready} value={data.background || "transparent"} onChangeComplete={(color) => setBackground(color.toRgb().a === 0 ? "" : color.toRgbString())} />
                {selectedText ? (
                    <>
                        <InputNumber
                            size="small"
                            className="!w-16"
                            min={1}
                            max={2048}
                            value={selectedText.fontSize}
                            onChange={(value) => {
                                if (value) {
                                    selectedText.set("fontSize", value);
                                    selectedText.setCoords();
                                    canvas?.requestRenderAll();
                                    commit();
                                }
                            }}
                        />
                        <ColorPicker
                            size="small"
                            value={typeof selectedText.fill === "string" ? selectedText.fill : theme.node.text}
                            onChangeComplete={(color) => {
                                selectedText.set("fill", color.toRgbString());
                                canvas?.requestRenderAll();
                                commit();
                            }}
                        />
                    </>
                ) : null}
                <div className="ml-auto flex items-center">
                    <Button type="text" size="small" icon={<Minus className="size-3.5" />} disabled={zoom <= 0.25} onClick={() => setZoom(Math.max(0.25, zoom / 1.25))} aria-label="缩小编辑视图" />
                    <button type="button" className="min-w-10 cursor-pointer text-xs opacity-60" onClick={() => setZoom(1)} title="适应画布">
                        {Math.round(scale * 100)}%
                    </button>
                    <Button type="text" size="small" icon={<Plus className="size-3.5" />} disabled={zoom >= 8} onClick={() => setZoom(Math.min(8, zoom * 1.25))} aria-label="放大编辑视图" />
                    <Tooltip title="按原始像素导出 PNG">
                        <Button
                            type="text"
                            size="small"
                            disabled={!ready}
                            icon={<Download className="size-3.5" />}
                            onClick={() => {
                                if (canvas) void exportArtboardPng(canvas, data.width, data.height).catch((error) => message.error(error instanceof Error ? error.message : "导出失败"));
                            }}
                            aria-label="导出 PNG"
                        />
                    </Tooltip>
                </div>
            </div>
            <div ref={viewport} className="min-h-0 flex-1 overflow-auto" style={{ background: theme.canvas.background }}>
                <div className="grid min-h-full min-w-full place-items-center p-4">
                    <div
                        className="relative shrink-0"
                        style={{ backgroundColor: theme.node.panel, backgroundImage: `repeating-conic-gradient(${theme.node.stroke} 0% 25%, transparent 0% 50%)`, backgroundSize: "20px 20px", boxShadow: `0 0 0 1px ${theme.node.stroke}` }}
                    >
                        <canvas ref={element} />
                        {!data.scene.objects.length && !sources.length ? (
                            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center" style={{ color: theme.node.muted }}>
                                <Frame className="size-8 opacity-50" />
                                <span className="text-xs">
                                    将图片接线到画布左侧
                                    <br />
                                    拖动、缩放、旋转，自由排版
                                </span>
                            </div>
                        ) : null}
                        {!ready ? (
                            <div className="absolute inset-0 grid place-items-center text-xs backdrop-blur-sm" style={{ color: theme.node.text }}>
                                {error || "正在加载画布…"}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
}
