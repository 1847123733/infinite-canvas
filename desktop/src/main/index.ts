import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { basename, join } from 'path'
import { spawn, spawnSync } from 'child_process'
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs'
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

// Load env from packaged resources (production) or project directory (development)
function loadEnvFromResources() {
  const isDev = process.env.NODE_ENV === 'development'
  const candidates: string[] = []
  const ignoredKeys = isDev ? new Set<string>() : new Set(['NODE_ENV'])
  if (isDev) {
    candidates.push(join(process.cwd(), '.env'))
  } else {
    // Production: try both direct and nested resource paths for packaged env files.
    candidates.push(join(process.resourcesPath, 'resources', 'env.ini'))
    candidates.push(join(process.resourcesPath, 'env.ini'))
    candidates.push(join(process.resourcesPath, 'resources', '.env'))
    candidates.push(join(process.resourcesPath, '.env'))
  }
  for (const envPath of candidates) {
    if (!existsSync(envPath)) continue
    try {
      const content = readFileSync(envPath, 'utf-8')
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIndex = trimmed.indexOf('=')
        if (eqIndex === -1) continue
        const key = trimmed.slice(0, eqIndex).trim()
        const value = trimmed.slice(eqIndex + 1).trim()
        if (ignoredKeys.has(key)) continue
        if (!process.env[key]) {
          process.env[key] = value
        }
      }
      console.log(`[Infinite Canvas] Loaded env from ${envPath}`)
      return
    } catch (err) {
      console.warn('[Infinite Canvas] Failed to load env:', err)
    }
  }
}

loadEnvFromResources()

// Store for configuration
const store = new Store()

// Process references
let apiProcess: any = null
let webProcess: any = null
let mainWindow: BrowserWindow | null = null
let updateDownloadInProgress = false
let serversStarted = false

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

function updatePlatform() {
  if (process.platform === 'win32') return 'win'
  if (process.platform === 'darwin') return 'mac'
  if (process.platform === 'linux') return 'linux'
  return process.platform
}

function normalizeVersion(version: string) {
  return version.trim().replace(/^v/i, '').split('.').map(part => parseInt(part, 10) || 0)
}

function hasNewerVersion(remoteVersion: string, currentVersion: string) {
  const remote = normalizeVersion(remoteVersion)
  const current = normalizeVersion(currentVersion)
  const length = Math.max(remote.length, current.length)
  for (let i = 0; i < length; i += 1) {
    const remotePart = remote[i] || 0
    const currentPart = current[i] || 0
    if (remotePart === currentPart) continue
    return remotePart > currentPart
  }
  return false
}

function emitUpdateProgress(data: {
  status: 'downloading' | 'completed' | 'launching' | 'error'
  percent: number
  downloaded: number
  total: number
  message?: string
}) {
  mainWindow?.webContents.send('update-download-progress', data)
}

function getUpdateDownloadDirectory() {
  const updateDir = join(getUserDataPath(), 'updates')
  if (!existsSync(updateDir)) {
    mkdirSync(updateDir, { recursive: true })
  }
  return updateDir
}

function getUpdateFilePath(downloadUrl: string) {
  const pathname = new URL(downloadUrl).pathname
  const originalName = basename(pathname) || 'Infinite Canvas Setup.exe'
  const safeName = decodeURIComponent(originalName).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
  const fileName = safeName.toLowerCase().endsWith('.exe') ? safeName : `${safeName}.exe`
  return join(getUpdateDownloadDirectory(), fileName)
}

async function downloadUpdatePackage(downloadUrl: string, expectedTotal = 0) {
  const response = await fetch(downloadUrl)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  if (!response.body) {
    throw new Error('安装包下载流不可用')
  }

  const total = parseInt(response.headers.get('content-length') || '0', 10) || expectedTotal
  const targetPath = getUpdateFilePath(downloadUrl)
  const tempPath = `${targetPath}.download`
  const reader = response.body.getReader()
  let downloaded = 0
  let fileStream: ReturnType<typeof createWriteStream> | null = null

  try {
    if (existsSync(tempPath)) unlinkSync(tempPath)
    if (existsSync(targetPath)) unlinkSync(targetPath)
    fileStream = createWriteStream(tempPath)

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      await new Promise<void>((resolve, reject) => {
        fileStream.write(Buffer.from(value), (error) => {
          if (error) reject(error)
          else resolve()
        })
      })
      downloaded += value.length
      const percent = total > 0 ? Math.min(100, Number(((downloaded / total) * 100).toFixed(1))) : 0
      emitUpdateProgress({
        status: 'downloading',
        percent,
        downloaded,
        total,
        message: '正在下载更新安装包'
      })
    }

    await new Promise<void>((resolve, reject) => {
      fileStream.end((error) => {
        if (error) reject(error)
        else resolve()
      })
    })

    renameSync(tempPath, targetPath)
    emitUpdateProgress({
      status: 'completed',
      percent: 100,
      downloaded,
      total: total || downloaded,
      message: '下载完成，准备启动安装程序'
    })
    return targetPath
  } catch (error) {
    fileStream?.destroy()
    if (existsSync(tempPath)) unlinkSync(tempPath)
    throw error
  }
}

function launchWindowsInstaller(installerPath: string) {
  const currentPid = process.pid
  const updateDir = getUpdateDownloadDirectory()
  const helperPath = join(updateDir, `launch-installer-${currentPid}.vbs`)
  const logPath = join(updateDir, `launch-installer-${currentPid}.log`)
  const escapedInstallerPath = installerPath.replace(/"/g, '""')
  const escapedLogPath = logPath.replace(/"/g, '""')
  const helperScript = [
    'On Error Resume Next',
    'Dim shell, fso, wmi, processes, retries',
    'Set shell = CreateObject("WScript.Shell")',
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    `target = "${escapedInstallerPath}"`,
    `logPath = "${escapedLogPath}"`,
    `waitPid = ${currentPid}`,
    'WriteLog "helper started"',
    'Set wmi = GetObject("winmgmts:\\\\.\\root\\cimv2")',
    'retries = 0',
    'Do While retries < 8',
    '  Set processes = wmi.ExecQuery("Select * from Win32_Process Where ProcessId = " & waitPid)',
    '  If processes.Count = 0 Then Exit Do',
    '  WScript.Sleep 1000',
    '  retries = retries + 1',
    'Loop',
    'WriteLog "launching installer """" & target & """""',
    'shell.Run Chr(34) & target & Chr(34), 1, False',
    'WriteLog "run command finished with err " & Err.Number',
    'fso.DeleteFile WScript.ScriptFullName, True',
    '',
    'Sub WriteLog(message)',
    '  Dim file',
    '  Set file = fso.OpenTextFile(logPath, 8, True)',
    '  file.WriteLine "[" & Now & "] " & message',
    '  file.Close',
    'End Sub'
  ].join('\r\n')
  writeFileSync(helperPath, helperScript, 'utf-8')

  const helper = spawn('wscript.exe', [
    helperPath
  ], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  })
  helper.unref()
}

function quitForUpdate() {
  try {
    mainWindow?.destroy()
  } catch (error) {
    console.warn('Failed to destroy main window during update quit:', error)
  }
  stopServers()
  setTimeout(() => app.exit(0), 100)
}

function getWindowIconPath() {
  if (process.platform !== 'win32') {
    return undefined
  }

  const devIconPath = join(process.cwd(), 'build', 'icon.ico')
  return existsSync(devIconPath) ? devIconPath : undefined
}

function getWindowsCleanupScriptPath() {
  return app.isPackaged
    ? join(process.resourcesPath, 'resources', 'tools', '清理C盘.bat')
    : join(process.cwd(), 'resources', 'tools', '清理C盘.bat')
}

async function launchWindowsCleanupScript() {
  if (process.platform !== 'win32') {
    return { success: false, error: '清理 C 盘工具仅支持 Windows' }
  }

  const scriptPath = getWindowsCleanupScriptPath()
  if (!existsSync(scriptPath)) {
    return { success: false, error: '未找到内置清理脚本' }
  }

  const escapedScriptPath = scriptPath.replace(/'/g, "''")
  return await new Promise<{ success: boolean; error?: string }>(resolve => {
    let settled = false
    const finish = (result: { success: boolean; error?: string }) => {
      if (settled) return
      settled = true
      resolve(result)
    }
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-Command',
      `Start-Process -FilePath $env:ComSpec -ArgumentList '/d /c ""${escapedScriptPath}""' -Verb RunAs`
    ], {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true
    })

    child.on('error', error => {
      console.error('Failed to launch cleanup script:', error)
      finish({ success: false, error: '启动清理工具失败' })
    })
    child.on('close', code => {
      finish(code === 0
        ? { success: true }
        : { success: false, error: '未启动清理工具，请确认已允许管理员权限' })
    })
  })
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function getStartupHtml(message: string, isError = false) {
  const safeMessage = escapeHtml(message)
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Infinite Canvas</title>
  <style>
    :root {
      color-scheme: light;
      font-family: "Microsoft YaHei", "PingFang SC", system-ui, sans-serif;
      background: #f7f4ef;
      color: #27231d;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at 18% 16%, rgba(53, 121, 92, 0.14), transparent 28%),
        linear-gradient(135deg, #fbfaf6 0%, #efe8dc 100%);
    }
    main {
      width: min(460px, calc(100vw - 64px));
      display: grid;
      gap: 22px;
      justify-items: center;
      text-align: center;
    }
    .mark {
      width: 62px;
      height: 62px;
      display: grid;
      place-items: center;
      border: 1px solid rgba(39, 35, 29, 0.14);
      border-radius: 18px;
      background: rgba(255, 252, 247, 0.72);
      box-shadow: 0 18px 42px rgba(50, 42, 30, 0.12);
    }
    .spinner {
      width: 30px;
      height: 30px;
      border-radius: 999px;
      border: 3px solid rgba(55, 122, 92, 0.18);
      border-top-color: ${isError ? '#b5473f' : '#35795c'};
      animation: spin 0.9s linear infinite;
    }
    h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 650;
      letter-spacing: 0;
    }
    p {
      margin: 8px 0 0;
      color: #6e6253;
      font-size: 14px;
      line-height: 1.8;
    }
    .bar {
      width: 220px;
      height: 3px;
      overflow: hidden;
      border-radius: 999px;
      background: rgba(39, 35, 29, 0.09);
    }
    .bar::after {
      content: "";
      display: block;
      width: 42%;
      height: 100%;
      border-radius: inherit;
      background: ${isError ? '#b5473f' : '#35795c'};
      animation: slide 1.2s ease-in-out infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes slide {
      0% { transform: translateX(-110%); }
      55%, 100% { transform: translateX(250%); }
    }
    @media (prefers-reduced-motion: reduce) {
      .spinner, .bar::after { animation: none; }
    }
  </style>
</head>
<body>
  <main>
    <div class="mark"><div class="spinner"></div></div>
    <section>
      <h1>Infinite Canvas</h1>
      <p>${safeMessage}</p>
    </section>
    <div class="bar"></div>
  </main>
</body>
</html>`
}

function loadStartupPage(message: string, isError = false) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const html = getStartupHtml(message, isError)
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(error => {
    console.error('Failed to load startup page:', error)
  })
}

function loadAppPage() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.loadURL(`http://127.0.0.1:${config.webPort}/login`).catch(error => {
    console.error('Failed to load app page:', error)
  })
}

async function waitForHttpOk(url: string, timeoutMs: number) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // Keep polling until the service is ready or the timeout is reached.
    }
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  throw new Error(`Health check timeout: ${url}`)
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
  const isDev = process.env.NODE_ENV === 'development'
  const resourceRoot = isDev ? join(process.cwd(), '..') : process.resourcesPath

  // Find available port
  config.apiPort = await findAvailablePort(config.apiPort)

  // Get platform-specific binary path
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
    INFINITE_CANVAS_APP_DATA_DIR: userDataPath,
    INFINITE_CANVAS_RESOURCE_DIR: resourceRoot,
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

  await waitForHttpOk(`http://127.0.0.1:${config.apiPort}/api/health`, 30000)

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

  await waitForHttpOk(`http://127.0.0.1:${config.webPort}`, 60000)

  console.log(`Next.js server started on port ${config.webPort}`)
}

// Stop servers
function stopServers() {
  serversStarted = false
  const processes = [apiProcess, webProcess].filter(Boolean)
  apiProcess = null
  webProcess = null

  for (const child of processes) {
    if (!child.pid) continue
    if (process.platform === 'win32') {
      spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true
      })
    } else {
      child.kill()
    }
  }
}

// Create main window
function createWindow() {
  const icon = getWindowIconPath()

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  })

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12' && !input.isAutoRepeat) {
      event.preventDefault()
      mainWindow?.webContents.toggleDevTools()
    }
  })

  loadStartupPage('正在启动本地服务，请稍候')

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

if (process.platform === 'win32') {
  app.setAppUserModelId('com.infinitecanvas1.app')
}

// App event handlers
app.whenReady().then(async () => {
  // Create user data directories
  createUserDataDirectories()

  // Restore cloudBaseUrl from persisted config if env var is absent (e.g. packaged exe)
  if (!config.cloudBaseUrl) {
    const stored = store.get('config.cloudBaseUrl') as string | undefined
    if (stored?.trim()) {
      config.cloudBaseUrl = stored.trim()
    }
  }

  // Check if first run
  const isFirstRun = !store.has('initialized')
  if (isFirstRun) {
    store.set('initialized', true)
    // TODO: Show setup wizard
  }

  createWindow()

  try {
    loadStartupPage('正在启动本地 API 服务')
    await startApiServer()
    loadStartupPage('正在启动程序界面服务')
    await startWebServer()
    serversStarted = true
    loadStartupPage('启动完成，正在打开登录页')
    loadAppPage()
  } catch (error) {
    console.error('Failed to start application:', error)
    loadStartupPage(`启动失败：${(error as Error).message}`, true)
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
    if (serversStarted) {
      loadAppPage()
    }
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
  // Sync cloudBaseUrl to in-memory config so restart-servers uses the new value
  if (typeof configData?.cloudBaseUrl === 'string') {
    config.cloudBaseUrl = configData.cloudBaseUrl.trim()
  }
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
    serversStarted = true
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
ipcMain.handle('desktop-app-run-windows-cleanup', () => launchWindowsCleanupScript())
ipcMain.handle('check-update', async () => {
  try {
    if (!config.cloudBaseUrl) {
      return null
    }
    const params = new URLSearchParams({
      platform: updatePlatform(),
      arch: process.arch
    })
    const response = await fetch(`${config.cloudBaseUrl.replace(/\/+$/, '')}/api/infinite-canvas/updates/latest?${params.toString()}`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const payload = await response.json() as {
      code: number
      data: {
        id: number
        version: string
        title: string
        releaseNotes: string
        platform: string
        arch: string
        downloadUrl: string
        fileSize: number
        status: string
      } | null
      message?: string
      msg?: string
    }
    if (payload.code !== 0) {
      throw new Error(payload.message || payload.msg || '请求失败')
    }
    if (!payload.data) {
      return null
    }
    return hasNewerVersion(payload.data.version, config.appVersion) ? payload.data : null
  } catch (error) {
    console.error('Failed to check update:', error)
    throw new Error('检测失败，请稍后重试')
  }
})
ipcMain.handle('download-update', async (_, url: string, expectedTotal?: number) => {
  if (process.platform !== 'win32') {
    try {
      await shell.openExternal(url)
      return { success: true }
    } catch (error) {
      console.error('Failed to open update url:', error)
      return { success: false, error: '打开下载地址失败' }
    }
  }

  if (updateDownloadInProgress) {
    return { success: false, error: '更新下载中，请稍后' }
  }

  updateDownloadInProgress = true
  try {
    const installerPath = await downloadUpdatePackage(url, expectedTotal || 0)
    emitUpdateProgress({
      status: 'launching',
      percent: 100,
      downloaded: 0,
      total: 0,
      message: '即将启动安装程序并关闭当前应用'
    })
    launchWindowsInstaller(installerPath)
    quitForUpdate()
    return { success: true, path: installerPath }
  } catch (error) {
    console.error('Failed to download update:', error)
    emitUpdateProgress({
      status: 'error',
      percent: 0,
      downloaded: 0,
      total: 0,
      message: '下载更新失败，请稍后重试'
    })
    return { success: false, error: '下载更新失败，请稍后重试' }
  } finally {
    updateDownloadInProgress = false
  }
})
