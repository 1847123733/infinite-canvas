export const STORAGE_QUOTA_ERROR_MESSAGE = "本地存储空间不足，请清理画布缓存后重试";
export const STORAGE_ERROR_EVENT = "infinite-canvas:storage-error";

export function isStorageQuotaError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const value = error as { name?: string; code?: number; cause?: unknown };
    return value.name === "QuotaExceededError" || value.name === "NS_ERROR_DOM_QUOTA_REACHED" || value.code === 22 || value.code === 1014 || isStorageQuotaError(value.cause);
}

export function normalizeStorageError(error: unknown) {
    return isStorageQuotaError(error) ? new Error(STORAGE_QUOTA_ERROR_MESSAGE, { cause: error }) : error instanceof Error ? error : new Error("本地文件保存失败");
}

export function reportStorageError(error: unknown) {
    const normalized = normalizeStorageError(error);
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT, { detail: normalized.message }));
    return normalized;
}