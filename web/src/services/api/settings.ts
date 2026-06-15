import { apiGet, apiPost } from "@/services/api/request";
import type { AdminPublicSettings } from "@/services/api/admin";

export async function fetchPublicSettings() {
    return apiGet<AdminPublicSettings>("/api/settings");
}

export async function syncCloudControlledSettings() {
    return apiPost<AdminPublicSettings>("/api/settings/cloud-sync");
}
