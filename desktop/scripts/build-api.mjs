import { execSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, mkdirSync, copyFileSync, cpSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '../..')

console.log('Building Go API server...')

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

  // Copy binary
  cpSync(sourcePath, targetPath)

  console.log('Go API build completed successfully!')
  console.log(`Binary location: ${targetPath}`)

} catch (error) {
  console.error('Failed to build Go API:', error)
  process.exit(1)
}