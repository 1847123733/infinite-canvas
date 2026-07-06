"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";

import { useConfigStore } from "@/stores/use-config-store";
import { useCloudAuthStore } from "@/stores/use-cloud-auth-store";
import { GlobalNotificationBridge } from "@/components/layout/global-notification-bridge";
import { PSDTaskWatcher } from "@/components/layout/psd-task-watcher";

export function ClientRootInit({ children }: { children: ReactNode }) {
    const restoreCloudSession = useCloudAuthStore((state) => state.restoreSession);
    const validateCloudSession = useCloudAuthStore((state) => state.validateSession);
    const accessToken = useCloudAuthStore((state) => state.accessToken);
    const loadPublicSettings = useConfigStore((state) => state.loadPublicSettings);

    useEffect(() => {
        void loadPublicSettings();
    }, [loadPublicSettings]);

    useEffect(() => {
        if (!accessToken) return;
        void loadPublicSettings();
    }, [accessToken, loadPublicSettings]);

    useEffect(() => {
        void restoreCloudSession();
    }, [restoreCloudSession]);

    useEffect(() => {
        if (!accessToken) return;
        const validate = () => {
            void validateCloudSession();
        };
        window.addEventListener("focus", validate);
        return () => {
            window.removeEventListener("focus", validate);
        };
    }, [accessToken, validateCloudSession]);

    return (
        <>
            <GlobalNotificationBridge />
            <PSDTaskWatcher />
            {children}
        </>
    );
}
