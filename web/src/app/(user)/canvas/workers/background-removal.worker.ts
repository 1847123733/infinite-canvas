/// <reference lib="webworker" />
/// <reference types="@webgpu/types" />

import type { BackgroundRemovalRequest, BackgroundRemovalResponse } from "../utils/background-removal-types";

const worker = self as unknown as DedicatedWorkerGlobalScope;
const respond = (response: BackgroundRemovalResponse) => worker.postMessage(response);

worker.onmessage = async ({ data }: MessageEvent<BackgroundRemovalRequest>) => {
    try {
        if (data.device === "gpu") {
            const adapter = await worker.navigator.gpu?.requestAdapter();
            if (!adapter?.features.has("shader-f16")) throw new Error("当前设备不支持 GPU 抠图");
        }

        const bitmap = await createImageBitmap(data.image);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext("2d");
        if (!context) {
            bitmap.close();
            throw new Error("无法读取图片像素");
        }
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        // 1.7.0 虽声明支持 ImageData，实际入口只会将 Blob 解码为推理所需的 ndarray。
        const input = await canvas.convertToBlob({ type: "image/png" });
        respond({ type: "progress", stage: "loading" });
        const { removeBackground } = await import("@imgly/background-removal");
        const image = await removeBackground(input, {
            publicPath: new URL("data/", worker.location.href).href,
            device: data.device,
            model: data.device === "gpu" ? "isnet_fp16" : "isnet_quint8",
            proxyToWorker: false,
            rescale: true,
            output: { format: "image/png" },
            progress: (key) => {
                if (key === "compute:inference") respond({ type: "progress", stage: "processing" });
                if (key === "compute:encode") respond({ type: "progress", stage: "encoding" });
            },
        });
        respond({ type: "result", image });
    } catch (error) {
        respond({ type: "error", message: error instanceof Error ? error.message : "抠图失败" });
    }
};
