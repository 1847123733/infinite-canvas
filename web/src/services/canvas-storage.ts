"use client";

import { cleanupUnusedMedia, getMediaStorageStats } from "@/services/file-storage";
import { cleanupUnusedImages, getImageStorageStats } from "@/services/image-storage";

let protectedDataProvider: (() => unknown) | null = null;

export function registerCanvasStorageProtectedData(provider: () => unknown) {
    protectedDataProvider = provider;
    return () => {
        if (protectedDataProvider === provider) protectedDataProvider = null;
    };
}

export function getCanvasStorageProtectedData() {
    return protectedDataProvider?.();
}

export type CanvasStorageStats = {
    managedBytes: number;
    managedFiles: number;
    reclaimableBytes: number;
    reclaimableFiles: number;
    browserUsage: number;
    browserQuota: number;
};

export async function getCanvasStorageStats(usedData: unknown): Promise<CanvasStorageStats> {
    const [images, media, estimate] = await Promise.all([getImageStorageStats(usedData), getMediaStorageStats(usedData), navigator.storage?.estimate?.()]);
    return {
        managedBytes: images.bytes + media.bytes,
        managedFiles: images.files + media.files,
        reclaimableBytes: images.reclaimableBytes + media.reclaimableBytes,
        reclaimableFiles: images.reclaimableFiles + media.reclaimableFiles,
        browserUsage: estimate?.usage || 0,
        browserQuota: estimate?.quota || 0,
    };
}

export async function cleanupUnusedCanvasStorage(usedData: unknown) {
    const [images, media] = await Promise.all([cleanupUnusedImages(usedData), cleanupUnusedMedia(usedData)]);
    return {
        deleted: images.deleted + media.deleted,
        freedBytes: images.freedBytes + media.freedBytes,
    };
}
