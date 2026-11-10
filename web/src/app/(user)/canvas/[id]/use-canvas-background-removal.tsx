"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "antd";

import { deleteStoredImages, getImageBlob, uploadImage, type UploadedImage } from "@/services/image-storage";
import { isStorageQuotaError } from "@/services/storage-error";
import type { CanvasNodeData } from "../types";

const MAX_CONCURRENT_REMOVALS = 3;
type RemovalStatus = "queued" | "processing";
type RemovalTask = { node: CanvasNodeData; controller: AbortController; status: RemovalStatus };

export function useCanvasBackgroundRemoval(projectId: string, onComplete: (node: CanvasNodeData, image: UploadedImage) => void) {
    const { message } = App.useApp();
    const tasks = useRef(new Map<string, RemovalTask>());
    const [statuses, setStatuses] = useState<Record<string, RemovalStatus>>({});
    const messagePrefix = `canvas-background-removal-${projectId}`;
    const updateStatuses = useCallback(() => {
        setStatuses(Object.fromEntries([...tasks.current].map(([id, task]) => [id, task.status])));
    }, []);

    useEffect(() => {
        setStatuses({});
        const currentTasks = tasks.current;
        return () => {
            for (const [id, task] of currentTasks) {
                task.controller.abort();
                message.destroy(`${messagePrefix}-${id}`);
            }
            currentTasks.clear();
        };
    }, [message, messagePrefix]);

    const showTaskProgress = useCallback(
        (task: RemovalTask, content: string) => {
            const { node, controller } = task;
            if (controller.signal.aborted) return;
            const key = `${messagePrefix}-${node.id}`;
            message.open({
                key,
                type: "loading",
                duration: 0,
                content: (
                    <span className="inline-flex items-center gap-3">
                        {node.title || "图片"}：{content}
                        <button
                            type="button"
                            className="cursor-pointer opacity-60 hover:opacity-100"
                            onClick={() => {
                                controller.abort();
                                message.destroy(key);
                                if (task.status === "queued" && tasks.current.get(node.id) === task) {
                                    tasks.current.delete(node.id);
                                    updateStatuses();
                                }
                            }}
                        >
                            取消
                        </button>
                    </span>
                ),
            });
        },
        [message, messagePrefix, updateStatuses],
    );

    const runTask = useCallback(
        async (task: RemovalTask) => {
            const { node, controller } = task;
            const messageKey = `${messagePrefix}-${node.id}`;
            task.status = "processing";
            updateStatuses();
            let lastProgress = "";
            const showProgress = (content: string) => {
                if (content === lastProgress || controller.signal.aborted) return;
                lastProgress = content;
                showTaskProgress(task, content);
            };

            try {
                if (!node.metadata?.content) return;
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
                if (tasks.current.get(node.id) !== task) return;
                if (controller.signal.aborted || isStorageQuotaError(error)) message.destroy(messageKey);
                else message.error({ key: messageKey, content: error instanceof Error ? error.message : "抠图失败，请重试", duration: 6 });
            } finally {
                if (tasks.current.get(node.id) === task) {
                    tasks.current.delete(node.id);
                    updateStatuses();
                }
            }
        },
        [message, messagePrefix, onComplete, showTaskProgress, updateStatuses],
    );

    useEffect(() => {
        let running = [...tasks.current.values()].filter((task) => task.status === "processing").length;
        for (const task of tasks.current.values()) {
            if (running >= MAX_CONCURRENT_REMOVALS) break;
            if (task.status !== "queued") continue;
            running++;
            void runTask(task);
        }
    }, [statuses, runTask]);

    const removeBackground = useCallback(
        (node: CanvasNodeData) => {
            if (!node.metadata?.content || tasks.current.has(node.id)) return;
            const task: RemovalTask = { node, controller: new AbortController(), status: "queued" };
            tasks.current.set(node.id, task);
            updateStatuses();
            showTaskProgress(task, "等待抠图");
        },
        [showTaskProgress, updateStatuses],
    );

    return { removeBackground, statuses };
}
