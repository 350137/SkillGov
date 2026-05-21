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

Examples of checks:

- Does the skill declare target compatibility?
- Does it reference tools that the target agent does not have?
- Does it require scripts or runtimes that are unavailable?
- Does it depend on MCP servers, plugins, commands, or CLI tools?
- Does it contain target-specific instructions that need an overlay?

Possible results:

- `compatible`: install the standard skill directly.
- `needs-overlay`: create a target-specific usable version.
- `unsupported`: do not install for this target.
- `unknown`: needs manual review.

## Version Routing

SkillGov installs a skill by mapping each target agent to the correct usable
version.

```text
SkillGov/skills/story-init
    Standard Agent Skill

SkillGov/overlays/claude/story-init
    Optional Claude-specific usable version

SkillGov/overlays/codex/story-init
    Optional Codex-specific usable version
```

Installation routing:

```text
If standard version is compatible:
    target skill directory -> SkillGov/skills/<skill>

If target overlay is required:
    target skill directory -> SkillGov/overlays/<target>/<skill>

If unsupported:
    do not install
```

On Windows, mappings should normally use junctions where appropriate. Other
platforms can use symlinks. Copy mode may be supported as a fallback, but links
are preferred because they preserve a single source of truth.

## Scope

### MVP Includes

- Local project directory management.
- Skill import into an incoming area.
- Standard Agent Skill validation.
- Claude Code and Codex compatibility review.
- Target overlay task generation.
- Install, uninstall, status, and rollback operations.
- JSON registry files for skills, compatibility, installs, and operations.
- CLI first.
- A simple button-based local web UI after the core and CLI work.

### MVP Does Not Include

- A public skill marketplace.
- Built-in AI API calls.
- Automatic semantic rewriting of skills.
- Full MCP server management.
- Full plugin management.
- Full workflow or agent management.
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

## Planned Project Structure

```text
SkillGov/
├─ incoming/
│  └─ <imported-but-not-yet-approved-skills>/
├─ skills/
│  └─ <standard-agent-skills>/
├─ overlays/
│  ├─ claude/
│  └─ codex/
├─ registry/
│  ├─ skills.json
│  ├─ compatibility.json
│  ├─ installs.json
│  └─ operations.jsonl
├─ tasks/
│  ├─ repair/
│  └─ overlay/
├─ reports/
├─ backups/
├─ packages/
│  ├─ core/
│  └─ cli/
├─ apps/
│  └─ control-panel/
├─ scripts/
│  └─ python/
└─ skillgov.config.json
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

## CLI Direction

Planned command shape:

```text
skillgov init
skillgov inventory
skillgov import <path>
skillgov validate <skill>
skillgov compat <skill> --target claude
skillgov compat <skill> --target codex
skillgov task repair <skill>
skillgov task overlay <skill> --target claude
skillgov install <skill> --target claude
skillgov install <skill> --target codex
skillgov uninstall <skill> --target claude
skillgov status
skillgov doctor
skillgov rollback <operation-id>
```

## UI Direction

The UI should be a simple local button-based control panel.

It should not expose a free-form command input.

Initial buttons:

- Scan environment
- View status
- Import skill
- Validate skill
- Check Claude compatibility
- Check Codex compatibility
- Generate repair task
- Generate overlay task
- Install to Claude
- Install to Codex
- Uninstall
- Roll back
- Open reports folder
- Open tasks folder

The UI is a convenience layer over the same core used by the CLI.

## Design Principles

- Standard-first: prefer one valid Agent Skill over many duplicated variants.
- Overlay only when necessary.
- Never modify plugin cache directories directly.
- Prefer links over copies when installing.
- Keep operations reversible.
- Keep registries explicit and inspectable.
- Do not hide AI costs inside the tool.
- Make every install decision explainable.
- Start with Claude Code and Codex, then expand to other targets later.
- Every project file must start with a first-line comment explaining what the
  file is for and what functionality it implements. Use the native comment
  syntax for that file type, such as `//`, `#`, or `<!-- -->`.

## Current Status

This repository is currently at the planning and scaffolding stage.

The first implementation milestone should be:

1. Create the TypeScript project structure.
2. Implement config and registry loading.
3. Implement standard skill validation.
4. Implement Claude and Codex target profiles.
5. Implement install routing with dry-run support.
6. Expose the first CLI commands.
