import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Configuration
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (config: any) => ipcRenderer.invoke('set-config', config),

  // App info
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  // Servers
  restartServers: () => ipcRenderer.invoke('restart-servers'),

  // Platform info
  platform: process.platform,
  arch: process.arch
})

contextBridge.exposeInMainWorld('desktopAuth', {
  getSession: () => ipcRenderer.invoke('desktop-auth-get-session'),
  saveSession: (input: { sessionId: string; refreshToken: string }) => ipcRenderer.invoke('desktop-auth-save-session', input),
  clearSession: () => ipcRenderer.invoke('desktop-auth-clear-session')
})

contextBridge.exposeInMainWorld('desktopApp', {
  getDeviceId: () => ipcRenderer.invoke('desktop-app-get-device-id'),
  getVersion: () => ipcRenderer.invoke('desktop-app-get-version'),
  getCloudBaseUrl: () => ipcRenderer.invoke('desktop-app-get-cloud-base-url'),
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  downloadUpdate: (url: string, expectedTotal?: number) => ipcRenderer.invoke('download-update', url, expectedTotal),
  onUpdateProgress: (callback: (progress: { status: 'downloading' | 'completed' | 'launching' | 'error'; percent: number; downloaded: number; total: number; message?: string }) => void) => {
    const listener = (_event: IpcRendererEvent, data: { status: 'downloading' | 'completed' | 'launching' | 'error'; percent: number; downloaded: number; total: number; message?: string }) => callback(data)
    ipcRenderer.on('update-download-progress', listener)
    return () => ipcRenderer.removeListener('update-download-progress', listener)
  },
})

// TypeScript types for the exposed API
declare global {
  interface Window {
    electronAPI: {
      getConfig: () => Promise<any>
      setConfig: (config: any) => Promise<boolean>
      getAppInfo: () => Promise<{
        name: string
        version: string
        apiPort: number
        webPort: number
        cloudBaseUrl: string
        userDataPath: string
      }>
      restartServers: () => Promise<{
        success: boolean
        error?: string
        apiPort?: number
        webPort?: number
      }>
      platform: string
      arch: string
    }
    desktopAuth: {
      getSession: () => Promise<{ sessionId: string; refreshToken: string } | null>
      saveSession: (input: { sessionId: string; refreshToken: string }) => Promise<boolean>
      clearSession: () => Promise<boolean>
    }
    desktopApp: {
      getDeviceId: () => Promise<string>
      getVersion: () => Promise<string>
      getCloudBaseUrl: () => Promise<string>
      checkUpdate: () => Promise<{
        id: number
        version: string
        title: string
        releaseNotes: string
        platform: string
        arch: string
        downloadUrl: string
        fileSize: number
        status: string
      } | null>
      downloadUpdate: (url: string, expectedTotal?: number) => Promise<{ success: boolean; path?: string; error?: string }>
      onUpdateProgress: (callback: (progress: { status: 'downloading' | 'completed' | 'launching' | 'error'; percent: number; downloaded: number; total: number; message?: string }) => void) => () => void
    }
  }
}
