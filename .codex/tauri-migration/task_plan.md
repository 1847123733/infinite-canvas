# Tauri Migration Plan

## Goal

Package the app as a Tauri shell with a static Next.js frontend and a Go backend sidecar.

## Phases

- [complete] Read current frontend/backend runtime flow.
- [complete] Adjust Next static export and frontend runtime routing/API base handling.
- [complete] Add Go sidecar desktop startup options.
- [complete] Add Tauri v2 project files and Rust sidecar launcher.
- [complete] Update project docs for pending manual verification.

## Constraints

- Do not run build/test/syntax checks unless the user asks.
- Do not touch unrelated files.
- Preserve existing Docker/standalone behavior where possible.
