import { ActiveSelection, Point, Textbox, type Canvas, type FabricObject } from "fabric";
import { saveAs } from "file-saver";
import { ARTBOARD_OBJECT_PROPERTIES, type ArtboardFabricObject } from "./canvas-artboard-data";

let clipboard: FabricObject | null = null;

export type ArtboardAction = "copy" | "paste" | "delete" | "text" | "front" | "back" | "centerX" | "centerY";

export async function runArtboardAction(canvas: Canvas, action: ArtboardAction, width: number, height: number, textColor: string) {
    const active = canvas.getActiveObject();
    if (action === "copy") {
        if (active) clipboard = await active.clone(ARTBOARD_OBJECT_PROPERTIES);
        return;
    }
    if (action === "paste") {
        if (!clipboard) return;
        const clone = await clipboard.clone(ARTBOARD_OBJECT_PROPERTIES);
        if (canvas.disposed || canvas.destroyed) return;
        canvas.discardActiveObject();
        clone.set({ left: clone.left + 20, top: clone.top + 20, evented: true });
        if (clone instanceof ActiveSelection) {
            clone.canvas = canvas;
            clone.forEachObject((object) => {
                delete (object as ArtboardFabricObject).sourceNodeId;
                canvas.add(object);
            });
        } else {
            delete (clone as ArtboardFabricObject).sourceNodeId;
            canvas.add(clone);
        }
        canvas.setActiveObject(clone);
        clone.setCoords();
        clipboard.set({ left: clipboard.left + 20, top: clipboard.top + 20 });
    } else if (action === "text") {
        const text = new Textbox("双击编辑文字", { left: width / 2, top: height / 2, originX: "center", originY: "center", width: width * 0.6, fontSize: Math.max(12, Math.round(width * 0.05)), fill: textColor, textAlign: "center" });
        canvas.add(text);
        canvas.setActiveObject(text);
    } else if (action === "delete") {
        const objects = canvas.getActiveObjects();
        canvas.discardActiveObject();
        canvas.remove(...objects);
    } else if (action === "front" || action === "back") {
        const objects = canvas.getActiveObjects();
        if (action === "back") objects.reverse();
        objects.forEach((object) => (action === "front" ? canvas.bringObjectToFront(object) : canvas.sendObjectToBack(object)));
    } else if (active) {
        const center = active.getCenterPoint();
        active.setPositionByOrigin(new Point(action === "centerX" ? width / 2 : center.x, action === "centerY" ? height / 2 : center.y), "center", "center");
        active.setCoords();
    }
    canvas.requestRenderAll();
}

export async function exportArtboardPng(canvas: Canvas, width: number, height: number) {
    const viewport = canvas.viewportTransform;
    let output: HTMLCanvasElement;
    try {
        canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
        output = canvas.toCanvasElement(1, { left: 0, top: 0, width, height });
    } finally {
        canvas.setViewportTransform(viewport);
        canvas.requestRenderAll();
    }
    const blob = await new Promise<Blob>((resolve, reject) => output.toBlob((result) => (result ? resolve(result) : reject(new Error("导出图片失败"))), "image/png"));
    saveAs(blob, `自定义画布-${width}x${height}.png`);
}
