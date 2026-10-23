export const BACKGROUND_REMOVAL_VERSION = "1.7.0";
export const BACKGROUND_REMOVAL_PUBLIC_PATH = `/background-removal/${BACKGROUND_REMOVAL_VERSION}/`;

export type BackgroundRemovalRequest = {
    image: Blob;
    device: "gpu" | "cpu";
};

export type BackgroundRemovalResponse = { type: "progress"; stage: "loading" | "processing" | "encoding" } | { type: "result"; image: Blob } | { type: "error"; message: string };
