"use client";

import { useEffect, useRef } from "react";

import { fetchPSDTask } from "@/services/api/psd";
import { notifyGlobal } from "@/stores/use-global-notification-store";
import { useCloudAuthStore } from "@/stores/use-cloud-auth-store";
import { usePSDTaskStore } from "@/stores/use-psd-task-store";

const runningStatuses = new Set(["pending", "running"]);
const PSD_TASK_POLL_INTERVAL = 3000;

export function PSDTaskWatcher() {
    const hydrated = usePSDTaskStore((state) => state.hydrated);
    const tasks = usePSDTaskStore((state) => state.tasks);
    const upsertTask = usePSDTaskStore((state) => state.upsertTask);
    const accessToken = useCloudAuthStore((state) => state.accessToken);
    const previousStatusRef = useRef<Record<string, string>>({});
    const tasksRef = useRef(tasks);

    useEffect(() => {
        tasksRef.current = tasks;
        for (const task of tasks) {
            previousStatusRef.current[task.id] ||= task.status;
        }
    }, [tasks]);

    useEffect(() => {
        if (!hydrated || !accessToken) return;

        let stopped = false;
        const poll = async () => {
            const runningTasks = tasksRef.current.filter((task) => runningStatuses.has(task.status));
            if (!runningTasks.length) return;
            await Promise.all(
                runningTasks.map(async (task) => {
                    try {
                        const next = await fetchPSDTask(task.id);
                        if (stopped) return;
                        const prevStatus = previousStatusRef.current[next.id] || task.status;
                        previousStatusRef.current[next.id] = next.status;
                        upsertTask(next);
                        if (runningStatuses.has(prevStatus) && next.status === "success") {
                            notifyGlobal({ type: "success", title: "PSD 任务已完成", description: next.sourceName });
                        } else if (runningStatuses.has(prevStatus) && next.status === "failed") {
                            notifyGlobal({ type: "error", title: "PSD 任务失败", description: next.error || next.sourceName });
                        } else if (runningStatuses.has(prevStatus) && next.status === "canceled") {
                            notifyGlobal({ type: "info", title: "PSD 任务已终止", description: next.sourceName });
                        }
                    } catch {
                        // 轮询失败通常是会话刷新或本地服务重启，下一轮继续尝试。
                    }
                }),
            );
        };

        const timer = window.setInterval(() => void poll(), PSD_TASK_POLL_INTERVAL);
        return () => {
            stopped = true;
            window.clearInterval(timer);
        };
    }, [accessToken, hydrated, upsertTask]);

    return null;
}
