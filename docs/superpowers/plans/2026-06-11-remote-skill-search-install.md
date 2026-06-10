<!-- Implementation plan for remote skill search, guarded install, and richer skill introductions. -->
# Remote Skill Search And Install Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add governed online search and download for remote Agent Skills, then improve local and remote skill introductions without bypassing SkillGov validation.

**Architecture:** Add a remote-skill adapter to `packages/core` for the web server, add matching Tauri commands for desktop-native mode, and expose both through the existing `api` abstraction. The UI adds a remote search/preview/install panel and enriches the existing skill detail introduction while keeping agent mapping as a separate action.

**Tech Stack:** TypeScript, React, Vitest, Node fetch, Rust 2021, Tauri 2, reqwest, serde_json, Biome.

---

## Assumptions

- `skills.sh` is the first remote source.
- Remote installation imports a skill into `SkillGov/skills/<name>` and updates the registry. It does not map the skill into Claude, Codex, or another target.
- Remote data is untrusted until local validation passes.
- The user has already requested execution after plan review, but implementation should still stop if this plan is rejected or changed.

## File Structure

- Create `packages/core/src/remote-skills.ts`: remote search/download normalization, payload validation, and install helpers.
- Create `packages/core/src/__tests__/remote-skills.test.ts`: core TDD coverage.
- Modify `packages/core/src/index.ts`: export remote-skill types and functions.
- Modify `apps/control-panel/server.ts`: add `remote/search`, `remote/preview`, and `remote/install` routes.
- Modify `apps/control-panel/__tests__/server.test.ts`: route security and response tests.
- Modify `apps/control-panel/src/types.ts`: add remote result, preview, and install types.
- Modify `apps/control-panel/src/api/controlPanelApi.ts`: add web API methods.
- Modify `apps/control-panel/src/api/desktopApi.ts`: add desktop API methods.
- Modify `apps/control-panel/src/pages/Explore.tsx`: add remote search state and panel.
- Create `apps/control-panel/src/components/RemoteSkillSearch.tsx`: remote search, preview, install UI.
- Modify `apps/control-panel/src/components/SkillDetail.tsx`: richer local skill introduction display.
- Modify `apps/control-panel/src/i18n.ts`: add labels for remote search and introduction fields.
- Modify `apps/desktop/src-tauri/Cargo.toml`: add `reqwest` and `sha2` only if needed by Rust commands.
- Modify `apps/desktop/src-tauri/src/commands.rs`: add remote search, preview, safe staging, install, and tests.
- Modify `apps/desktop/src-tauri/src/desktop.rs`: register new Tauri commands.

---

### Task 1: Define Remote Types And Core Guards

**Files:**

- Create: `packages/core/src/remote-skills.ts`
- Create: `packages/core/src/__tests__/remote-skills.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests for remote query and path validation**

Add tests that prove invalid queries, invalid remote IDs, oversized payloads, absolute paths, `..` segments, and missing root `SKILL.md` are rejected.

Run:

```bash
vitest run packages/core/src/__tests__/remote-skills.test.ts
```

Expected: fail because `remote-skills.ts` does not exist yet.

- [ ] **Step 2: Implement minimal remote types and guards**

Add exported types for `RemoteSkillResult`, `RemoteSkillPreview`, `RemoteInstallResult`, and helper guards:

- `normalizeRemoteQuery`
- `validateRemoteSkillId`
- `validateDownloadedSkillPayload`
- `safeDownloadedFilePath`

Limits:

- Query: 1 to 100 chars.
- Limit: 1 to 50.
- Files: max 100.
- Per file: max 512 KB.
- Total payload: max 2 MB.
- Path: relative POSIX-style paths only, no empty segment, `.`, `..`, backslash, drive prefix, or absolute path.

- [ ] **Step 3: Export the module**

Export the new functions and types from `packages/core/src/index.ts`.

- [ ] **Step 4: Verify Task 1**

Run:

```bash
vitest run packages/core/src/__tests__/remote-skills.test.ts
```

Expected: pass.

Commit:

```bash
git add packages/core/src/remote-skills.ts packages/core/src/__tests__/remote-skills.test.ts packages/core/src/index.ts
git commit -m "feat: add remote skill validation guards"
```

Review round 1: review guards and fix any Critical or Important issue.

---

### Task 2: Add Core Search And Preview Adapter

**Files:**

- Modify: `packages/core/src/remote-skills.ts`
- Modify: `packages/core/src/__tests__/remote-skills.test.ts`

- [ ] **Step 1: Write failing tests for search normalization**

Use a fake fetch implementation that returns `skills.sh`-style data. Test normalized fields, stable result order, installed-state injection, and network error messages.

- [ ] **Step 2: Implement `searchRemoteSkills`**

Implement a function that:

- Builds `https://skills.sh/api/search`.
- Uses `AbortController` for a timeout.
- Rejects malformed JSON.
- Normalizes `id`, `skillId`, `name`, `source`, and `installs`.
- Marks `installed` by comparing names with locally discovered skills passed in options.

- [ ] **Step 3: Write failing tests for preview extraction**

Use fake download data with a valid `SKILL.md`. Assert the preview contains `name`, `description`, `fileCount`, `totalBytes`, `remoteHash`, and `issues`.

- [ ] **Step 4: Implement `previewRemoteSkill`**

Call the download endpoint, validate the payload, parse root `SKILL.md` frontmatter, and return a preview without writing files.

- [ ] **Step 5: Verify Task 2**

Run:

```bash
vitest run packages/core/src/__tests__/remote-skills.test.ts
```

Expected: pass.

Commit:

```bash
git add packages/core/src/remote-skills.ts packages/core/src/__tests__/remote-skills.test.ts
git commit -m "feat: add remote skill search and preview"
```

Review round 2: review search/preview behavior and fix findings.

---

### Task 3: Add Core Remote Install

**Files:**

- Modify: `packages/core/src/remote-skills.ts`
- Modify: `packages/core/src/__tests__/remote-skills.test.ts`

- [ ] **Step 1: Write failing tests for safe install**

Create a temporary project root and a fake downloaded skill. Assert:

- Valid skill is promoted to `skills/<name>`.
- Invalid skill is removed from `incoming/`.
- Existing managed skill replacement returns a clear message.
- Path traversal payload writes nothing outside the project root.

- [ ] **Step 2: Implement `installRemoteSkill`**

Implementation should:

- Download the payload.
- Validate payload paths and sizes.
- Rebuild it under a temporary source directory inside `incoming/.remote-downloads/<safe-id>`.
- Call existing `importSkill`.
- Use origin `remote:skills.sh:<remote-id>`.
- Clean temporary files after pass/fail.

- [ ] **Step 3: Verify Task 3**

Run:

```bash
vitest run packages/core/src/__tests__/remote-skills.test.ts packages/core/src/__tests__/import.test.ts
```

Expected: pass.

Commit:

```bash
git add packages/core/src/remote-skills.ts packages/core/src/__tests__/remote-skills.test.ts
git commit -m "feat: install remote skills through validation"
```

Review round 3: review staging and cleanup safety, then fix findings.

---

### Task 4: Add Web API Routes

**Files:**

- Modify: `apps/control-panel/server.ts`
- Modify: `apps/control-panel/__tests__/server.test.ts`

- [ ] **Step 1: Write failing server tests**

Add tests for:

- `/api/remote/search` rejects missing query.
- `/api/remote/preview` rejects missing remote ID.
- `/api/remote/install` rejects missing remote ID.
- Remote routes reject missing session cookie.
- Search route returns normalized result shape with mocked core fetch.

- [ ] **Step 2: Add routes**

Wire the routes into `apiRoutes`:

- `remote/search`
- `remote/preview`
- `remote/install`

Use the existing POST/session/origin/body-limit protection.

- [ ] **Step 3: Verify Task 4**

Run:

```bash
vitest run apps/control-panel/__tests__/server.test.ts
```

Expected: pass.

Commit:

```bash
git add apps/control-panel/server.ts apps/control-panel/__tests__/server.test.ts
git commit -m "feat: expose remote skill web APIs"
```

Review round 4: review web route security and fix findings.

---

### Task 5: Add Desktop Remote Commands

**Files:**

- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `apps/desktop/src-tauri/src/commands.rs`
- Modify: `apps/desktop/src-tauri/src/desktop.rs`

- [ ] **Step 1: Write failing Rust tests for path guards**

Add tests that reject absolute paths, `..`, backslashes, and missing `SKILL.md` in downloaded payloads.

Run from `apps/desktop/src-tauri`:

```bash
cargo test remote
```

Expected: fail because remote helpers do not exist yet.

- [ ] **Step 2: Add Rust remote types and validators**

Mirror the TypeScript response shapes using `serde`.

- [ ] **Step 3: Add HTTP search/preview/install commands**

Use `reqwest` blocking or async support consistent with the current Tauri command style. Keep timeouts finite. Rebuild payloads under `incoming/.remote-downloads`, validate, promote to `skills/`, and update `registry/skills.json`.

- [ ] **Step 4: Register commands**

Add the new commands in `desktop.rs`.

- [ ] **Step 5: Verify Task 5**

Run:

```bash
corepack pnpm --filter @skillgov/desktop test
```

Expected: pass.

Commit:

```bash
git add apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock apps/desktop/src-tauri/src/commands.rs apps/desktop/src-tauri/src/desktop.rs
git commit -m "feat: add desktop remote skill commands"
```

Review round 5: review desktop filesystem and network safety, then fix findings.

---

### Task 6: Extend Shared Frontend API

**Files:**

- Modify: `apps/control-panel/src/types.ts`
- Modify: `apps/control-panel/src/api/controlPanelApi.ts`
- Modify: `apps/control-panel/src/api/desktopApi.ts`

- [ ] **Step 1: Write failing type-level or component integration test**

Add or update a test that expects `api.searchRemoteSkills`, `api.previewRemoteSkill`, and `api.installRemoteSkill` to exist in both adapters.

- [ ] **Step 2: Add remote API methods**

Web adapter calls:

- `remote/search`
- `remote/preview`
- `remote/install`

Desktop adapter invokes:

- `search_remote_skills`
- `preview_remote_skill`
- `install_remote_skill`

- [ ] **Step 3: Verify Task 6**

Run:

```bash
pnpm test
```

Expected: pass.

Commit:

```bash
git add apps/control-panel/src/types.ts apps/control-panel/src/api/controlPanelApi.ts apps/control-panel/src/api/desktopApi.ts apps/control-panel/__tests__
git commit -m "feat: add remote skill frontend API"
```

Review round 6: review API shape consistency and fix findings.

---

### Task 7: Build Remote Search UI

**Files:**

- Create: `apps/control-panel/src/components/RemoteSkillSearch.tsx`
- Modify: `apps/control-panel/src/pages/Explore.tsx`
- Modify: `apps/control-panel/src/i18n.ts`

- [ ] **Step 1: Write failing UI tests**

Test:

- Search button calls remote search.
- Empty results render an empty state.
- Preview shows description and file count.
- Invalid preview disables install.
- Successful install triggers `loadDiscover`.

- [ ] **Step 2: Implement `RemoteSkillSearch`**

Keep the panel compact and operational. Use normal buttons and existing visual style. Show:

- Query input.
- Loading/error state.
- Result list.
- Preview details.
- Install button.

- [ ] **Step 3: Wire into Explore**

Place the remote search panel above the local `FilterBar`. Keep local refresh and pagination unchanged.

- [ ] **Step 4: Verify Task 7**

Run:

```bash
vitest run apps/control-panel/__tests__/page.test.ts apps/control-panel/__tests__/client-script.test.ts
pnpm test
```

Expected: pass.

Commit:

```bash
git add apps/control-panel/src/components/RemoteSkillSearch.tsx apps/control-panel/src/pages/Explore.tsx apps/control-panel/src/i18n.ts apps/control-panel/__tests__
git commit -m "feat: add remote skill search panel"
```

Review round 7: review UI state handling and fix findings.

---

### Task 8: Improve Skill Introduction

**Files:**

- Modify: `apps/control-panel/src/components/SkillDetail.tsx`
- Modify: `apps/control-panel/src/i18n.ts`
- Modify: `apps/control-panel/src/types.ts` if extra display metadata is needed.

- [ ] **Step 1: Write failing UI test**

Test that the detail panel renders:

- Current-language description.
- Fallback description if current language is missing.
- Description source and review status.
- Validation status.
- Source label.

- [ ] **Step 2: Update SkillDetail**

Add a compact introduction section above target selection. Keep mapping buttons and compatibility behavior unchanged.

- [ ] **Step 3: Verify Task 8**

Run:

```bash
pnpm test
```

Expected: pass.

Commit:

```bash
git add apps/control-panel/src/components/SkillDetail.tsx apps/control-panel/src/i18n.ts apps/control-panel/src/types.ts apps/control-panel/__tests__
git commit -m "feat: improve skill introduction details"
```

Review round 8: review introduction UX and fix findings.

---

### Task 9: Integration And Security Regression

**Files:**

- Modify only files needed to fix integration issues found by verification.

- [ ] **Step 1: Run focused integration checks**

Run:

```bash
vitest run packages/core/src/__tests__/remote-skills.test.ts apps/control-panel/__tests__/server.test.ts
corepack pnpm --filter @skillgov/desktop test
```

Expected: all pass.

- [ ] **Step 2: Run full TypeScript verification**

Run:

```bash
pnpm lint
pnpm test
tsc -b
```

Expected: all pass.

- [ ] **Step 3: Fix any issues**

Use TDD for every behavior fix. Do not make cosmetic refactors.

Commit fixes:

```bash
git add <changed-files>
git commit -m "fix: harden remote skill integration"
```

Review round 9: review integrated behavior and fix findings.

---

### Task 10: Desktop Build And Final Review

**Files:**

- Modify only files needed to fix build or final review issues.

- [ ] **Step 1: Build local desktop exe**

Run:

```bash
pnpm desktop:local-exe
```

Expected: build passes. If old `dist/SkillGov.exe` is running, script writes `dist/SkillGov-fixed.exe` and smoke-tests that file.

- [ ] **Step 2: Perform final project review**

Review the full diff against the design:

- Remote search works.
- Remote preview works.
- Remote install validates before writing.
- No path traversal or oversized payload can write files.
- Local skill order remains stable after refresh.
- Skill introductions are clearer.
- No legacy install APIs are re-enabled.

- [ ] **Step 3: Fix final findings**

Fix Critical and Important findings and rerun the relevant tests.

- [ ] **Step 4: Push final state**

Run:

```bash
git status -sb
git push
```

Expected: all commits are pushed and worktree is clean.

Review round 10: final full-project review and verification review.

---

## Plan Self-Review

Spec coverage:

- Online search: covered by Tasks 2, 4, 5, 6, and 7.
- Download and install: covered by Tasks 3, 4, 5, and 7.
- Skill introduction optimization: covered by Task 8.
- Security: covered by Tasks 1, 3, 4, 5, 9, and 10.
- 10 review rounds: explicitly assigned after Tasks 1 through 10.

Placeholder scan:

- No placeholder markers or unspecified deferred-error wording remain.
- Each task has specific files, checks, and expected command outcomes.

Type consistency:

- Frontend method names map directly to web routes and desktop commands.
- Remote result, preview, and install types are introduced before adapters and UI consume them.

Scope check:

- The plan intentionally avoids marketplace accounts, remote publishing, shell-based installers, automatic mapping, and AI summaries. Those would expand the project beyond the requested feature and beyond SkillGov's current README scope.

Risks and mitigations:

- `skills.sh` API may change: isolate it behind `remote-skills.ts` and Rust remote helpers.
- Desktop/web behavior may drift: use matching frontend types and tests for both adapters.
- Remote payloads can be malicious: validate paths, sizes, metadata, and root `SKILL.md` before writing or promoting.
- Existing skill overwrite could surprise users: return explicit replacement messages and keep mapping separate.
