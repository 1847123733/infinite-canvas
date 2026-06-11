# Tauri Migration Findings

- Frontend currently uses Next standalone output and Docker runs `node server.js`.
- Go backend owns `/api/*`; Next route handler proxies frontend `/api/*` to Go.
- Static Tauri frontend cannot rely on Node route handlers.
- Canvas project route uses runtime IDs under `/canvas/[id]`, which is awkward for static export.
- Browser local persistence uses localforage/IndexedDB and can continue inside WebView.
- `ClientRootInit` fetches `/api/settings` and `/api/auth/me` on startup, so desktop API URL must be available synchronously.
- Use a fixed local sidecar port to avoid adding a Tauri API package dependency to frontend bootstrap.
