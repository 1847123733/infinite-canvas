import axios from "axios";

type CloudApiResponse<T> = {
    code: number | string;
    data: T;
    message?: string;
    msg?: string;
};

export class CloudApiError extends Error {
    status: number;
    code?: number | string;

    constructor(message: string, status: number, code?: number | string) {
        super(message);
        this.name = "CloudApiError";
        this.status = status;
        this.code = code;
    }
}

export type CloudAuthUser = {
    id: number;
    username: string;
    displayName: string;
};

export type CloudAuthSession = {
    accessToken: string;
    accessTokenExpiresIn: number;
    refreshToken: string;
    refreshTokenExpiresIn: number;
    sessionId: string;
    user: CloudAuthUser;
};

export type CloudCurrentUser = {
    user: CloudAuthUser;
    sessionId: string;
    canGenerate: boolean;
};

export type CloudLoginPayload = {
    username: string;
    password: string;
    deviceId: string;
    deviceName?: string;
    clientVersion?: string;
};

function cloudUrl(baseUrl: string, path: string) {
    return `${baseUrl.replace(/\/+$/, "")}/api/infinite-canvas${path}`;
}

async function cloudRequest<T>(baseUrl: string, path: string, options: { body?: unknown; token?: string } = {}) {
    let response;
    try {
        const clientHeaders =
            typeof window !== "undefined" && window.desktopApp
                ? {
                      "X-Device-Id": await window.desktopApp.getDeviceId(),
                      "X-Device-Name": navigator.userAgent,
                      "X-Client-Version": await window.desktopApp.getVersion(),
                  }
                : {};
        response = await axios.request<CloudApiResponse<T>>({
            url: cloudUrl(baseUrl, path),
            method: options.body ? "POST" : "GET",
            data: options.body,
            headers: {
                ...clientHeaders,
                ...(options.body ? { "Content-Type": "application/json" } : {}),
                ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
            },
            validateStatus: () => true,
        });
    } catch {
        throw new CloudApiError("云端服务连接失败", 0);
    }

    const payload = response.data;
    if (!payload || typeof payload !== "object") {
        throw new Error("云端服务返回异常");
    }
    if (response.status < 200 || response.status >= 300 || payload.code !== 0) {
        throw new CloudApiError(payload.message || payload.msg || "云端请求失败", response.status, payload.code);
    }
    return payload.data;
}

export function cloudLogin(baseUrl: string, payload: CloudLoginPayload) {
    return cloudRequest<CloudAuthSession>(baseUrl, "/auth/login", { body: payload });
}

export function cloudRefresh(baseUrl: string, payload: { sessionId: string; refreshToken: string }) {
    return cloudRequest<CloudAuthSession>(baseUrl, "/auth/refresh", { body: payload });
}

export function cloudCurrentUser(baseUrl: string, token: string) {
    return cloudRequest<CloudCurrentUser>(baseUrl, "/auth/me", { token });
}

export function cloudModelChannel<T>(baseUrl: string, token: string) {
    return cloudRequest<T>(baseUrl, "/settings/model-channel", { token });
}

export function cloudLogout(baseUrl: string, token: string) {
    return cloudRequest<null>(baseUrl, "/auth/logout", { body: {}, token });
}
