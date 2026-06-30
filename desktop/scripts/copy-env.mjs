import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, copyFileSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const desktopDir = join(__dirname, '..')

const sourceEnv = join(desktopDir, '.env')
const targetIni = join(desktopDir, 'resources', 'env.ini')

if (existsSync(sourceEnv)) {
  copyFileSync(sourceEnv, targetIni)
  console.log(`Copied .env -> resources/env.ini`)
} else {
  console.warn('Warning: .env not found, skipping env.ini generation')
}
