<!-- This file describes the purpose, scope, architecture, and MVP direction of the SkillGov project. -->
# SkillGov

SkillGov is a local governance tool for Agent Skills.

Its purpose is not to collect as many skills as possible, nor to create another
skill marketplace. SkillGov exists to make skills trustworthy, traceable, and
usable across local AI agent tools such as Claude Code and Codex.

## Project Goal

Agent Skills are designed to be reusable across compatible AI tools and agent
platforms. SkillGov follows that standard-first idea.

The core goal is:

> Manage standard Agent Skills locally, verify whether they are valid and
> compatible, and install the correct usable version into each target agent.

In practice, SkillGov should answer these questions:

- What skills exist on this machine?
- Where did each skill come from?
- Is this skill a valid Agent Skill?
- Can Claude Code use it directly?
- Can Codex use it directly?
- Does it need a target-specific overlay?
- Where is it installed?
- Is the installation a link, copy, or stale entry?
- Can the last operation be rolled back?

## Core Idea

SkillGov uses a standard-first workflow:

```text
Import skill
    -> Standard validation
    -> Compatibility review
    -> Use standard version when possible
    -> Create target overlay only when needed
    -> Install by mapping the target agent to the usable version
```

This means SkillGov does not create separate Claude and Codex versions by
default. Most skills should remain a single standard Agent Skill.

Target-specific versions are only created when a skill is valid in general but
not directly usable by a specific agent.

## Two-Level Review

### 1. Standard Validation

The first review checks whether an imported directory is a valid Agent Skill.

Examples of checks:

- It contains a `SKILL.md` file.
- `SKILL.md` has valid frontmatter.
- Required fields such as `name` and `description` exist.
- Skill naming is stable and consistent.
- Referenced files, scripts, assets, or resources exist.
- The directory structure is understandable.

Possible results:

- `pass`: valid standard skill.
- `fixable`: likely a skill, but needs repair.
- `fail`: not a valid skill.

If the skill is fixable, SkillGov can generate a repair task for a human or AI
assistant to complete. SkillGov itself does not need to call an AI API.

### 2. Compatibility Review

The second review checks whether a valid skill can be used by a target agent.

Initial MVP targets:

- Claude Code
- Codex

Compatibility is now target-profile driven. Each target profile describes where
an agent discovers skills and which capabilities it supports, so SkillGov can
add OpenCode, Gemini CLI, Cursor, or other tools through configuration instead
of hard-coded Claude/Codex branches.

Examples of checks:

- Does the skill declare target compatibility?
- Does it reference tools or permissions that the target agent does not have?
- Does it require scripts or runtimes that are unavailable?
- Does it depend on MCP servers, plugins, commands, or CLI tools?
- Does it declare capabilities such as agent routing, hooks, dynamic shell
  context, skill-level model settings, or tool permissions?
- Does it contain explicit target-only bindings that need an overlay?

Possible results:

- `compatible`: install the standard skill directly.
- `needs-overlay`: create a target-specific usable version.
- `unsupported`: do not install for this target.
- `unknown`: needs manual review.

## Version Routing

SkillGov maps each target agent to the correct usable version of a skill.
The mapping model is the primary way to associate skills with agents.

```text
SkillGov/skills/story-init
    Standard Agent Skill

SkillGov/overlays/claude/story-init
    Optional Claude-specific usable version

SkillGov/overlays/codex/story-init
    Optional Codex-specific usable version
```

Mapping routing:

```text
If standard version is compatible:
    target skill directory -> SkillGov/skills/<skill>

If target overlay is required:
    target skill directory -> SkillGov/overlays/<target>/<skill>

If unsupported:
    do not map
```

The `map` command creates a link from the target agent's skill directory to the
canonical managed skill. `unmap` removes that link. `adopt` discovers an
existing unmanaged skill in an agent's directory and brings it under SkillGov
management by moving it into the canonical `skills/` directory and creating the
mapping.

On Windows, mappings should normally use junctions where appropriate. Other
platforms can use symlinks. Copy mode may be supported as a fallback, but links
are preferred because they preserve a single source of truth.

The canonical managed skill lives in `skills/<skill>`. Target agent directories
should contain mappings to that canonical skill, not separate unmanaged copies
unless copy mode is the only available fallback. This keeps SkillGov focused on
central skill governance rather than skill accumulation.

All mapping state is stored in `registry/mappings.json`. The legacy
`installs.json` format is supported via automatic migration on first access.

## Scope

### MVP Includes

- Local project directory management.
- Skill import into an incoming area.
- Standard Agent Skill validation.
- Target-profile compatibility review for Claude Code, Codex, and configured
  future agents.
- Target overlay task generation.
- Map, unmap, adopt, status, and rollback operations.
- JSON registry files for skills, mappings, and operations.
- CLI first.
- A simple button-based local web UI over the core operations.

### MVP Does Not Include

- A public skill marketplace.
- Built-in AI API calls.
- Automatic semantic rewriting of skills.
- Full MCP server management.
- Full plugin management.
- Full workflow management.
- Desktop app packaging as the first milestone.
- Direct modification of plugin cache directories.

## AI Relationship

SkillGov is AI-assisted, not AI-integrated.

SkillGov does deterministic work:

- scan
- validate
- classify status
- generate repair or overlay tasks
- install
- uninstall
- rollback
- report

Humans or external AI sessions can do semantic work:

- repair malformed skills
- rewrite target-specific instructions
- create overlays
- review compatibility notes

This keeps SkillGov usable without API keys and avoids hidden token costs.

## Project Structure

```text
SkillGov/
incoming/
  <imported-but-not-yet-approved-skills>/
skills/
  <standard-agent-skills>/
overlays/
  claude/
  codex/
registry/
  skills.json
  mappings.json
  operations.jsonl
tasks/
  repair/
  overlay/
reports/
backups/
packages/
  core/
  cli/
apps/
  control-panel/
scripts/
  python/
skillgov.config.json
```

## Technical Direction

Primary stack:

- TypeScript
- Node.js

Python is reserved as an optional future extension point for complex local
analysis, migration scripts, or document processing. It should not be required
for the MVP core workflow.

Architecture:

```text
Core library
    -> CLI
    -> Local web control panel
```

The core library is the source of truth. The CLI and UI must call the same
underlying operations.

## CLI

Implemented command shape:

```text
skillgov init
skillgov inventory
skillgov import <path>
skillgov validate <skill>
skillgov compat <skill> --target claude
skillgov compat <skill> --target codex
skillgov task repair <skill>
skillgov task overlay <skill> --target claude
skillgov map <skill> --target claude
skillgov map <skill> --target codex
skillgov unmap <skill> --target claude
skillgov adopt <skill> --target codex
skillgov status
skillgov doctor
skillgov rollback --target claude
```

Legacy commands `install` and `uninstall` are still available but print a
deprecation warning. Use `map`/`unmap` instead.

## UI

The UI is a simple local button-based control panel.

It should not expose a free-form command input.

Implemented controls:

- Skill library with search, filter, and pagination
- Single skill operations: check compatibility, map, unmap, adopt
- Multi-skill batch operations: batch check, batch map, batch unmap, batch adopt
- Structured result display with summary cards and detail tables
- Status cards with metrics (total, applied, issues, non-skill dirs)
- Target agent selection
- Run doctor, rollback
- Language switcher (English / Chinese)

The UI is a convenience layer over the same core used by the CLI. Both use the
same mapping semantics (map/unmap/adopt) backed by `mappings.json`.

## Design Principles

- Standard-first: prefer one valid Agent Skill over many duplicated variants.
- Overlay only when necessary.
- Never modify plugin cache directories directly.
- Prefer links over copies when installing.
- Keep operations reversible.
- Keep registries explicit and inspectable.
- Do not hide AI costs inside the tool.
- Make every install decision explainable.
- Start with Claude Code and Codex, then expand through target profiles instead
  of hard-coded target-specific columns.
- Every project file that supports comments must start with a first-line comment
  explaining what the file is for and what functionality it implements. Use the
  native comment syntax for that file type, such as `//`, `#`, or `<!-- -->`.
  JSON files, JSONL files, and lockfiles are exempt because standard JSON and
  lockfile formats do not support comments.

## Current Status

As of 2026-05-30, the SkillGov MVP is functionally complete for the main local
governance workflow: project initialization, skill import, standard validation,
target compatibility review, repair and overlay task generation, map, unmap,
adopt, status, doctor, inventory, and target-based rollback are implemented
in the core library and exposed through both the CLI and the control panel UI.

The project is not complete as a finished product. It still needs end-to-end use
with real skills, stronger UI polish, and a few remaining acceptance items before
it should be treated as a mature everyday tool.

Implemented areas:

1. TypeScript workspace structure for `@skillgov/core`, `@skillgov/cli`, and the
   local control panel.
2. Config, registry, operation log, project initialization, and dry-run support
   for initialization/config writes.
3. Standard Agent Skill validation, import, hashing, reference checks, and path
   safety checks.
4. Target profiles with an explicit capability matrix for skill metadata,
   agent routing, hooks, MCP, scripts, and runtime-dependent features.
5. Repair and overlay task generation for human or external AI follow-up.
6. Map, unmap, adopt, status, doctor, inventory, and target-based rollback
   operations. Legacy install/uninstall commands are still available.
7. A central SkillGov skill library with mappings from target agent directories
   back to managed skills.
8. A button-based local web control panel backed by the same core operations.
9. Automated coverage across core, CLI, and control panel behavior.

Known gaps:

1. The current checkout has empty project registries; no real skills have been
   imported, reviewed, mapped, or rolled back in this project state.
2. Rollback currently targets the most recent operation for a target. It does
   not roll back an arbitrary operation id.
3. The CLI tests focus heavily on command routing and usage output; broader
   end-to-end CLI tests with fixture skills would improve confidence.
4. The project is not packaged as a standalone command or desktop app.
5. `docs/mvp-plan.md` is a historical plan and still contains some older command
   examples and UI acceptance items that are not fully reflected in the current
   implementation.

Latest verified state:

- Unit and API tests: 23 test files, 403 tests passing.
- Lint: Biome check passing.
- TypeScript: project build with `tsc -b` passing.
- Runtime smoke checks: local API and control panel checks are covered by the
  test suite.
