import axios from "axios";

import { CloudApiError } from "@/services/api/cloud-auth";

type CloudApiResponse<T> = {
    code: number | string;
    data: T;
    message?: string;
    msg?: string;
};

export type CloudGenerationTicketPayload = {
    modelId: string;
    scene: "canvas" | "image_workbench";
    userPrompt: string;
    finalPrompt: string;
    requestMeta?: Record<string, unknown>;
};

export type CloudGenerationTicket = {
    taskId: string;
    ticketId: string;
    ticketToken: string;
    expiresAt: string;
};

function cloudUrl(baseUrl: string, path: string) {
    return `${baseUrl.replace(/\/+$/, "")}/api/infinite-canvas${path}`;
}

export async function createCloudGenerationTicket(baseUrl: string, token: string, payload: CloudGenerationTicketPayload) {
    let response;
    try {
        response = await axios.post<CloudApiResponse<CloudGenerationTicket>>(cloudUrl(baseUrl, "/generation-tickets"), payload, {
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            validateStatus: () => true,
        });
    } catch {
        throw new CloudApiError("云端服务连接失败", 0);
    }

    const data = response.data;
    if (!data || typeof data !== "object") {
        throw new Error("云端服务返回异常");
    }
    if (response.status < 200 || response.status >= 300 || data.code !== 0) {
        throw new CloudApiError(data.message || data.msg || "票据创建失败", response.status, data.code);
    }
    return data.data;
}
