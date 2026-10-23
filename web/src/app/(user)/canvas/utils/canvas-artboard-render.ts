import { StaticCanvas } from "fabric";
import { restoreArtboardScene, syncArtboardImages, type ArtboardImageSource } from "./canvas-artboard-data";
import type { CanvasArtboardData } from "../types";

export async function renderArtboardImage(data: CanvasArtboardData, sources: ArtboardImageSource[]) {
    const canvas = new StaticCanvas(document.createElement("canvas"), { width: data.width, height: data.height, enableRetinaScaling: false, renderOnAddRemove: false });
    const signal = AbortSignal.timeout(30_000);
    try {
        await canvas.loadFromJSON(await restoreArtboardScene(data.scene, signal), undefined, { signal });
        await syncArtboardImages(canvas, sources, data.importedSources, data.width, data.height, signal);
        canvas.backgroundColor = data.background;
        canvas.renderAll();
        return await new Promise<Blob>((resolve, reject) => canvas.getElement().toBlob((blob) => (blob ? resolve(blob) : reject(new Error("自定义画布转为图片失败"))), "image/png"));
    } finally {
        await canvas.dispose();
    }
}
