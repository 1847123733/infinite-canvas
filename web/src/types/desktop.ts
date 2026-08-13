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
            runWindowsCleanup: () => Promise<{ success: boolean; cancelled?: boolean; error?: string }>;
            checkUpdate: () => Promise<{
                id: number;
                version: string;
                title: string;
                releaseNotes: string;
                platform: string;
                arch: string;
                downloadUrl: string;
                fileSize: number;
                status: string;
            } | null>;
            downloadUpdate: (url: string, expectedTotal?: number) => Promise<{ success: boolean; path?: string; error?: string }>;
            onUpdateProgress: (callback: (progress: { status: "downloading" | "completed" | "launching" | "error"; percent: number; downloaded: number; total: number; message?: string }) => void) => () => void;
        };
    }
}
