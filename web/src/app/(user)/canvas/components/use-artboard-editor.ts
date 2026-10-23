"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Canvas } from "fabric";
import { App } from "antd";
import { restoreArtboardScene, serializeArtboardScene, syncArtboardImages, type ArtboardImageSource } from "../utils/canvas-artboard-data";
import type { CanvasArtboardData } from "../types";

export function useArtboardEditor(element: RefObject<HTMLCanvasElement | null>, viewport: RefObject<HTMLDivElement | null>, data: CanvasArtboardData, sources: ArtboardImageSource[], onChange: (data: CanvasArtboardData) => void) {
    const { message } = App.useApp();
    const [canvas, setCanvas] = useState<Canvas | null>(null);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState("");
    const [, setSelectionRevision] = useState(0);
    const [zoom, setZoom] = useState(1);
    const [scale, setScale] = useState(1);
    const latest = useRef({ data, onChange });
    latest.current = { data, onChange };
    const paused = useRef(true);
    const lastSaved = useRef("");
    const imported = useRef(data.importedSources);
    const operationAbort = useRef<AbortController | null>(null);
    const lastSources = useRef<string | null>(null);
    const history = useRef<{ past: CanvasArtboardData[]; future: CanvasArtboardData[] }>({ past: [], future: [] });
    const currentData = useRef(data);
    const applyingHistory = useRef(false);

    const commit = useCallback(() => {
        if (!canvas || canvas.disposed || paused.current) return;
        const next = { ...latest.current.data, background: String(canvas.backgroundColor || ""), scene: serializeArtboardScene(canvas), importedSources: imported.current };
        const serialized = JSON.stringify(next);
        if (serialized === lastSaved.current) return;
        history.current.past = [...history.current.past.slice(-49), currentData.current];
        history.current.future = [];
        currentData.current = next;
        lastSaved.current = serialized;
        latest.current.onChange(next);
        setSelectionRevision((value) => value + 1);
    }, [canvas]);

    useEffect(() => {
        if (!element.current) return;
        const instance = new Canvas(element.current, { preserveObjectStacking: true, selection: true, enableRetinaScaling: true });
        setCanvas(instance);
        return () => {
            paused.current = true;
            operationAbort.current?.abort();
            void instance.dispose();
        };
    }, [element]);

    useEffect(() => {
        if (!canvas) return;
        const updateSelection = () => setSelectionRevision((value) => value + 1);
        const disposers = [canvas.on("object:modified", commit), canvas.on("text:changed", commit), canvas.on("selection:created", updateSelection), canvas.on("selection:updated", updateSelection), canvas.on("selection:cleared", updateSelection)];
        return () => disposers.forEach((dispose) => dispose());
    }, [canvas, commit]);

    const sourceSignature = JSON.stringify(sources);
    useEffect(() => {
        const serialized = JSON.stringify(data);
        const needsLoad = serialized !== lastSaved.current;
        if (!canvas || (!needsLoad && sourceSignature === lastSources.current)) return;
        operationAbort.current?.abort();
        const controller = new AbortController();
        operationAbort.current = controller;
        paused.current = true;
        canvas.discardActiveObject();
        setReady(false);
        setError("");
        let sceneLoaded = !needsLoad;
        void (async () => {
            try {
                if (needsLoad) {
                    if (!applyingHistory.current) history.current = { past: [], future: [] };
                    applyingHistory.current = false;
                    const scene = await restoreArtboardScene(data.scene, controller.signal);
                    await canvas.loadFromJSON(scene, undefined, { signal: controller.signal });
                    controller.signal.throwIfAborted();
                    canvas.backgroundColor = data.background;
                    imported.current = data.importedSources;
                    currentData.current = data;
                    lastSaved.current = serialized;
                    sceneLoaded = true;
                }
                // 场景恢复与接线导入串行执行，撤销或切换场景时统一取消旧操作。
                imported.current = await syncArtboardImages(canvas, sources, imported.current, data.width, data.height, controller.signal);
                controller.signal.throwIfAborted();
                lastSources.current = sourceSignature;
                paused.current = false;
                commit();
                canvas.requestRenderAll();
            } catch (error) {
                if (!controller.signal.aborted) {
                    const details = error instanceof Error ? error.message : "自定义画布加载失败";
                    setError(details);
                    message.error(details);
                }
            } finally {
                if (!controller.signal.aborted) {
                    paused.current = !sceneLoaded;
                    setReady(sceneLoaded);
                }
            }
        })();
        return () => controller.abort();
        // 图片布局变化不重复导入，只有场景、接线或图片内容变化才同步。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canvas, data, sourceSignature, commit, message]);

    useEffect(() => {
        if (!canvas || !viewport.current) return;
        const container = viewport.current;
        const resize = () => {
            const fit = Math.min(Math.max(32, container.clientWidth - 32) / data.width, Math.max(32, container.clientHeight - 32) / data.height);
            const nextScale = fit * zoom;
            canvas.setDimensions({ width: Math.max(1, Math.round(data.width * nextScale)), height: Math.max(1, Math.round(data.height * nextScale)) });
            canvas.setViewportTransform([nextScale, 0, 0, nextScale, 0, 0]);
            canvas.calcOffset();
            setScale(nextScale);
        };
        const observer = new ResizeObserver(resize);
        observer.observe(container);
        resize();
        return () => observer.disconnect();
    }, [canvas, viewport, data.width, data.height, zoom]);

    const undo = (redo = false) => {
        if (!ready) return;
        const from = redo ? history.current.future : history.current.past;
        const to = redo ? history.current.past : history.current.future;
        const next = from.pop();
        if (!next) return;
        to.push(currentData.current);
        currentData.current = next;
        applyingHistory.current = true;
        lastSaved.current = "";
        latest.current.onChange(next);
    };

    return { canvas, ready, error, zoom, setZoom, scale, commit, undo };
}
