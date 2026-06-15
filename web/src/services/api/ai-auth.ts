import { useCloudAuthStore } from "@/stores/use-cloud-auth-store";
import type { AiConfig } from "@/stores/use-config-store";

export function remoteAuthToken() {
    return useCloudAuthStore.getState().accessToken;
}

export function refreshRemoteUser(config: AiConfig) {
    if (config.channelMode !== "remote") return;
    void useCloudAuthStore.getState().validateSession();
}
