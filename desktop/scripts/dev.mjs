// Dev launcher script that ensures ELECTRON_RUN_AS_NODE is removed
// This is needed because VS Code's integrated terminal sets ELECTRON_RUN_AS_NODE=1,
// which causes Electron to run in Node.js mode instead of as a GUI app.

import { execSync, spawn } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
const envPath = resolve(projectRoot, '.env')

// Remove ELECTRON_RUN_AS_NODE from environment
delete process.env.ELECTRON_RUN_AS_NODE

function loadEnvFile(path) {
  if (!existsSync(path)) return
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index <= 0) continue
    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnvFile(envPath)

// Support subcommand: "node scripts/dev.mjs" → dev, "node scripts/dev.mjs preview" → preview
const command = process.argv[2] || 'dev'

async function runPrebuildIfNeeded() {
  if (command !== 'dev') return
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  for (const script of ['build:api', 'build:web']) {
    console.log(`[dev] running ${script}...`)
    execSync(`${npmCommand} run ${script}`, {
      cwd: projectRoot,
      stdio: 'inherit',
      env: process.env
    })
  }
}

try {
  await runPrebuildIfNeeded()
} catch (err) {
  console.error('Failed to prepare desktop resources:', err)
  process.exit(1)
}

// Use shell: true on Windows for .cmd support
const child = spawn('npx', ['electron-vite', command], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: process.env,
  shell: true
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})

child.on('error', (err) => {
  console.error('Failed to start electron-vite:', err)
  process.exit(1)
})
