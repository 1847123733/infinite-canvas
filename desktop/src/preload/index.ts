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
  }
}