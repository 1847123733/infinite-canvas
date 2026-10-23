import { BACKGROUND_REMOVAL_PUBLIC_PATH, BACKGROUND_REMOVAL_VERSION, type BackgroundRemovalRequest, type BackgroundRemovalResponse } from "./background-removal-types";

const DEVICE_STORAGE_KEY = `canvas-background-removal-device-${BACKGROUND_REMOVAL_VERSION}`;

type RemovalOptions = {
    signal: AbortSignal;
    onProgress: (content: string) => void;
};

export async function removeImageBackground(image: Blob, options: RemovalOptions) {
    if (readPreferredDevice() !== "cpu") {
        try {
            const result = await runWorker(image, "gpu", options);
            rememberDevice("gpu");
            return result;
        } catch {
            options.signal.throwIfAborted();
        }
    }
    options.signal.throwIfAborted();
    options.onProgress("正在使用兼容模式抠图，可能需要较长时间");
    const result = await runWorker(image, "cpu", options);
    rememberDevice("cpu");
    return result;
}

function readPreferredDevice() {
    try {
        return window.localStorage.getItem(DEVICE_STORAGE_KEY);
    } catch {
        return null;
    }
}

function rememberDevice(device: BackgroundRemovalRequest["device"]) {
    try {
        window.localStorage.setItem(DEVICE_STORAGE_KEY, device);
    } catch {
        // 本地配置不可写时仍正常返回抠图结果。
    }
}

function runWorker(image: Blob, device: BackgroundRemovalRequest["device"], { signal, onProgress }: RemovalOptions) {
    signal.throwIfAborted();
    return new Promise<Blob>((resolve, reject) => {
        const worker = new Worker(`${BACKGROUND_REMOVAL_PUBLIC_PATH}background-removal.worker.js`, { type: "module" });
        const finish = (error?: Error, result?: Blob) => {
            clearTimeout(timeout);
            signal.removeEventListener("abort", cancel);
            worker.terminate();
            if (error) reject(error);
            else resolve(result!);
        };
        const cancel = () => finish(new DOMException("已取消抠图", "AbortError"));
        const timeout = setTimeout(() => finish(new Error("抠图超时，请重试或使用较小的图片")), device === "gpu" ? 120_000 : 600_000);
        signal.addEventListener("abort", cancel, { once: true });
        worker.onerror = (event) => {
            event.preventDefault();
            finish(new Error("抠图组件加载失败，请重新准备离线抠图资源"));
        };
        worker.onmessageerror = () => finish(new Error("抠图结果读取失败"));
        worker.onmessage = ({ data }: MessageEvent<BackgroundRemovalResponse>) => {
            if (data.type === "result") finish(undefined, data.image);
            else if (data.type === "error") finish(new Error(data.message));
            else if (data.stage === "encoding") onProgress("正在生成透明图片");
            else if (device === "gpu") onProgress(data.stage === "loading" ? "正在加载本地抠图模型" : "正在抠图");
        };
        worker.postMessage({ image, device } satisfies BackgroundRemovalRequest);
    });
}
