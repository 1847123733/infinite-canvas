"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";

import { useConfigStore } from "@/stores/use-config-store";
import { useCloudAuthStore } from "@/stores/use-cloud-auth-store";

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
        const timer = window.setInterval(validate, 30_000);
        return () => {
            window.removeEventListener("focus", validate);
            window.clearInterval(timer);
        };
    }, [accessToken, validateCloudSession]);

    return <>{children}</>;
}
