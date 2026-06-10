<!-- Design spec for adding remote skill search, guarded downloads, and richer skill introductions. -->
# Remote Skill Search And Install Design

## Context

SkillGov is intentionally not a public marketplace, but it does need a governed way to find remote Agent Skills, preview them, download them into the local SkillGov library, and then let the existing mapping workflow decide where they are used.

Current local behavior already covers discovery, validation, compatibility checks, mapping, rollback, and bilingual description fallback. The missing part is a safe remote intake path.

External references checked:

- Salesforce `sf-pi` exposes `SF Skills`, which manages skills through one funnel: catalog sources, gate them, toggle per scope, resolve conflicts, show a live HUD, track usage, and prune. Reference: https://github.com/salesforce/sf-pi
- `skills.sh` exposes search and download APIs used by the `vercel-labs/skills` ecosystem. Observed search response includes `id`, `skillId`, `name`, `installs`, and `source`; observed download response includes `files[]` and `hash`.
- `vercel-labs/skills` PR 7 documents that installs should exclude files that are only useful for development and keep the runtime skill payload focused. Reference: https://github.com/vercel-labs/skills/pull/7

I did not find a standalone public repository named exactly `skills-hud`. The closest public match to the requested idea is Salesforce `SF Skills`, which appears to be the continuation or public equivalent of the HUD-style skill management concept.

## Goals

1. Add online search for remote skills.
2. Let users preview a remote skill before installing it.
3. Download and import selected skills into `skills/<skill>` through the existing validation pipeline.
4. Keep remote install separate from agent mapping so no downloaded skill is automatically injected into Claude, Codex, or another target.
5. Improve the skill introduction area so local and remote skills show clearer purpose, source, review state, and validation context.
6. Preserve the existing security posture: localhost-only API, POST session checks, no legacy install APIs, no arbitrary command execution, and no writes outside the project root.
7. Execute implementation with 10 review rounds, where each round means code review followed by fixes before proceeding.

## Non-Goals

1. Do not build a general marketplace.
2. Do not execute `npx skills install`, shell scripts, or remote commands.
3. Do not auto-map downloaded skills to an agent directory.
4. Do not add AI-generated summaries or translations in this phase.
5. Do not add account login, ratings, comments, or remote publishing.

## Recommended Approach

Use backend-mediated remote access.

The React UI calls SkillGov APIs. The web server calls the TypeScript core remote adapter. The desktop app calls native Tauri commands that implement the same API contract using Rust HTTP requests. This avoids browser CORS and keeps privileged filesystem writes in trusted backend code.

Rejected alternatives:

1. Browser-only `fetch` to `skills.sh`: simpler, but blocked by CORS/CSP and would force the privileged install step to trust frontend-provided remote data.
2. Shelling out to the `skills` CLI: fastest to prototype, but it bypasses SkillGov validation, provenance, registry, and safety controls.
3. A full marketplace abstraction: too broad for this request and not aligned with the README's scope.

## Remote Data Flow

1. User enters a query in the Explore page remote-search panel.
2. UI calls `api.searchRemoteSkills(query)`.
3. Backend calls `https://skills.sh/api/search?q=<query>&limit=<limit>`.
4. Backend normalizes results into a SkillGov remote result shape:
   - `id`
   - `skillId`
   - `name`
   - `source`
   - `installs`
   - `installed`
   - `validationStatus` when already installed locally
5. User selects a result and clicks preview.
6. Backend calls `https://skills.sh/api/download/<id>`.
7. Backend validates the payload in memory and extracts:
   - frontmatter name
   - frontmatter description
   - file count
   - total bytes
   - remote hash
   - validation blockers
8. User clicks install.
9. Backend downloads again or reuses a short-lived cached payload, writes to `incoming/<safe-name>`, validates `SKILL.md`, and promotes through the existing import flow.
10. Local discovery refreshes and the installed skill appears in the normal SkillGov library.

## Security Design

Remote payloads are untrusted until local validation passes.

Required guards:

1. Remote source allowlist: only `https://skills.sh/api/search` and `https://skills.sh/api/download/<id>` in this phase.
2. Query limits: non-empty query, max 100 characters, default limit 20, max limit 50.
3. Remote ID validation: allow only source-like IDs made from safe segments, for example `owner/repo/skill` or `github/awesome-copilot/foo`.
4. File count limit: max 100 files.
5. File size limits: max 512 KB per file, max 2 MB total payload.
6. Path traversal prevention: reject absolute paths, drive-letter paths, empty segments, `.`, `..`, backslash traversal, and paths that resolve outside the staging directory.
7. Skill name safety: final directory name must match the safe local skill-name rules already used by validation.
8. Root `SKILL.md` required.
9. Validation first: `validateSkill` must return `pass` before promotion to `skills/`.
10. Existing skill overwrite is explicit: install may refresh the same skill, but the result message must say it replaced an existing managed skill.
11. No automatic target mapping after download.
12. Registry provenance: `registry/skills.json` records origin such as `remote:skills.sh:<remote-id>` plus remote hash/source where the schema allows it.

## UI Design

The Explore page gains a compact remote search panel above the local skill table:

- Search input and button.
- Result rows with name, remote source, install count, installed state, and actions.
- Preview panel for the selected remote result.
- Install button enabled only after preview passes basic payload checks.

The existing local skill list remains the main library. After remote install succeeds, the list refreshes in stable sorted order.

The skill detail area becomes a clearer introduction panel:

- Purpose: resolved description for the current language, fallback description when needed.
- Source: local, Codex plugin cache, manual import, or remote source.
- Review: description review status and validation status.
- Files: path and install provenance.
- Guidance: map/unmap remains separate from download/install.

## API Shape

Extend the shared frontend API with:

```ts
searchRemoteSkills(query: string): Promise<RemoteSearchResponse>
previewRemoteSkill(remoteId: string): Promise<RemotePreviewResponse>
installRemoteSkill(remoteId: string): Promise<RemoteInstallResponse>
```

Web routes:

- `POST /api/remote/search`
- `POST /api/remote/preview`
- `POST /api/remote/install`

Desktop commands:

- `search_remote_skills`
- `preview_remote_skill`
- `install_remote_skill`

## Testing Strategy

Use TDD for behavior changes.

Core tests:

- Search query validation.
- Search result normalization and deterministic order.
- Download payload path traversal rejection.
- Payload size and file-count rejection.
- `SKILL.md` requirement.
- Pass/fail/fixable install behavior.

Server tests:

- Remote routes require the existing local session cookie.
- Missing query/remote ID returns errors.
- Remote install returns validation failure instead of writing bad skills.

Desktop tests:

- Rust path guard rejects traversal.
- Rust installer refuses invalid metadata.
- Rust search/preview response shape matches frontend types.

Frontend tests:

- Remote search states: idle, loading, results, empty, error.
- Preview disables install on invalid payload.
- Successful install refreshes local skills.
- Skill detail renders richer introduction fields.

Verification:

- `pnpm lint`
- `pnpm test`
- `tsc -b`
- `pnpm desktop:test`
- Release desktop build or at least `pnpm desktop:local-exe` when implementation touches Tauri commands.

## Review Plan

Perform 10 review rounds during implementation:

1. Remote-source model and core validation review.
2. Remote search adapter review.
3. Remote download and safe staging review.
4. Web API route/security review.
5. Desktop Rust command/security review.
6. Frontend remote search UX review.
7. Skill introduction UI review.
8. Integration and error-state review.
9. Security regression review.
10. Final full-project review and verification review.

Each round must record findings, fix Critical and Important issues before proceeding, and rerun the relevant test gate.

## Open Decisions

1. Remote source is fixed to `skills.sh` for the first implementation. Additional remote catalogs can be added later behind an explicit adapter interface.
2. "Install" means import into SkillGov's managed local `skills/` directory. Mapping to agents stays a separate user action.
3. Description optimization is deterministic display and metadata enrichment only. Translation or summarization remains manual.

