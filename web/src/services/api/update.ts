import { apiGet } from "./request";

export type UpdateInfo = {
  id: number;
  version: string;
  title: string;
  releaseNotes: string;
  platform: string;
  arch: string;
  downloadUrl: string;
  fileSize: number;
  status: string;
};

export async function checkUpdateApi() {
  return apiGet<UpdateInfo | null>("/api/update/check");
}

/**
 * 通过 Electron IPC 检查更新（桌面端优先）
 */
export async function checkUpdate(): Promise<UpdateInfo | null> {
  if (typeof window !== "undefined" && window.desktopApp?.checkUpdate) {
    return window.desktopApp.checkUpdate();
  }
  return checkUpdateApi();
}

/**
 * 下载更新安装包
 */
export async function downloadUpdate(url: string, expectedTotal?: number): Promise<{ success: boolean; path?: string; error?: string }> {
  if (typeof window !== "undefined" && window.desktopApp?.downloadUpdate) {
    return window.desktopApp.downloadUpdate(url, expectedTotal);
  }
  // 非桌面端直接打开浏览器下载
  window.open(url, "_blank");
  return { success: true };
}
