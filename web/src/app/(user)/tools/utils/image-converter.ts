const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const ICO_SIZES = [16, 24, 32, 48, 64, 72, 80, 96, 128, 256] as const;

export type ConvertedFile = {
    blob: Blob;
    name: string;
};

export function validateImageFile(file: File, mimeTypes: Set<string>, extensions: RegExp) {
    if (file.size > MAX_IMAGE_BYTES) return "图片大小不能超过 10 MB";
    if (!mimeTypes.has(file.type.toLowerCase()) && !extensions.test(file.name)) return "不支持该图片格式";
    return "";
}

export function imageFileName(file: File, extension: string) {
    const baseName = file.name.replace(/\.[^.]+$/, "").trim() || "image";
    return `${baseName}.${extension}`;
}

export async function createEmbeddedSvg(file: File) {
    const [dataUrl, image] = await Promise.all([readFileAsDataUrl(file), loadImage(file)]);
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) throw new Error("无法读取图片尺寸");

    const content = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image width="${width}" height="${height}" href="${dataUrl}"/></svg>`;
    return {
        blob: new Blob([content], { type: "image/svg+xml;charset=utf-8" }),
        width,
        height,
    };
}

export async function createIco(file: File, sizes: number[]) {
    if (!sizes.length || sizes.some((size) => !Number.isInteger(size) || size < 1 || size > 256)) throw new Error("图标尺寸需要是 1 到 256 的整数");
    const image = await loadImage(file);
    const images = await Promise.all(sizes.map((size) => renderPng(image, size)));
    const headerBytes = 6 + images.length * 16;
    const totalBytes = images.reduce((sum, imageBytes) => sum + imageBytes.byteLength, headerBytes);
    const buffer = new ArrayBuffer(totalBytes);
    const view = new DataView(buffer);

    view.setUint16(0, 0, true);
    view.setUint16(2, 1, true);
    view.setUint16(4, images.length, true);

    let offset = headerBytes;
    images.forEach((imageBytes, index) => {
        const entry = 6 + index * 16;
        const size = sizes[index];
        view.setUint8(entry, size === 256 ? 0 : size);
        view.setUint8(entry + 1, size === 256 ? 0 : size);
        view.setUint8(entry + 2, 0);
        view.setUint8(entry + 3, 0);
        view.setUint16(entry + 4, 1, true);
        view.setUint16(entry + 6, 32, true);
        view.setUint32(entry + 8, imageBytes.byteLength, true);
        view.setUint32(entry + 12, offset, true);
        new Uint8Array(buffer, offset, imageBytes.byteLength).set(imageBytes);
        offset += imageBytes.byteLength;
    });

    return new Blob([buffer], { type: "image/x-icon" });
}

export function loadImage(file: File) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            URL.revokeObjectURL(url);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("图片读取失败，请确认文件内容完整"));
        };
        image.src = url;
    });
}

function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("图片读取失败"));
        reader.readAsDataURL(file);
    });
}

function renderPng(image: HTMLImageElement, size: number) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器不支持图片转换");

    const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.clearRect(0, 0, size, size);
    context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);

    return new Promise<Uint8Array>((resolve, reject) => {
        canvas.toBlob(async (blob) => {
            if (!blob) {
                reject(new Error("图标尺寸生成失败"));
                return;
            }
            resolve(new Uint8Array(await blob.arrayBuffer()));
        }, "image/png");
    });
}
