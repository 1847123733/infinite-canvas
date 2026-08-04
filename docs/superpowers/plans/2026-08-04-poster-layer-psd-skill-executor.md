# Poster Layer PSD Skill Executor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. This session executes inline because the user explicitly requested implementation and delegation is not enabled.

**Goal:** Replace the one-shot PSD pipeline with a dedicated executor that loads the bundled `poster-layer-psd` instructions, builds a PSD, visually reviews the preview with the configured vision-capable text model, and reruns corrected configurations.

**Architecture:** Keep task lifecycle and file delivery in `service/psd_task.go`. Add a focused executor that owns the generate/build/review loop and injects only the model and Python boundaries for tests. Reuse the Responses API and bundled Python script; do not add a generic Codex runtime or new dependency.

**Tech Stack:** Go, OpenAI-compatible Responses API, bundled `poster_layer_psd.py`, existing SQLite/GORM settings, Go `testing` and `httptest`.

## Global Constraints

- Load `.agents/skills/poster-layer-psd/SKILL.md` and `references/config-schema.md` from the packaged resource root at runtime.
- Preserve the existing PSD task API, task statuses, artifact names, and local storage layout.
- Use `reasoning: {"effort":"high"}` and `text.format.type: "json_object"` through `/responses`.
- Allow at most two model-requested revisions after the initial build.
- Do not rebuild or overwrite `api.exe`, commit changes, or modify unrelated files.

---

### Task 1: Executor state machine

**Files:**
- Create: `service/poster_layer_psd_executor.go`
- Create: `service/poster_layer_psd_executor_test.go`

**Interfaces:**
- Produces: `newPosterLayerPSDExecutor() posterLayerPSDExecutor`
- Produces: `(posterLayerPSDExecutor).Execute(ctx, taskDir, sourcePath, basename, modelName string) error`
- Consumes: injected generate, build, and review functions at the external model/Python boundaries.

- [ ] Write a failing test in which the first preview review returns `revise`, the executor persists the corrected config, rebuilds, reviews again, and finishes only after `pass`.
- [ ] Run `go test ./service -run '^TestPosterLayerPSDExecutor' -count=1` and confirm the executor is missing.
- [ ] Implement the minimal generate/build/review loop with two allowed revisions and normalized corrected JSON.
- [ ] Add a failing exhaustion test and implement the bounded failure message.
- [ ] Run the focused executor tests until green.

### Task 2: Skill-aware Responses calls

**Files:**
- Modify: `service/psd_task.go`
- Modify: `service/psd_task_test.go`

**Interfaces:**
- Produces: `posterLayerPSDSkillPrompt() (string, error)`.
- Produces: `reviewPSDLayerPreview(ctx, sourcePath, previewPath string, config []byte, basename, modelName string) (posterLayerPSDReview, error)`.
- Reuses: `readPSDResponseContent` and `normalizePSDLayerConfig`.

- [ ] Extend the existing Responses integration test to reject generation requests that do not contain the bundled skill instructions.
- [ ] Add a failing review integration test that requires two `input_image` items and parses `pass`/`revise` JSON.
- [ ] Load `SKILL.md` and `config-schema.md` through the existing resource-root lookup and include them in generation and review instructions.
- [ ] Extract the common Responses JSON request logic without changing authentication, timeout, or upstream error behavior.
- [ ] Run the PSD Responses integration tests until green.

### Task 3: Connect task execution to the executor

**Files:**
- Modify: `service/psd_task.go`
- Modify: `service/poster_layer_psd_executor.go`

**Interfaces:**
- Consumes: `newPosterLayerPSDExecutor().Execute(...)` from `executePSDTask`.
- Produces: `runPosterLayerPSDBuild(ctx, sourcePath, configPath, taskDir, basename string) error` using the existing Python runtime and output validation.

- [ ] Move the existing Python invocation into the executor build boundary without changing command arguments or validation.
- [ ] Replace the one-shot body of `executePSDTask` with the dedicated executor call.
- [ ] Run `gofmt` on changed Go files.
- [ ] Run `go test ./service -count=1` and inspect `git diff --check`.

## Self-review

- Spec coverage: runtime skill loading, initial generation, Python execution, visual review, corrected rerun, bounded iteration, validation, and unchanged delivery are covered.
- Placeholder scan: no deferred implementation steps or unspecified error handling remain.
- Type consistency: executor generate/build/review signatures are shared by production construction and tests; review returns one `posterLayerPSDReview` type.
