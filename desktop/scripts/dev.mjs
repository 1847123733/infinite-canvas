// Dev launcher script that ensures ELECTRON_RUN_AS_NODE is removed
// This is needed because VS Code's integrated terminal sets ELECTRON_RUN_AS_NODE=1,
// which causes Electron to run in Node.js mode instead of as a GUI app.

import { spawn } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')

// Remove ELECTRON_RUN_AS_NODE from environment
delete process.env.ELECTRON_RUN_AS_NODE

// Support subcommand: "node scripts/dev.mjs" → dev, "node scripts/dev.mjs preview" → preview
const command = process.argv[2] || 'dev'

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
