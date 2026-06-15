# Findings & Decisions

## Requirements
- User wants two running/development plans:
  - `infinite-canvas`: desktop version, Electron desktop client development plan.
  - `vben-admin-monorepo-template`: cloud control/admin development plan for the desktop version.
- Read the project before changing anything.
- If issues are found during modification, fix them when related.
- Ask before executing anything uncertain.

## Research Findings
- Current working project root is `d:\work\Ai\image2\image1\infinite-canvas`.
- Existing docs include:
  - `docs/content/docs/backend/desktop-cloud-architecture.mdx`
  - `docs/content/docs/backend/desktop-client-development-plan.md`
  - `docs/content/docs/backend/desktop-cloud-server-development-plan.md`
  - `docs/content/docs/progress/todo.mdx`
  - `docs/content/docs/progress/pending-test.mdx`
- Existing desktop folder includes Electron-related files:
  - `desktop/package.json`
  - `desktop/electron.vite.config.ts`
  - `desktop/src/main/index.ts`
  - `desktop/src/preload/index.ts`
  - `desktop/BUILD.md`
  - `desktop/QUICKSTART.md`
- `vben-admin-monorepo-template` was not found in `d:\work\Ai\image2\image1` during initial listing, then found at `D:\work\Ai\vben-admin-monorepo-template`.
- Existing docs already contain two separate plans:
  - `desktop-client-development-plan.md`: Electron desktop client plan for `infinite-canvas`.
  - `desktop-cloud-server-development-plan.md`: cloud control/admin plan for `vben-admin-monorepo-template`.
- `desktop-cloud-architecture.mdx` is the shared architecture document tying both plans together.
- `docs/index.md` already linked the three desktop/cloud docs, but `docs/content/docs/backend/meta.json` did not include them in the backend docs page list.
- `infinite-canvas` desktop main process currently exposes broad config IPC (`get-config`/`set-config`) and starts the app at `/login`; it does not yet have the planned `safeStorage` cloud session IPC or device ID helper.
- `infinite-canvas` Go image endpoint currently proxies model requests through local settings and local credits. The planned ticket/snapshot/OSS upload orchestration is not implemented yet.
- `vben-admin-monorepo-template` FastAPI backend currently uses `/api/auth` stateless JWT login with direct password matching and does not yet have the planned desktop session, ticket, task, or log tables.
- User confirmed implementation order: first cloud phase A in `vben-admin-monorepo-template`, then desktop Electron session infrastructure in `infinite-canvas`.
- User explicitly requested the new desktop-specific auth chain without changing existing `/api/auth` backend login, and requested Vue page work without running build/test.
- Cloud phase A implementation added desktop-specific auth endpoints under `/api/infinite-canvas/auth/*`, admin session list/revoke endpoints, four desktop cloud-control models, and a Vue desktop session management page.
- Electron desktop shell now has safeStorage-backed cloud refresh-token IPC, a stable installation device ID, and cloud base URL propagation to local Go and Next.js processes.
- Next.js cloud auth store/login page integration is implemented as an Electron-only path: Electron + cloud URL uses cloud desktop auth, while normal web use keeps the existing local auth flow.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Use repo docs as primary source | The user asked to read the project first, and development plans already exist under docs. |
| Keep changes scoped | AGENTS.md says not to change unrelated files or refactor opportunistically. |
| Fix backend docs navigation now | The missing `meta.json` entries are directly related to the two development plans and low risk. |
| Keep existing `/api/auth` unchanged | User explicitly requested a separate desktop auth chain. |
| Add desktop session management page under System Management | It matches phase A session administration and the existing Vben system-management table style. |
| Implement Next cloud auth as Electron-only path | It creates cloud desktop sessions now while preserving the existing web/local login flow. |
| Use a separate cloud auth store without persistence | Access Token stays in memory, while Refresh Token stays in Electron `safeStorage`. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Recursive search for `vben-admin-monorepo-template` timed out after returning the matching path | Treat the returned path as found and continue with direct reads from that path. |
| Desktop/cloud docs were linked from `docs/index.md` but absent from backend docs sidebar metadata | Added the three docs to `docs/content/docs/backend/meta.json` and recorded a pending-test item. |
| `app/schemas.py` is a module file, so `app.schemas.infinite_canvas` would not import as a package | Moved new desktop schemas to `app/infinite_canvas_schemas.py`. |
| PowerShell treated `(user)` in `web/src/app/(user)/login/page.tsx` as expression syntax during diff | Re-ran the check with a quoted path. |

## Resources
- `AGENTS.md`
- `docs/content/docs/backend/desktop-cloud-architecture.mdx`
- `docs/content/docs/backend/desktop-client-development-plan.md`
- `docs/content/docs/backend/desktop-cloud-server-development-plan.md`
- `desktop/`
- `D:\work\Ai\vben-admin-monorepo-template`
- `docs/content/docs/backend/meta.json`
- `D:\work\Ai\vben-admin-monorepo-template\apps\ai-server\app\models.py`
- `D:\work\Ai\vben-admin-monorepo-template\apps\ai-server\app\infinite_canvas_schemas.py`
- `D:\work\Ai\vben-admin-monorepo-template\apps\ai-server\app\services\desktop_auth_service.py`
- `D:\work\Ai\vben-admin-monorepo-template\apps\ai-server\app\routes\infinite_canvas.py`
- `D:\work\Ai\vben-admin-monorepo-template\apps\web-antd\src\views\system\infinite-canvas-sessions\index.vue`
- `desktop/src/main/cloud-session-store.ts`
- `desktop/src/main/device-id.ts`
- `desktop/src/main/index.ts`
- `desktop/src/preload/index.ts`
- `web/src/services/api/cloud-auth.ts`
- `web/src/stores/use-cloud-auth-store.ts`
- `web/src/app/(user)/login/page.tsx`
- `web/src/components/layout/client-root-init.tsx`
- `web/src/components/layout/user-status-actions.tsx`
- `web/src/types/desktop.ts`

## Visual/Browser Findings
- None.
