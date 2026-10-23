"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "antd";

import { deleteStoredImages, getImageBlob, uploadImage, type UploadedImage } from "@/services/image-storage";
import { isStorageQuotaError } from "@/services/storage-error";
import type { CanvasNodeData } from "../types";

export function useCanvasBackgroundRemoval(projectId: string, onComplete: (node: CanvasNodeData, image: UploadedImage) => void) {
    const { message } = App.useApp();
    const active = useRef<AbortController | null>(null);
    const [busy, setBusy] = useState(false);
    const messageKey = `canvas-background-removal-${projectId}`;

    useEffect(() => {
        setBusy(false);
        return () => {
            active.current?.abort();
            active.current = null;
            message.destroy(messageKey);
        };
    }, [projectId, message, messageKey]);

    const removeBackground = useCallback(
        async (node: CanvasNodeData) => {
            if (!node.metadata?.content || active.current) return;
            const controller = new AbortController();
            active.current = controller;
            setBusy(true);
            let lastProgress = "";
            const showProgress = (content: string) => {
                if (content === lastProgress || controller.signal.aborted) return;
                lastProgress = content;
                message.open({
                    key: messageKey,
                    type: "loading",
                    duration: 0,
                    content: (
                        <span className="inline-flex items-center gap-3">
                            {content}
                            <button type="button" className="cursor-pointer opacity-60 hover:opacity-100" onClick={() => controller.abort()}>
                                取消
                            </button>
                        </span>
                    ),
                });
            };

            try {
                showProgress("正在读取图片");
                let source = node.metadata.storageKey ? await getImageBlob(node.metadata.storageKey) : null;
                if (!source) {
                    const response = await fetch(node.metadata.content, { signal: controller.signal });
                    if (!response.ok) throw new Error("读取图片失败");
                    source = await response.blob();
                }
                controller.signal.throwIfAborted();
                const { removeImageBackground } = await import("../utils/canvas-background-removal");
                const result = await removeImageBackground(source, { signal: controller.signal, onProgress: showProgress });
                controller.signal.throwIfAborted();
                const image = await uploadImage(result);
                if (controller.signal.aborted) {
                    await deleteStoredImages([image.storageKey]);
                    return;
                }
                onComplete(node, image);
                message.success({ key: messageKey, content: "已生成透明背景图片" });
            } catch (error) {
                if (controller.signal.aborted || isStorageQuotaError(error)) message.destroy(messageKey);
                else message.error({ key: messageKey, content: error instanceof Error ? error.message : "抠图失败，请重试", duration: 6 });
            } finally {
                if (active.current === controller) {
                    active.current = null;
                    setBusy(false);
                }
            }
        },
        [message, messageKey, onComplete],
    );

    return { removeBackground, busy };
}
