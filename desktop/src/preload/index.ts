import { contextBridge, ipcRenderer } from 'electron'

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
  getCloudBaseUrl: () => ipcRenderer.invoke('desktop-app-get-cloud-base-url')
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
    }
  }
}
