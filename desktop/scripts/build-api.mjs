import { execSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, mkdirSync, copyFileSync, cpSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '../..')

console.log('Building Go API server...')

function stopLockedWindowsApi(targetPath) {
  if (process.platform !== 'win32') return
  const escapedPath = targetPath.replace(/'/g, "''")
  try {
    const output = execSync(
      `powershell -NoProfile -Command "(Get-Process | Where-Object { $_.Path -eq '${escapedPath}' } | Select-Object -ExpandProperty Id)"`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim()
    if (!output) return
    const pids = output
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean)
    for (const pid of pids) {
      console.log(`Stopping locked API process: ${pid}`)
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' })
    }
  } catch {
    // Ignore process lookup failures and let copy step surface any remaining lock.
  }
}

try {
  // Build Go binary for current platform
  const buildCommand = process.platform === 'win32'
    ? 'go build -o api.exe'
    : 'go build -o api'

  execSync(buildCommand, {
    cwd: join(projectRoot),
    stdio: 'inherit'
  })

  // Copy to resources directory
  const sourcePath = process.platform === 'win32'
    ? join(projectRoot, 'api.exe')
    : join(projectRoot, 'api')

  const targetDir = join(projectRoot, 'desktop', 'resources', 'api')
  const targetPath = process.platform === 'win32'
    ? join(targetDir, 'api.exe')
    : join(targetDir, 'api')

  // Create directory if it doesn't exist
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true })
  }

  stopLockedWindowsApi(targetPath)

  // Copy binary
  cpSync(sourcePath, targetPath)

  console.log('Go API build completed successfully!')
  console.log(`Binary location: ${targetPath}`)

} catch (error) {
  console.error('Failed to build Go API:', error)
  process.exit(1)
}
