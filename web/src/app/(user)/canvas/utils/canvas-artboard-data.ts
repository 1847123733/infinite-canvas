import { FabricImage, type Canvas, type StaticCanvas, type FabricObject } from "fabric";
import { resolveImageUrl } from "@/services/image-storage";
import type { CanvasArtboardData, CanvasArtboardObject } from "../types";

export type ArtboardImageSource = { id: string; url: string; storageKey?: string };
export type ArtboardFabricObject = FabricObject & { storageKey?: string; sourceNodeId?: string };
export const ARTBOARD_OBJECT_PROPERTIES = ["storageKey", "sourceNodeId"];

export function serializeArtboardScene(canvas: Canvas): CanvasArtboardData["scene"] {
    const scene = canvas.toObject(ARTBOARD_OBJECT_PROPERTIES);
    const clean = (object: CanvasArtboardObject): CanvasArtboardObject => {
        const next = { ...object };
        if (next.storageKey) delete next.src;
        if (next.objects) next.objects = next.objects.map(clean);
        return next;
    };
    return { version: scene.version, objects: scene.objects.map(clean) };
}

export async function restoreArtboardScene(scene: CanvasArtboardData["scene"], signal: AbortSignal) {
    const restore = async (object: CanvasArtboardObject): Promise<CanvasArtboardObject> => {
        const next = { ...object };
        if (next.storageKey) {
            next.src = await resolveImageUrl(next.storageKey, next.src);
            if (!next.src) throw new Error("画布中的图片文件已丢失");
        }
        if (next.objects) next.objects = await Promise.all(next.objects.map(restore));
        signal.throwIfAborted();
        return next;
    };
    return { ...scene, objects: await Promise.all(scene.objects.map(restore)) };
}

export async function syncArtboardImages(canvas: StaticCanvas, sources: ArtboardImageSource[], imported: string[], width: number, height: number, signal: AbortSignal) {
    const objects = canvas.getObjects() as ArtboardFabricObject[];
    const updates = await Promise.all(
        sources.map(async (source, index) => {
            const existing = objects.find((object) => object.sourceNodeId === source.id);
            if (!existing && imported.includes(source.id)) return null;
            const url = await resolveImageUrl(source.storageKey, source.url);
            if (existing instanceof FabricImage && existing.getSrc() === url) return null;
            const image = await FabricImage.fromURL(url, { signal, crossOrigin: "anonymous" });
            return { source, existing, image, index };
        }),
    );
    signal.throwIfAborted();
    for (const update of updates) {
        if (!update) continue;
        const { source, existing, image, index } = update;
        if (existing instanceof FabricImage) {
            const scaledWidth = existing.getScaledWidth();
            const scaledHeight = existing.getScaledHeight();
            existing.setElement(image.getElement());
            existing.set({ scaleX: scaledWidth / image.width, scaleY: scaledHeight / image.height });
            Object.assign(existing, { storageKey: source.storageKey });
            existing.setCoords();
        } else {
            const scale = Math.min((width * 0.65) / image.width, (height * 0.65) / image.height);
            image.set({ originX: "center", originY: "center", left: width * (0.5 + (index % 4) * 0.04), top: height * (0.5 + (index % 4) * 0.04), scaleX: scale, scaleY: scale });
            Object.assign(image, { sourceNodeId: source.id, storageKey: source.storageKey });
            canvas.add(image);
        }
    }
    canvas.requestRenderAll();
    return sources.map((source) => source.id);
}
