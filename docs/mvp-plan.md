<!-- This file records the SkillGov MVP implementation plan, module breakdown, testing strategy, and acceptance criteria. -->
# SkillGov MVP Plan

## Goal

SkillGov v1 is a local Agent Skills governance tool.

It manages the lifecycle of standard Agent Skills by importing, validating,
checking compatibility, routing installation, and rolling back changes for
Claude Code and Codex.

The core rule is:

```text
Standard first. Overlay only when needed. Install only after review.
```

## MVP Scope

SkillGov v1 manages skills only.

It does not directly manage:

- MCP servers
- CLI tools
- plugins
- agents
- workflows
- hooks

Those items may be recorded as skill dependencies, but they are outside the
first implementation scope.

## File Header Rule

Every project file must start with a first-line comment that explains what the
file is for and what functionality it implements.

Examples:

```ts
// Defines the SkillGov registry read/write APIs and operation log helpers.
```

```jsonc
// Stores default target profiles for Claude Code and Codex.
```

```md
<!-- Documents the MVP implementation plan and testing strategy for SkillGov. -->
```

For file formats that do not support comments, the project should either avoid
that format when reasonable or document the exception in the nearest README.

## Project Parts

SkillGov is split into ten parts.

```text
1. Config
2. Target Profiles
3. Registry
4. Skill Import
5. Standard Validator
6. Compatibility Checker
7. Repair and Overlay Task Generator
8. Installer and Router
9. CLI and Control Panel
10. Python Extension Slot
```

## 1. Config

The config system reads and writes `skillgov.config.json`.

Responsibilities:

- detect the project root
- load user config
- resolve relative paths
- normalize Windows and Unix paths
- support dry-run mode
- avoid hard-coded user-specific paths

Initial config shape:

```json
{
  "projectRoot": "D:/SkillGov",
  "defaultLinkMode": "junction",
  "targets": ["claude", "codex"]
}
```

Tests:

- initializes default config when missing
- reports a clear error when config is invalid
- normalizes Windows paths
- normalizes Unix-like paths
- respects dry-run mode

## 2. Target Profiles

Target profiles describe where each supported agent stores skills and which
features it can use.

MVP targets:

- Claude Code
- Codex

Example profile:

```json
{
  "claude": {
    "skillDirs": ["~/.claude/skills"],
    "linkMode": "junction",
    "supports": {
      "skillMd": true,
      "allowedTools": "partial",
      "scripts": "unknown"
    }
  },
  "codex": {
    "skillDirs": ["~/.codex/skills"],
    "linkMode": "junction",
    "supports": {
      "skillMd": true,
      "allowedTools": "partial",
      "scripts": "unknown"
    }
  }
}
```

Tests:

- resolves `~`
- finds default Claude skill path
- finds default Codex skill path
- returns `target_not_found` for unknown targets
- lets user config override default profiles

## 3. Registry

The registry is SkillGov's state store.

Files:

```text
registry/skills.json
registry/compatibility.json
registry/installs.json
registry/operations.jsonl
```

Responsibilities:

- record skill metadata
- record source path and origin
- record file hashes
- record standard validation status
- record target compatibility status
- record install locations
- append operation logs for rollback

Tests:

- adding a skill updates `skills.json`
- repeated import detects duplicates
- operation logs append instead of overwrite
- damaged registry files produce repairable errors
- registry writes are atomic enough to avoid partial writes

## 4. Skill Import

Import moves or copies an external skill into the SkillGov review flow.

Flow:

```text
external path
    -> incoming/<skill>
    -> standard validation
    -> skills/<skill>
```

Rules:

- import never installs a skill
- import never bypasses validation
- import preserves origin metadata
- import computes hashes for later drift detection

Tests:

- imports a valid skill directory
- rejects a missing path
- detects a missing `SKILL.md`
- handles same-name import
- handles assets, scripts, and references

## 5. Standard Validator

The standard validator is the first review layer.

It checks whether an imported directory is a valid Agent Skill.

Checks:

- `SKILL.md` exists
- frontmatter can be parsed
- `name` exists
- `description` exists
- skill name is stable
- referenced files exist
- dangerous absolute paths are reported
- structure is understandable

Results:

```text
pass
fixable
fail
```

Fixture tests:

```text
valid-basic-skill
missing-skill-md
invalid-yaml-frontmatter
missing-name
missing-description
name-dir-mismatch
broken-reference
skill-with-assets
skill-with-scripts
```

## 6. Compatibility Checker

The compatibility checker is the second review layer.

It checks whether a valid standard skill can run on a target agent.

Results:

```text
compatible
needs-overlay
unsupported
unknown
```

Checks:

- `compatibility` field
- `allowed-tools` usage
- Claude-specific tool references
- Codex-specific tool references
- missing MCP dependencies
- missing CLI dependencies
- script runtime requirements
- target-specific wording

Fixture tests:

```text
generic-skill-compatible-all
claude-only-skill
codex-only-skill
skill-requires-mcp
skill-requires-python
skill-with-unknown-tools
skill-with-dangerous-command
```

## 7. Repair and Overlay Task Generator

SkillGov does not call an AI API in the MVP.

When a skill needs repair or target-specific work, SkillGov generates a task
document for a human or external AI session.

Task paths:

```text
tasks/repair/<skill>.md
tasks/overlay/<target>/<skill>.md
```

Task contents:

- source skill path
- detected issues
- target result
- target agent constraints
- forbidden changes
- output path
- validation command
- install command

Tests:

- repair task is generated for `fixable`
- overlay task is generated for `needs-overlay`
- no overlay task is generated for `compatible`
- task generation avoids accidental overwrite
- task includes validation and install instructions

## 8. Installer and Router

The installer maps each target agent to the correct usable version.

Routing rules:

```text
If standard version is compatible:
    target skill directory -> skills/<skill>

If target overlay is required and valid:
    target skill directory -> overlays/<target>/<skill>

If unsupported or unknown:
    block install
```

Windows default link mode:

```text
junction
```

Other platforms:

```text
symlink
```

Copy mode may exist as fallback, but links are preferred.

Tests:

- installs standard skill to Claude
- installs standard skill to Codex
- installs overlay skill to Claude
- installs overlay skill to Codex
- blocks unsupported install
- detects existing same-name skill
- detects stale link
- uninstall removes mapping only
- rollback restores previous state

## 9. CLI and Control Panel

The CLI is built first.

Planned commands:

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

The control panel is added after the core and CLI work.

UI principles:

- button-based only
- no free-form command input
- uses the same core operations as the CLI
- shows logs and reports
- opens reports and tasks folders

Initial buttons:

- Scan
- Status
- Import
- Validate
- Check Claude compatibility
- Check Codex compatibility
- Generate repair task
- Generate overlay task
- Install to Claude
- Install to Codex
- Uninstall
- Rollback

Tests:

- each CLI command has output tests
- UI buttons call core operations
- UI does not expose arbitrary shell execution
- UI reports errors visibly

## 10. Python Extension Slot

Python is not required for MVP.

Reserved path:

```text
scripts/python/
```

Future uses:

- complex local document parsing
- migration scripts
- large-scale skill quality analysis
- local model support
- PDF or Office processing

Rule:

```text
MVP core functionality must not depend on Python.
```

## Milestones

### Milestone 1: Project Skeleton

Deliver:

- pnpm workspace
- `packages/core`
- `packages/cli`
- `apps/control-panel` placeholder
- test framework
- lint and format setup

Acceptance:

- tests run
- CLI help prints
- every new source file follows the first-line comment rule

### Milestone 2: Config and Registry

Deliver:

- `init`
- config loading
- registry loading and writing
- operation log append

Acceptance:

- default project files are created
- repeated init is safe
- operations are logged

### Milestone 3: Import and Standard Validation

Deliver:

- import into `incoming`
- validation checks
- promotion into `skills`

Acceptance:

- valid skill passes
- invalid skill fails
- fixable skill gets clear issues

### Milestone 4: Compatibility and Tasks

Deliver:

- target compatibility checks
- repair task generation
- overlay task generation

Acceptance:

- generic skill is compatible with Claude and Codex
- target-specific skill is marked `needs-overlay`
- unsupported skill is blocked

### Milestone 5: Install, Status, Doctor, Rollback

Deliver:

- install routing
- uninstall
- status
- doctor
- rollback

Acceptance:

- compatible standard skill can be linked into a test target
- overlay skill can be routed for one target
- uninstall does not delete source
- rollback restores previous install state

### Milestone 6: Button Control Panel

Deliver:

- local web server
- button UI
- status table
- operation log view
- reports and tasks folder open actions

Acceptance:

- user can scan, validate, install, uninstall, and rollback without opening
  PowerShell
- UI and CLI produce equivalent results

## End-to-End Test Scenarios

### Scenario 1: Standard Skill Install

```text
1. import valid-basic
2. validate -> pass
3. compat --target claude -> compatible
4. install --target claude -> link created
5. status -> installed
6. uninstall -> link removed
7. rollback -> link restored
```

### Scenario 2: Target Overlay Required

```text
1. import claude-only
2. validate -> pass
3. compat --target codex -> needs-overlay
4. install --target codex -> blocked
5. task overlay --target codex -> task created
6. add valid overlay fixture
7. validate overlay -> pass
8. install --target codex -> overlay mapped
```

### Scenario 3: Broken Skill Repair

```text
1. import missing-description
2. validate -> fixable
3. task repair -> task created
4. repair skill manually or with external AI
5. validate -> pass
6. compat --target claude -> compatible
```

### Scenario 4: Unsafe Skill Block

```text
1. import skill-with-dangerous-command
2. validate -> pass with warning or fixable
3. compat --target claude -> unsupported or unknown
4. install -> blocked
5. doctor -> reports unsafe issue
```

## MVP Acceptance Criteria

SkillGov v1 is acceptable when it can:

- initialize a local SkillGov project
- import a skill
- validate standard Agent Skill structure
- check Claude and Codex compatibility
- block unsafe or unsupported installs
- generate repair and overlay tasks
- install compatible skills using links
- route target overlays when required
- uninstall without deleting source skills
- rollback at least the most recent install operation
- show status and doctor reports
- keep all project files compliant with the first-line comment rule

The most important invariant:

```text
SkillGov never blindly installs every skill into every agent.
It must validate, check compatibility, route, and then install.
```
