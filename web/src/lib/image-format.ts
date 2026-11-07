import { filetypeinfo } from "magic-bytes.js";

function detectImageMimeType(bytes: Uint8Array) {
    return filetypeinfo(bytes).find((type) => type.mime?.startsWith("image/"))?.mime;
}

export function base64ImageDataUrl(base64: string) {
    const header = Uint8Array.from(atob(base64.slice(0, 1024)), (char) => char.charCodeAt(0));
    return `data:${detectImageMimeType(header) || "image/png"};base64,${base64}`;
}

export async function normalizeImageBlob(blob: Blob) {
    const mimeType = detectImageMimeType(new Uint8Array(await blob.slice(0, 1024).arrayBuffer())) || blob.type;
    return mimeType && mimeType !== blob.type ? blob.slice(0, blob.size, mimeType) : blob;
}
