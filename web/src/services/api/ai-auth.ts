import { useCloudAuthStore } from "@/stores/use-cloud-auth-store";
import type { AiConfig } from "@/stores/use-config-store";

export function remoteAuthToken() {
    return useCloudAuthStore.getState().accessToken;
}

export async function ensureRemoteAuthToken(config: AiConfig) {
    if (config.channelMode !== "remote") return "";
    return useCloudAuthStore.getState().getValidAccessToken();
}

export async function withRemoteAuthRetry<T>(config: AiConfig, request: () => Promise<T>) {
    try {
        return await request();
    } catch (error) {
        if (config.channelMode !== "remote" || !isRemoteAuthExpired(error)) throw error;
        await useCloudAuthStore.getState().refreshSession();
        return request();
    }
}

export function refreshRemoteUser(config: AiConfig) {
    if (config.channelMode !== "remote") return;
    void useCloudAuthStore.getState().validateSession();
}

function isRemoteAuthExpired(error: unknown) {
    if (error instanceof Error && error.message.includes("未登录或权限不足")) return true;
    const maybeAxios = error as { response?: { status?: number; data?: { msg?: string; message?: string } } };
    const status = maybeAxios.response?.status;
    if (status === 401) return true;
    const message = maybeAxios.response?.data?.msg || maybeAxios.response?.data?.message || "";
    return message.includes("未登录或权限不足") || message.includes("访问令牌已过期");
}
