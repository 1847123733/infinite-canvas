import { apiGet, apiPost } from "@/services/api/request";
import type { AdminPublicSettings } from "@/services/api/admin";
import { cloudModelChannel } from "@/services/api/cloud-auth";
import { useCloudAuthStore } from "@/stores/use-cloud-auth-store";

export async function fetchPublicSettings() {
    return apiGet<AdminPublicSettings>("/api/settings");
}

export async function fetchCloudPublicSettings(baseUrl: string, token: string) {
    return cloudModelChannel<AdminPublicSettings>(baseUrl, token);
}

export async function syncDesktopCloudPublicSettings() {
    const token = await useCloudAuthStore.getState().getValidAccessToken();
    if (!token) throw new Error("请先登录云端账号");
    return apiPost<AdminPublicSettings>("/api/v1/settings/model-channel/sync", {}, token);
}
