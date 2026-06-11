const DESKTOP_API_BASE_URL = process.env.NEXT_PUBLIC_DESKTOP_API_BASE_URL || "http://127.0.0.1:38217";

type TauriWindow = Window & {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
};

export function isDesktopRuntime() {
    if (typeof window === "undefined") return false;
    const tauriWindow = window as TauriWindow;
    return Boolean(tauriWindow.__TAURI__ || tauriWindow.__TAURI_INTERNALS__) || window.location.protocol === "tauri:" || window.location.hostname === "tauri.localhost";
}

export function appApiUrl(path: string) {
    if (/^(https?:|data:|blob:|asset:)/i.test(path)) return path;
    const normalized = path.startsWith("/") ? path : `/${path}`;
    return isDesktopRuntime() && normalized.startsWith("/api") ? `${DESKTOP_API_BASE_URL}${normalized}` : normalized;
}
