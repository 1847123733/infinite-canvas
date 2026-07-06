import axios from "axios";

import { ensureRemoteAuthToken, withRemoteAuthRetry } from "@/services/api/ai-auth";
import type { AiConfig } from "@/stores/use-config-store";

export type PSDTaskStatus = "pending" | "running" | "success" | "failed";

export type PSDTaskFile = {
    name: "source" | "preview" | "psd" | "zip" | "manifest" | "config";
    url: string;
};

export type PSDTask = {
    id: string;
    status: PSDTaskStatus;
    sourceName: string;
    model: string;
    startedAt: string;
    finishedAt: string;
    error: string;
    files: PSDTaskFile[];
};

type ApiEnvelope<T> = {
    code: number;
    data: T;
    msg: string;
};

const remoteConfig = { channelMode: "remote" } as AiConfig;

export async function createPSDTask(file: File) {
    const body = new FormData();
    body.append("image", file, file.name);
    return withRemoteAuthRetry(remoteConfig, async () => {
        const token = await ensureRemoteAuthToken(remoteConfig);
        const response = await axios.post<ApiEnvelope<PSDTask>>("/api/v1/psd-tasks", body, { headers: { Authorization: `Bearer ${token}` } });
        return unwrapEnvelope(response.data, "创建 PSD 任务失败");
    });
}

export async function fetchPSDTask(id: string) {
    return withRemoteAuthRetry(remoteConfig, async () => {
        const token = await ensureRemoteAuthToken(remoteConfig);
        const response = await axios.get<ApiEnvelope<PSDTask>>(`/api/v1/psd-tasks/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } });
        return unwrapEnvelope(response.data, "读取 PSD 任务失败");
    });
}

export async function fetchPSDTaskFile(url: string) {
    return withRemoteAuthRetry(remoteConfig, async () => {
        const token = await ensureRemoteAuthToken(remoteConfig);
        const response = await axios.get<Blob>(url, { headers: { Authorization: `Bearer ${token}` }, responseType: "blob" });
        return response.data;
    });
}

function unwrapEnvelope<T>(payload: ApiEnvelope<T>, fallback: string) {
    if (!payload || typeof payload !== "object") throw new Error(fallback);
    if (payload.code !== 0) throw new Error(payload.msg || fallback);
    return payload.data;
}
