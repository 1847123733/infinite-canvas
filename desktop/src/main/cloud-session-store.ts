import { safeStorage } from 'electron'
import Store from 'electron-store'

interface StoredCloudSession {
  sessionId: string
  encryptedRefreshToken: string
}

interface CloudSessionInput {
  sessionId: string
  refreshToken: string
}

export interface CloudSession {
  sessionId: string
  refreshToken: string
}

const store = new Store()

function isStringInRange(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength
}

function readStoredCloudSession(): StoredCloudSession | null {
  const value = store.get('cloudSession') as Partial<StoredCloudSession> | undefined
  if (!value || !isStringInRange(value.sessionId, 64) || !isStringInRange(value.encryptedRefreshToken, 8192)) {
    return null
  }
  return {
    sessionId: value.sessionId,
    encryptedRefreshToken: value.encryptedRefreshToken
  }
}

export function getCloudSession(): CloudSession | null {
  const session = readStoredCloudSession()
  if (!session || !safeStorage.isEncryptionAvailable()) {
    return null
  }
  try {
    const refreshToken = safeStorage.decryptString(Buffer.from(session.encryptedRefreshToken, 'base64'))
    if (!isStringInRange(refreshToken, 4096)) {
      clearCloudSession()
      return null
    }
    return { sessionId: session.sessionId, refreshToken }
  } catch {
    clearCloudSession()
    return null
  }
}

export function setCloudSession(input: CloudSessionInput): true {
  if (!isStringInRange(input.sessionId, 64) || !isStringInRange(input.refreshToken, 4096)) {
    throw new Error('Invalid cloud session')
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Safe storage is not available on this platform')
  }
  const encryptedRefreshToken = safeStorage.encryptString(input.refreshToken).toString('base64')
  store.set('cloudSession', {
    sessionId: input.sessionId,
    encryptedRefreshToken
  })
  return true
}

export function clearCloudSession(): true {
  store.delete('cloudSession')
  return true
}
