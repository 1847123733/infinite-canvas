# Findings & Decisions

## Current Task: PSD Workbench

### Requirements
- Current project is the desktop exe infinite canvas.
- Analyze existing login and cloud LLM configuration flow.
- Add a feature named `PSD工作台`.
- `PSD工作台` should use a directly built-in prompt, support reference image upload, create async tasks, and show generation status.
- Use `chatgpt2api` as the reference project for PSD generation.
- Frontend final steps should not run build, full typecheck, or ESLint.

### Research Findings
- Current project root contains Electron desktop code under `desktop/`, Go API under `handler/` / `service/` / `router/`, and Next.js frontend under `web/`.
- `desktop/package.json` identifies the packaged desktop app as `infinite-canvas-desktop` version `0.0.6`; Electron build resources include packaged Go API, packaged Next web assets, and `env.ini`.
- Candidate `chatgpt2api` reference projects found:
  - `D:\work\Ai\image2\chatgpt2api`
  - `D:\work\Ai\image2\api2\chatgpt2api`
  - `D:\work\Ai\image2\image1\chatgpt2api`
- Use `D:\work\Ai\image2\image1\chatgpt2api` first because it is closest to the current project directory.
- Desktop login flow in `infinite-canvas`:
  - Electron reads `INFINITE_CANVAS_CLOUD_BASE_URL`, persists `cloudBaseUrl` in `electron-store`, exposes `desktopApp.getCloudBaseUrl/getDeviceId/getVersion` and `desktopAuth.getSession/saveSession/clearSession`.
  - Next login page calls `useCloudAuthStore.login`; it posts username/password/device metadata to cloud `/api/infinite-canvas/auth/login`.
  - Refresh token is stored through Electron `safeStorage`; access token is held in Zustand memory.
  - The Go middleware accepts normal local JWT first, then validates desktop cloud access tokens by calling cloud `/api/infinite-canvas/auth/me`; `canGenerate` must be true.
- Cloud LLM/model config flow:
  - Frontend uses remote-only AI config and reads public settings from local Go `/api/settings`.
  - Local Go can sync cloud-controlled LLM settings through `/api/settings/cloud-sync`.
  - The effective frontend config selects image/video/text/audio models from the synced public model channel.
- Existing desktop image generation ticket flow:
  - Frontend creates a cloud ticket through `/api/infinite-canvas/generation-tickets`.
  - Local Go exchanges the ticket through cloud `/generation-tickets/exchange`, receives model API credentials and OSS upload info, calls the upstream image endpoint, uploads the image to OSS, then calls cloud `/generation-tasks/{id}/complete` or `/fail`.
  - The cloud task table is currently shaped for one final image result.
- `chatgpt2api` PSD reference modules:
  - `api/ai.py` exposes `POST /v1/psd/generations`, `GET /v1/editable-file-tasks`, and `GET /files/{file_path}`.
  - `services/editable_file_task_service.py` owns async task persistence, idempotent `client_task_id`, owner scoping, status transitions `queued -> running -> success/error`, and result URLs.
  - `services/openai_backend_api.py` implements `export_psd_zip`; it requires a ChatGPT access token from a Plus/Team/Pro/Enterprise account, uploads reference images, runs the editable-file conversation with `gpt-5-5-thinking`, polls for `.psd` and `.zip` artifacts, downloads both files, and returns paths.
  - `web/src/app/debug/components/psd-panel.tsx` provides the built-in prompt: `按原图位置拆分海报元素并合成可编辑 PSD，保留背景和每个元素图层位置，同时输出每个图层素材 zip。`
  - `web/src/app/debug/components/editable-file-panel.tsx` implements the UI pattern matching the screenshot: history, prompt, reference upload, task creation, 5s polling, status panel, PSD/zip download links.
- Current cloud generation service in `D:\work\Ai\vben-admin-monorepo-template` allows scenes only `canvas` and `image_workbench`; a PSD workbench would need a new scene such as `psd_workbench` if it uses the same task table.
- Cloud `desktop_generation_tasks` currently stores one result URL/object key. PSD needs either a richer result payload for multiple files or a separate PSD task shape.
- User confirmed the desired direction is to migrate `chatgpt2api` PSD generation into the cloud-control FastAPI project.
- PSD model requirement from `chatgpt2api`:
  - The PSD generator uses ChatGPT Web editable-file export, not the OpenAI-compatible `/v1/images/*` image API.
  - Fixed model constant is `gpt-5-5-thinking`.
  - It requires a ChatGPT access token from a Plus/Team/Pro/Enterprise account pool.
  - It uploads one or more reference images, asks ChatGPT to split elements and export two artifacts: `.psd` and `.zip`.
  - Therefore the cloud-control `LLMModel.mode` needs a separate PSD/editable-file mode rather than reusing `image`.
- Current cloud-control model schema allows only `chat`, `image`, and `embedding`; Vben model form also only exposes those three modes.
- Current desktop config modal exposes only default image and default text model. The requested UI needs `defaultPsdModel` added through:
  - cloud-control `llm_models.mode` support for PSD models,
  - `infinite-canvas` Go external Vben sync result and public settings,
  - Next `AiConfig` / effective config,
  - `AppConfigModal` model picker.
- Current `SyncExternalVbenLLMSettings` filters out non-`chat`/`image` modes. It must accept PSD mode so desktop can pull the cloud-control PSD default model.
- Cloud-control FastAPI currently already has `python-multipart`, but not the PSD migration dependencies from `chatgpt2api`: `curl-cffi`, `pillow`, and possibly `pybase64` if reused directly.

### Technical Decisions
| Decision | Rationale |
|----------|-----------|
| No business-code edits before design approval | The active brainstorming skill requires a design approval gate for new functionality. |
| Prefer designing around existing desktop cloud auth/token flow | PSD workbench should not introduce a separate login or API key path in the desktop app. |
| Treat PSD as a separate model capability | PSD generation uses ChatGPT editable-file export and returns PSD/zip files, so it should not be classified as a normal image generation model. |

### Resources
- `desktop/package.json`
- `D:\work\Ai\image2\image1\chatgpt2api`
- `desktop/src/main/index.ts`
- `desktop/src/preload/index.ts`
- `web/src/app/(user)/login/page.tsx`
- `web/src/stores/use-cloud-auth-store.ts`
- `web/src/services/api/cloud-auth.ts`
- `web/src/services/api/cloud-generation.ts`
- `web/src/services/api/image.ts`
- `service/desktop_cloud_auth.go`
- `service/desktop_generation.go`
- `service/cloud_client.go`
- `router/router.go`
- `D:\work\Ai\image2\image1\chatgpt2api\api\ai.py`
- `D:\work\Ai\image2\image1\chatgpt2api\services\editable_file_task_service.py`
- `D:\work\Ai\image2\image1\chatgpt2api\services\openai_backend_api.py`
- `D:\work\Ai\image2\image1\chatgpt2api\web\src\app\debug\components\psd-panel.tsx`
- `D:\work\Ai\image2\image1\chatgpt2api\web\src\app\debug\components\editable-file-panel.tsx`
- `D:\work\Ai\vben-admin-monorepo-template\apps\ai-server\app\routes\infinite_canvas.py`
- `D:\work\Ai\vben-admin-monorepo-template\apps\ai-server\app\services\generation_ticket_service.py`

---

# Previous Findings & Decisions

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
