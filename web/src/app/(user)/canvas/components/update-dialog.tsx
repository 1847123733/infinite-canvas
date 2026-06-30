"use client";

import { useEffect, useState } from "react";
import { Progress } from "antd";
import { Download, RefreshCw, X } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { checkUpdate, downloadUpdate, type UpdateInfo } from "@/services/api/update";

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UpdateDialog({
  open,
  requestKey,
  onClose,
}: {
  open: boolean;
  requestKey: number;
  onClose: () => void;
}) {
  const colorTheme = useThemeStore((s) => s.theme);
  const theme = canvasThemes[colorTheme];
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadMessage, setDownloadMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    if (!window.desktopApp?.onUpdateProgress) return;
    const unsubscribe = window.desktopApp.onUpdateProgress((data) => {
      setProgress(data.percent);
      setDownloadMessage(data.message || "");
      if (data.status === "error") {
        setDownloading(false);
        setErrorMessage(data.message || "下载更新失败，请稍后重试");
      }
    });
    return unsubscribe;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void handleCheck();
  }, [open, requestKey]);

  async function handleCheck() {
    setErrorMessage("");
    setUpdateInfo(null);
    setDownloadMessage("");
    setProgress(0);
    setDownloading(false);
    setChecking(true);
    try {
      const info = await checkUpdate();
      setUpdateInfo(info);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "检测失败，请稍后重试");
    } finally {
      setChecking(false);
    }
  }

  async function handleDownload() {
    if (!updateInfo?.downloadUrl) return;
    setErrorMessage("");
    setDownloading(true);
    setProgress(0);
    setDownloadMessage("正在下载更新安装包");
    try {
      const result = await downloadUpdate(updateInfo.downloadUrl, updateInfo.fileSize);
      if (!result.success) {
        throw new Error(result.error || "下载更新失败，请稍后重试");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "下载更新失败，请稍后重试");
      setDownloading(false);
      setDownloadMessage("");
      return;
    }
  }

  if (!open) return null;

  const panelStyle = {
    background: theme.toolbar.panel,
    borderColor: theme.toolbar.border,
    color: theme.node.text,
    boxShadow: colorTheme === "dark" ? "0 18px 45px rgba(0,0,0,.4)" : "0 16px 40px rgba(28,25,23,.15)",
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: "rgba(0,0,0,.35)" }}>
      <div className="w-[420px] rounded-xl border p-5" style={panelStyle}>
        {/* Header */}
          <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-base font-semibold">
            <RefreshCw className="size-4.5" style={{ color: theme.toolbar.activeText }} />
            版本更新
          </div>
          <button onClick={onClose} className="rounded-md p-1 opacity-50 hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30" disabled={downloading}>
            <X className="size-4" />
          </button>
        </div>

        {/* Checking */}
        {checking && (
          <div className="flex items-center gap-2 py-6 text-sm opacity-60">
            <RefreshCw className="size-4 animate-spin" />
            正在检查更新...
          </div>
        )}

        {!checking && errorMessage && (
          <div className="space-y-3 py-4">
            <div className="text-center text-sm opacity-70">{errorMessage}</div>
            <div className="flex justify-end">
              <button
                className="rounded-lg px-4 py-1.5 text-sm font-medium"
                style={{ background: theme.toolbar.activeBg, color: theme.toolbar.activeText }}
                onClick={() => void handleCheck()}
              >
                重新检测
              </button>
            </div>
          </div>
        )}

        {/* No update */}
        {!checking && !errorMessage && !updateInfo && (
          <div className="py-6 text-center text-sm opacity-60">当前已是最新版本</div>
        )}

        {/* Update available */}
        {!checking && updateInfo && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="rounded-md px-2 py-0.5 text-xs font-semibold" style={{ background: theme.toolbar.activeBg, color: theme.toolbar.activeText }}>
                v{updateInfo.version}
              </span>
              <span className="text-sm font-medium">{updateInfo.title}</span>
            </div>
            {updateInfo.releaseNotes && (
              <div className="max-h-40 overflow-auto rounded-lg p-3 text-xs leading-relaxed opacity-70" style={{ background: theme.toolbar.itemHover }}>
                {updateInfo.releaseNotes}
              </div>
            )}
            {updateInfo.fileSize > 0 && (
              <div className="text-xs opacity-50">安装包大小：{formatFileSize(updateInfo.fileSize)}</div>
            )}
            {downloading && (
              <div className="space-y-2">
                <Progress percent={progress} size="small" />
                {downloadMessage && <div className="text-xs opacity-60">{downloadMessage}</div>}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                className="rounded-lg px-4 py-1.5 text-sm opacity-60 hover:opacity-80"
                style={{ background: theme.toolbar.itemHover }}
                onClick={onClose}
                disabled={downloading}
              >
                稍后再说
              </button>
              <button
                className="inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium"
                style={{ background: theme.toolbar.activeBg, color: theme.toolbar.activeText }}
                onClick={handleDownload}
                disabled={downloading}
              >
                <Download className="size-3.5" />
                {downloading ? `下载中 ${Math.round(progress)}%` : "立即更新"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
