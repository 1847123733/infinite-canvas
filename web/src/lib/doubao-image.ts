export const doubaoImageResolutionOptions = [
    { value: "1k", label: "1K" },
    { value: "1.5k", label: "1.5K" },
    { value: "2k", label: "2K" },
] as const;

export const doubaoImageAspectOptions = [
    { value: "auto", label: "智能", width: 0, height: 0, icon: "auto" },
    { value: "1:1", label: "1:1", width: 1, height: 1, icon: "square" },
    { value: "3:4", label: "3:4", width: 3, height: 4, icon: "portrait" },
    { value: "4:3", label: "4:3", width: 4, height: 3, icon: "landscape" },
    { value: "16:9", label: "16:9", width: 16, height: 9, icon: "landscape" },
    { value: "9:16", label: "9:16", width: 9, height: 16, icon: "portrait" },
    { value: "2:3", label: "2:3", width: 2, height: 3, icon: "portrait" },
    { value: "3:2", label: "3:2", width: 3, height: 2, icon: "landscape" },
    { value: "21:9", label: "21:9", width: 21, height: 9, icon: "landscape" },
] as const;

const doubaoImageSizes = {
    "1k": {
        "1:1": "1024x1024",
        "3:4": "864x1152",
        "4:3": "1152x864",
        "16:9": "1280x720",
        "9:16": "720x1280",
        "2:3": "832x1248",
        "3:2": "1248x832",
        "21:9": "1512x648",
    },
    "1.5k": {
        "1:1": "1536x1536",
        "3:4": "1296x1728",
        "4:3": "1728x1296",
        "16:9": "1920x1080",
        "9:16": "1080x1920",
        "2:3": "1248x1872",
        "3:2": "1872x1248",
        "21:9": "2268x972",
    },
    "2k": {
        "1:1": "2048x2048",
        "3:4": "1728x2304",
        "4:3": "2304x1728",
        "16:9": "2560x1440",
        "9:16": "1440x2560",
        "2:3": "1664x2496",
        "3:2": "2496x1664",
        "21:9": "3024x1296",
    },
} as const;

type DoubaoImageResolution = keyof typeof doubaoImageSizes;
type DoubaoImageAspect = keyof (typeof doubaoImageSizes)[DoubaoImageResolution];

export function isDoubaoImageModel(model: string) {
    return model.toLowerCase().includes("doubao");
}

export function normalizeDoubaoImageResolution(value: string): DoubaoImageResolution {
    const normalized = value.trim().toLowerCase();
    return normalized in doubaoImageSizes ? (normalized as DoubaoImageResolution) : "2k";
}

export function resolveDoubaoImageAspect(size: string) {
    const normalized = size.trim().toLowerCase();
    if (!normalized || normalized === "auto") return "auto";
    if (doubaoImageAspectOptions.some((item) => item.value === normalized)) return normalized;
    for (const sizes of Object.values(doubaoImageSizes)) {
        const entry = Object.entries(sizes).find(([, dimensions]) => dimensions === normalized);
        if (entry) return entry[0];
    }
    return "auto";
}

export function resolveDoubaoImageSize(resolution: string, size: string) {
    const aspect = resolveDoubaoImageAspect(size);
    if (aspect === "auto") return undefined;
    return doubaoImageSizes[normalizeDoubaoImageResolution(resolution)][aspect as DoubaoImageAspect];
}

export function readDoubaoImageDimensions(resolution: string, size: string) {
    const dimensions = resolveDoubaoImageSize(resolution, size);
    const match = dimensions?.match(/^(\d+)x(\d+)$/);
    return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}