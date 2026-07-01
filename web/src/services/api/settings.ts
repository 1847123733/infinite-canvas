import { apiGet } from "@/services/api/request";
import type { AdminPublicSettings } from "@/services/api/admin";
import { cloudModelChannel } from "@/services/api/cloud-auth";

export async function fetchPublicSettings() {
    return apiGet<AdminPublicSettings>("/api/settings");
}

export async function fetchCloudPublicSettings(baseUrl: string, token: string) {
    return cloudModelChannel<AdminPublicSettings>(baseUrl, token);
}
