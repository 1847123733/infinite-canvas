import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { spawn } from 'child_process'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import Store from 'electron-store'
import portfinder from 'portfinder'
import { clearCloudSession, getCloudSession, setCloudSession } from './cloud-session-store'
import { getDeviceId } from './device-id'

// Guard: ELECTRON_RUN_AS_NODE breaks Electron's module system
// (commonly set by VS Code's integrated terminal)
if (process.env.ELECTRON_RUN_AS_NODE) {
  console.warn('[Infinite Canvas] ELECTRON_RUN_AS_NODE is set, clearing it to ensure Electron works properly')
  delete process.env.ELECTRON_RUN_AS_NODE
}

// Store for configuration
const store = new Store()

// Process references
let apiProcess: any = null
let webProcess: any = null
let mainWindow: BrowserWindow | null = null

// Configuration
let config = {
  apiHost: process.env.API_HOST || '127.0.0.1',
  apiPort: parseInt(process.env.API_PORT || '8080'),
  webHost: process.env.WEB_HOST || '127.0.0.1',
  webPort: parseInt(process.env.WEB_PORT || '3000'),
  cloudBaseUrl: (process.env.INFINITE_CANVAS_CLOUD_BASE_URL || '').trim(),
  appName: process.env.APP_NAME || 'Infinite Canvas',
  appVersion: app.getVersion()
}

// Get user data directory
function getUserDataPath() {
  return app.getPath('userData')
}

// Create user data directories
function createUserDataDirectories() {
  const userDataPath = getUserDataPath()

  const dirs = [
    join(userDataPath, 'data'),
    join(userDataPath, 'uploads'),
    join(userDataPath, 'prompts'),
    join(userDataPath, 'logs'),
    join(userDataPath, 'backups')
  ]

  dirs.forEach(dir => {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  })

  // Create default config file if not exists
  const configPath = join(userDataPath, 'config.json')
  if (!existsSync(configPath)) {
    const defaultConfig = {
      apiPort: config.apiPort,
      webPort: config.webPort,
      adminUsername: 'admin',
      adminPassword: '',
      jwtSecret: generateSecret(),
      apiBaseUrl: '',
      cloudBaseUrl: config.cloudBaseUrl
    }
    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2))
    store.set('config', defaultConfig)
  }

  return userDataPath
}

// Generate random secret
function generateSecret() {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15)
}

// Find available port
async function findAvailablePort(basePort: number): Promise<number> {
  try {
    const port = await portfinder.getPortPromise({
      port: basePort,
      stopPort: basePort + 100
    })
    return port
  } catch (error) {
    console.error('Failed to find available port:', error)
    return basePort
  }
}

// Start API server
async function startApiServer() {
  const userDataPath = getUserDataPath()

  // Find available port
  config.apiPort = await findAvailablePort(config.apiPort)

  // Get platform-specific binary path
  const isDev = process.env.NODE_ENV === 'development'
  let apiPath: string

  if (isDev) {
    // Development mode - use build from resources directory
    apiPath = join(process.cwd(), 'resources', 'api', 'api.exe')
    if (!existsSync(apiPath)) {
      apiPath = join(process.cwd(), 'resources', 'api', 'api')
    }
    // Fallback: try project root where 'go build' outputs
    if (!existsSync(apiPath)) {
      apiPath = join(process.cwd(), '..', 'api.exe')
    }
    if (!existsSync(apiPath)) {
      apiPath = join(process.cwd(), '..', 'api')
    }
  } else {
    // Production mode - use packaged binary
    if (process.platform === 'win32') {
      apiPath = join(process.resourcesPath, 'resources', 'api', 'api.exe')
    } else {
      apiPath = join(process.resourcesPath, 'resources', 'api', 'api')
    }
  }

  if (!existsSync(apiPath)) {
    throw new Error(`API binary not found at ${apiPath}`)
  }

  // Environment variables for API
  const apiEnv = {
    ...process.env,
    BIND_ADDR: '127.0.0.1',
    PORT: config.apiPort.toString(),
    DATABASE_DSN: join(userDataPath, 'data', 'infinite-canvas.db'),
    JWT_SECRET: store.get('config.jwtSecret') || generateSecret(),
    ADMIN_USERNAME: store.get('config.adminUsername') || 'admin',
    ADMIN_PASSWORD: store.get('config.adminPassword') || '',
    INFINITE_CANVAS_CLOUD_BASE_URL: config.cloudBaseUrl,
    LOG_PATH: join(userDataPath, 'logs', 'api.log')
  }

  // Start API process
  apiProcess = spawn(apiPath, [], {
    env: apiEnv,
    detached: false
  })

  apiProcess.stdout?.on('data', (data: Buffer) => {
    console.log(`[API] ${data}`)
  })

  apiProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`[API Error] ${data}`)
  })

  apiProcess.on('error', (error: Error) => {
    console.error('Failed to start API process:', error)
    throw error
  })

  // Wait for API to start
  await new Promise<void>((resolve, reject) => {
    const checkHealth = () => {
      fetch(`http://127.0.0.1:${config.apiPort}/api/health`)
        .then(res => {
          if (res.ok) resolve()
          else setTimeout(checkHealth, 500)
        })
        .catch(() => setTimeout(checkHealth, 500))
    }

    // Wait a bit for server to start
    setTimeout(checkHealth, 2000)

    // Timeout after 30 seconds
    setTimeout(() => reject(new Error('API health check timeout')), 30000)
  })

  console.log(`API server started on port ${config.apiPort}`)

  // Update store with actual port
  const appConfig = store.get('config', {}) as any
  appConfig.apiPort = config.apiPort
  appConfig.apiBaseUrl = `http://127.0.0.1:${config.apiPort}`
  store.set('config', appConfig)
}

// Start Next.js server
async function startWebServer() {
  const userDataPath = getUserDataPath()

  // Find available port
  config.webPort = await findAvailablePort(config.webPort)

  // Get platform-specific server path
  const isDev = process.env.NODE_ENV === 'development'
  let nodePath: string
  let serverPath: string

  if (isDev) {
    // Development mode - use resources directory (built by build:web)
    nodePath = join(process.cwd(), 'resources', 'web', 'node.exe')
    if (!existsSync(nodePath)) {
      nodePath = join(process.cwd(), 'resources', 'web', 'node')
    }
    // Fallback: use current Node.js executable
    if (!existsSync(nodePath)) {
      nodePath = process.execPath
    }
    serverPath = join(process.cwd(), 'resources', 'web', 'server.js')
  } else {
    // Production mode - use packaged server
    if (process.platform === 'win32') {
      nodePath = join(process.resourcesPath, 'resources', 'web', 'node.exe')
    } else {
      nodePath = join(process.resourcesPath, 'resources', 'web', 'node')
    }
    serverPath = join(process.resourcesPath, 'resources', 'web', 'server.js')
  }

  if (!existsSync(serverPath)) {
    throw new Error(`Next.js server not found at ${serverPath}`)
  }

  // Environment variables for Next.js
  const webEnv = {
    ...process.env,
    // Next.js standalone server requires HOSTNAME (not just HOST)
    HOSTNAME: '0.0.0.0',
    PORT: config.webPort.toString(),
    API_BASE_URL: `http://127.0.0.1:${config.apiPort}`,
    INFINITE_CANVAS_CLOUD_BASE_URL: config.cloudBaseUrl
  }

  // Start Next.js process
  webProcess = spawn(nodePath, [serverPath], {
    env: webEnv,
    detached: false
  })

  webProcess.stdout?.on('data', (data: Buffer) => {
    console.log(`[Web] ${data}`)
  })

  webProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`[Web Error] ${data}`)
  })

  webProcess.on('error', (error: Error) => {
    console.error('Failed to start Web process:', error)
    throw error
  })

  // Wait for Next.js to start
  await new Promise<void>((resolve, reject) => {
    const checkHealth = () => {
      fetch(`http://127.0.0.1:${config.webPort}`)
        .then(res => {
          if (res.ok) resolve()
          else setTimeout(checkHealth, 500)
        })
        .catch(() => setTimeout(checkHealth, 500))
    }

    // Wait a bit for server to start
    setTimeout(checkHealth, 2000)

    // Timeout after 60 seconds (Next.js can take longer to start)
    setTimeout(() => reject(new Error('Web health check timeout')), 60000)
  })

  console.log(`Next.js server started on port ${config.webPort}`)
}

// Stop servers
function stopServers() {
  if (apiProcess) {
    apiProcess.kill()
    apiProcess = null
  }
  if (webProcess) {
    webProcess.kill()
    webProcess = null
  }
}

// Create main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  })

  // Load app
  mainWindow.loadURL(`http://127.0.0.1:${config.webPort}/login`)

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools()
  }
}

// Single instance lock - must be called before app.whenReady()
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

// App event handlers
app.whenReady().then(async () => {
  // Create user data directories
  createUserDataDirectories()

  // Check if first run
  const isFirstRun = !store.has('initialized')
  if (isFirstRun) {
    store.set('initialized', true)
    // TODO: Show setup wizard
  }

  // Start servers
  try {
    await startApiServer()
    await startWebServer()

    // Create window
    createWindow()
  } catch (error) {
    console.error('Failed to start application:', error)
    dialog.showErrorBox(
      '应用启动失败',
      `无法启动服务：${(error as Error).message}\n\n请确认 resources 目录下包含 api.exe 和 web 文件夹。`
    )
    app.quit()
  }
})

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopServers()
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.on('before-quit', () => {
  stopServers()
})

// IPC handlers
ipcMain.handle('get-config', () => {
  return store.get('config')
})

ipcMain.handle('set-config', (_, configData: any) => {
  store.set('config', configData)
  return true
})

ipcMain.handle('get-app-info', () => {
  return {
    name: config.appName,
    version: config.appVersion,
    apiPort: config.apiPort,
    webPort: config.webPort,
    cloudBaseUrl: config.cloudBaseUrl,
    userDataPath: getUserDataPath()
  }
})

ipcMain.handle('restart-servers', async () => {
  try {
    stopServers()
    await startApiServer()
    await startWebServer()
    return { success: true, apiPort: config.apiPort, webPort: config.webPort }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('desktop-auth-get-session', () => getCloudSession())
ipcMain.handle('desktop-auth-save-session', (_, input) => setCloudSession(input))
ipcMain.handle('desktop-auth-clear-session', () => clearCloudSession())
ipcMain.handle('desktop-app-get-device-id', () => getDeviceId())
ipcMain.handle('desktop-app-get-version', () => config.appVersion)
ipcMain.handle('desktop-app-get-cloud-base-url', () => config.cloudBaseUrl)
