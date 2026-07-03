"use client";

import { create } from "zustand";

import { CloudApiError, cloudCurrentUser, cloudLogin, cloudLogout, cloudRefresh, type CloudAuthSession, type CloudAuthUser } from "@/services/api/cloud-auth";

type CloudAuthStore = {
    accessToken: string;
    accessTokenExpiresAt: number;
    cloudBaseUrl: string;
    sessionId: string;
    user: CloudAuthUser | null;
    isReady: boolean;
    isLoading: boolean;
    isDesktopCloud: boolean;
    restoreSession: () => Promise<void>;
    refreshSession: () => Promise<string>;
    getValidAccessToken: () => Promise<string>;
    validateSession: () => Promise<void>;
    login: (payload: { username: string; password: string }) => Promise<CloudAuthUser>;
    logout: () => Promise<void>;
};

let refreshPromise: Promise<string> | null = null;

async function readDesktopCloudBaseUrl() {
    if (typeof window === "undefined") return "";
    const baseUrl = (await window.desktopApp?.getCloudBaseUrl?.())?.trim() || "";
    return baseUrl;
}

function accessTokenExpiresAt(session: CloudAuthSession) {
    return Date.now() + Math.max(0, session.accessTokenExpiresIn - 60) * 1000;
}

export const useCloudAuthStore = create<CloudAuthStore>()((set, get) => ({
    accessToken: "",
    accessTokenExpiresAt: 0,
    cloudBaseUrl: "",
    sessionId: "",
    user: null,
    isReady: false,
    isLoading: false,
    isDesktopCloud: false,
    restoreSession: async () => {
        if (typeof window === "undefined" || !window.desktopApp || !window.desktopAuth) {
            set({ isReady: true, isDesktopCloud: false, isLoading: false });
            return;
        }
        const cloudBaseUrl = await readDesktopCloudBaseUrl();
        if (!cloudBaseUrl) {
            set({ cloudBaseUrl: "", isReady: true, isDesktopCloud: false, isLoading: false });
            return;
        }
        set({ cloudBaseUrl, isDesktopCloud: true, isLoading: true });
        try {
            const stored = await window.desktopAuth.getSession();
            if (!stored) {
                set({ accessToken: "", accessTokenExpiresAt: 0, sessionId: "", user: null, isReady: true, isLoading: false });
                return;
            }
            const session = await cloudRefresh(cloudBaseUrl, stored);
            await window.desktopAuth.saveSession({ sessionId: session.sessionId, refreshToken: session.refreshToken });
            set({ accessToken: session.accessToken, accessTokenExpiresAt: accessTokenExpiresAt(session), sessionId: session.sessionId, user: session.user, isReady: true, isLoading: false });
        } catch (error) {
            if (!(error instanceof CloudApiError) || error.status !== 0) {
                await window.desktopAuth.clearSession();
            }
            set({ accessToken: "", accessTokenExpiresAt: 0, sessionId: "", user: null, isReady: true, isLoading: false });
        }
    },
    refreshSession: async () => {
        if (refreshPromise) return refreshPromise;
        refreshPromise = (async () => {
            const cloudBaseUrl = get().cloudBaseUrl || (await readDesktopCloudBaseUrl());
            if (!cloudBaseUrl || typeof window === "undefined" || !window.desktopApp || !window.desktopAuth) {
                throw new Error("未配置云端控制服务地址");
            }
            const stored = await window.desktopAuth.getSession();
            if (!stored) throw new Error("请先登录云端账号");
            try {
                const session = await cloudRefresh(cloudBaseUrl, stored);
                await window.desktopAuth.saveSession({ sessionId: session.sessionId, refreshToken: session.refreshToken });
                set({ cloudBaseUrl, accessToken: session.accessToken, accessTokenExpiresAt: accessTokenExpiresAt(session), sessionId: session.sessionId, user: session.user, isDesktopCloud: true, isReady: true, isLoading: false });
                return session.accessToken;
            } catch (error) {
                if (!(error instanceof CloudApiError) || error.status !== 0) {
                    await window.desktopAuth.clearSession();
                    set({ accessToken: "", accessTokenExpiresAt: 0, sessionId: "", user: null, isReady: true, isLoading: false });
                }
                throw error;
            } finally {
                refreshPromise = null;
            }
        })();
        return refreshPromise;
    },
    getValidAccessToken: async () => {
        const { accessToken, accessTokenExpiresAt, isDesktopCloud } = get();
        if (!isDesktopCloud) return accessToken;
        if (accessToken && accessTokenExpiresAt > Date.now()) return accessToken;
        return get().refreshSession();
    },
    validateSession: async () => {
        const { cloudBaseUrl, isDesktopCloud } = get();
        if (!isDesktopCloud || !cloudBaseUrl) return;
        try {
            const token = await get().getValidAccessToken();
            const current = await cloudCurrentUser(cloudBaseUrl, token);
            set({ user: current.user, sessionId: current.sessionId, isReady: true });
        } catch (error) {
            if (error instanceof CloudApiError && error.status === 0) return;
            if (error instanceof CloudApiError && error.status === 401) {
                try {
                    const token = await get().refreshSession();
                    const current = await cloudCurrentUser(cloudBaseUrl, token);
                    set({ user: current.user, sessionId: current.sessionId, isReady: true });
                    return;
                } catch {
                    // fall through to clearing the invalid session
                }
            }
            await window.desktopAuth?.clearSession?.();
            set({ accessToken: "", accessTokenExpiresAt: 0, sessionId: "", user: null, isReady: true, isLoading: false });
        }
    },
    login: async (payload) => {
        const cloudBaseUrl = get().cloudBaseUrl || (await readDesktopCloudBaseUrl());
        if (!cloudBaseUrl || !window.desktopApp || !window.desktopAuth) {
            throw new Error("未配置云端控制服务地址");
        }
        set({ cloudBaseUrl, isDesktopCloud: true, isLoading: true });
        try {
            const [deviceId, clientVersion] = await Promise.all([window.desktopApp.getDeviceId(), window.desktopApp.getVersion()]);
            const session = await cloudLogin(cloudBaseUrl, {
                ...payload,
                deviceId,
                deviceName: navigator.userAgent,
                clientVersion,
            });
            await window.desktopAuth.saveSession({ sessionId: session.sessionId, refreshToken: session.refreshToken });
            set({ accessToken: session.accessToken, accessTokenExpiresAt: accessTokenExpiresAt(session), sessionId: session.sessionId, user: session.user, isReady: true, isLoading: false });
            return session.user;
        } catch (error) {
            set({ isLoading: false });
            throw error;
        }
    },
    logout: async () => {
        const { accessToken, cloudBaseUrl } = get();
        try {
            if (accessToken && cloudBaseUrl) {
                await cloudLogout(cloudBaseUrl, accessToken);
            }
        } catch {
            // 本地清会话优先，云端失败时由过期/撤销流程兜底。
        }
        await window.desktopAuth?.clearSession?.();
        set({ accessToken: "", accessTokenExpiresAt: 0, sessionId: "", user: null, isReady: true, isLoading: false });
    },
}));
