import { execSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, mkdirSync, copyFileSync, cpSync, rmSync, writeFileSync, readFileSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '../..')
const desktopPackage = JSON.parse(readFileSync(join(projectRoot, 'desktop', 'package.json'), 'utf8'))

console.log('Building Next.js application...')

try {
  const webDir = join(projectRoot, 'web')

  // Install dependencies if needed
  if (!existsSync(join(webDir, 'node_modules'))) {
    console.log('Installing web dependencies...')
    execSync('bun install', {
      cwd: webDir,
      stdio: 'inherit'
    })
  }

  // Build Next.js with standalone output
  console.log('Building Next.js...')
  execSync('bun run build', {
    cwd: webDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      OUTPUT_STANDALONE: 'true',
      NEXT_PUBLIC_APP_VERSION: desktopPackage.version
    }
  })

  // Copy output to resources directory
  const targetDir = join(projectRoot, 'desktop', 'resources', 'web')

  // Clean target directory if exists
  if (existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true, force: true })
  }

  // Create target directory
  mkdirSync(targetDir, { recursive: true })

  // Copy server.js and .next directory
  const sourceServer = join(webDir, '.next', 'standalone', 'server.js')
  const sourceNextDir = join(webDir, '.next', 'standalone', '.next')
  const sourcePublicDir = join(webDir, '.next', 'standalone', 'public')
  const sourceNodeModules = join(webDir, '.next', 'standalone', 'node_modules')

  // Important: standalone output does NOT include static files or public assets.
  // These must be copied from the original build output separately.
  const sourceStaticDir = join(webDir, '.next', 'static')
  const sourceOriginalPublicDir = join(webDir, 'public')

  if (existsSync(sourceServer)) {
    copyFileSync(sourceServer, join(targetDir, 'server.js'))
  } else {
    throw new Error('server.js not found in standalone build')
  }

  if (existsSync(sourceNextDir)) {
    cpSync(sourceNextDir, join(targetDir, '.next'), { recursive: true })
  }

  // Copy static files (CSS, JS chunks) from original build output
  // The standalone .next/ does NOT include the static/ directory
  if (existsSync(sourceStaticDir)) {
    cpSync(sourceStaticDir, join(targetDir, '.next', 'static'), { recursive: true })
    console.log('Copied .next/static/ (CSS, JS assets)')
  } else {
    console.warn('Warning: .next/static/ not found - static assets may be missing!')
  }

  if (existsSync(sourcePublicDir)) {
    cpSync(sourcePublicDir, join(targetDir, 'public'), { recursive: true })
  }

  // Also copy public/ from original source if standalone didn't include it
  if (!existsSync(sourcePublicDir) && existsSync(sourceOriginalPublicDir)) {
    cpSync(sourceOriginalPublicDir, join(targetDir, 'public'), { recursive: true })
    console.log('Copied public/ from source')
  }

  if (existsSync(sourceNodeModules)) {
    cpSync(sourceNodeModules, join(targetDir, 'node_modules'), { recursive: true })
  }

  // Copy node executable for production
  const nodeExeName = process.platform === 'win32' ? 'node.exe' : 'node'
  const nodeSource = process.execPath
  const nodeTarget = join(targetDir, nodeExeName)
  if (existsSync(nodeSource)) {
    copyFileSync(nodeSource, nodeTarget)
    console.log(`Copied ${nodeExeName} to ${targetDir}`)
  } else {
    throw new Error(`Node executable not found at ${nodeSource}`)
  }

  // Create a minimal package.json with "type": "module" to avoid Node.js warning
  const standalonePkgJson = join(webDir, '.next', 'standalone', 'package.json')
  if (existsSync(standalonePkgJson)) {
    copyFileSync(standalonePkgJson, join(targetDir, 'package.json'))
  } else {
    // If standalone didn't produce a package.json, create a minimal one
    writeFileSync(join(targetDir, 'package.json'), JSON.stringify({ type: 'module' }, null, 2))
  }

  console.log('Next.js build completed successfully!')
  console.log(`Output location: ${targetDir}`)

} catch (error) {
  console.error('Failed to build Next.js:', error)
  process.exit(1)
}
