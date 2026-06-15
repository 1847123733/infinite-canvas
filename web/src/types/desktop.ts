export {};

declare global {
    interface Window {
        desktopAuth?: {
            getSession: () => Promise<{ sessionId: string; refreshToken: string } | null>;
            saveSession: (input: { sessionId: string; refreshToken: string }) => Promise<boolean>;
            clearSession: () => Promise<boolean>;
        };
        desktopApp?: {
            getDeviceId: () => Promise<string>;
            getVersion: () => Promise<string>;
            getCloudBaseUrl: () => Promise<string>;
        };
    }
}
