import { randomUUID } from 'crypto'

import Store from 'electron-store'

const store = new Store()
const deviceIdKey = 'desktop-installation-id'

export function getDeviceId(): string {
  const saved = store.get(deviceIdKey)
  if (typeof saved === 'string' && saved.length > 0 && saved.length <= 64) {
    return saved
  }
  const deviceId = randomUUID()
  store.set(deviceIdKey, deviceId)
  return deviceId
}
