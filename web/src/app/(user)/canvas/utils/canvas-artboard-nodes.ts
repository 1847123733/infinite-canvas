import type { CanvasArtboardData, CanvasArtboardObject } from "../types";

export function remapArtboardSources(data: CanvasArtboardData, nodeIds: Map<string, string>) {
    const remap = (object: CanvasArtboardObject): CanvasArtboardObject => ({
        ...object,
        sourceNodeId: object.sourceNodeId ? nodeIds.get(object.sourceNodeId) : undefined,
        ...(object.objects ? { objects: object.objects.map(remap) } : {}),
    });
    return {
        ...data,
        scene: { ...data.scene, objects: data.scene.objects.map(remap) },
        importedSources: data.importedSources.flatMap((id) => (nodeIds.has(id) ? [nodeIds.get(id)!] : [])),
    };
}
