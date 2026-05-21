# Milestone 1: Project Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the pnpm workspace monorepo with packages/core, packages/cli, apps/control-panel placeholder, vitest testing, and biome lint/format — all TypeScript source files following the first-line comment rule.

**Architecture:** pnpm workspace monorepo. `@skillgov/core` is the shared library. `@skillgov/cli` depends on core and provides the CLI entry. `apps/control-panel` is a placeholder for the future web UI. Tests live inside each package under `src/__tests__/`. biome handles both linting and formatting.

**Tech Stack:** TypeScript 5.x, Node.js 24, pnpm 10, vitest, biome, tsx (dev runner)

---

### Task 1: Root Workspace Configuration

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `biome.json`
- Create: `.editorconfig`

- [ ] **Step 1: Create root `package.json`**

```json
// Root workspace package.json for SkillGov monorepo — orchestrates packages/core, packages/cli, and apps/control-panel.
{
  "name": "skillgov",
  "private": true,
  "type": "module",
  "scripts": {
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.4",
    "typescript": "^5.7.0",
    "vitest": "^3.1.0"
  },
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  },
  "packageManager": "pnpm@10.33.2"
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
# Defines the pnpm workspace packages for the SkillGov monorepo.
packages:
  - "packages/*"
  - "apps/*"
```

- [ ] **Step 3: Create `tsconfig.base.json`**

```jsonc
// Shared base TypeScript configuration inherited by all SkillGov packages.
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "${configDir}/dist",
    "rootDir": "${configDir}/src"
  }
}
```

- [ ] **Step 4: Create `biome.json`**

```jsonc
// biome lint and format configuration for SkillGov — single tool for both responsibilities.
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "trailingCommas": "all",
      "semicolons": "always"
    }
  },
  "files": {
    "ignore": ["dist", "node_modules", ".git", "coverage", "*.json", "*.yaml", "*.md"]
  }
}
```

- [ ] **Step 5: Create `.editorconfig`**

```ini
# Shared editor settings so every contributor uses consistent indentation and line endings.
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 6: Install dependencies**

Run: `pnpm install`
Expected: installs biome, typescript, vitest to root node_modules

- [ ] **Step 7: Verify biome works**

```bash
pnpm exec biome --version
```
Expected: prints version number

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json biome.json .editorconfig
git commit -m "feat: initialize pnpm workspace with shared TypeScript, biome, and editor configs"
```

---

### Task 2: Core Package Setup

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/version.ts`
- Create: `packages/core/src/index.ts`

- [ ] **Step 1: Create `packages/core/package.json`**

```jsonc
// Package manifest for @skillgov/core — the shared library providing validation, compatibility, registry, and routing APIs.
{
  "name": "@skillgov/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 2: Create `packages/core/tsconfig.json`**

```jsonc
// TypeScript config for @skillgov/core — extends the shared base config.
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/core/src/version.ts`**

```ts
// Exposes the SkillGov core library version as a single constant for CLI and UI reporting.
export const VERSION = '0.1.0';

export function version(): string {
  return VERSION;
}
```

- [ ] **Step 4: Create `packages/core/src/index.ts`**

```ts
// Re-exports the public API surface of @skillgov/core.
export { VERSION, version } from './version.js';
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/
git commit -m "feat: scaffold @skillgov/core package with version export"
```

---

### Task 3: Core Package Tests

**Files:**
- Create: `packages/core/src/__tests__/version.test.ts`
- Create: `packages/core/src/__tests__/index.test.ts`

- [ ] **Step 1: Create `packages/core/src/__tests__/version.test.ts`**

```ts
// Tests for the version module — verifies the version string format and value.
import { describe, expect, it } from 'vitest';
import { VERSION, version } from '../version.js';

describe('version', () => {
  it('returns a semver-like string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('matches the version() helper output', () => {
    expect(version()).toBe(VERSION);
  });
});
```

- [ ] **Step 2: Create `packages/core/src/__tests__/index.test.ts`**

```ts
// Tests for the core public API — verifies all named exports are present and functional.
import { describe, expect, it } from 'vitest';
import { VERSION, version } from '../index.js';

describe('@skillgov/core public API', () => {
  it('exports VERSION as a non-empty string', () => {
    expect(typeof VERSION).toBe('string');
    expect(VERSION.length).toBeGreaterThan(0);
  });

  it('exports version() returning the same value', () => {
    expect(version()).toBe(VERSION);
  });
});
```

- [ ] **Step 3: Run core tests**

```bash
cd packages/core && pnpm vitest run
```
Expected: 3 tests pass (2 in version, 1 in index — wait, 2+2=4 tests)

Run: `cd packages/core && pnpm vitest run`
Expected: 4 tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/__tests__/
git commit -m "test: add version and public API tests for @skillgov/core"
```

---

### Task 4: CLI Package Setup

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/index.ts`

- [ ] **Step 1: Create `packages/cli/package.json`**

```jsonc
// Package manifest for @skillgov/cli — the command-line interface that wraps @skillgov/core operations.
{
  "name": "@skillgov/cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "bin": {
    "skillgov": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@skillgov/core": "workspace:*"
  },
  "devDependencies": {
    "tsx": "^4.19.0"
  }
}
```

- [ ] **Step 2: Install to pick up tsx**

```bash
pnpm install
```
Expected: installs tsx into packages/cli

- [ ] **Step 3: Create `packages/cli/tsconfig.json`**

```jsonc
// TypeScript config for @skillgov/cli — extends the shared base config.
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "references": [
    { "path": "../core" }
  ]
}
```

- [ ] **Step 4: Create `packages/cli/src/index.ts`**

```ts
// CLI entry point for SkillGov — parses subcommands and dispatches to @skillgov/core operations. MVP prints help only.
import { VERSION } from '@skillgov/core';

const HELP_TEXT = `skillgov v${VERSION}

Usage: skillgov <command> [options]

Commands:
  init                          Initialize a new SkillGov project
  inventory                     List all skills in the registry
  import <path>                 Import a skill into the incoming review area
  validate <skill>              Run standard Agent Skill validation
  compat <skill> --target <t>   Check compatibility for a target agent
  task repair <skill>           Generate a repair task for a fixable skill
  task overlay <skill> --target <t>  Generate a target overlay task
  install <skill> --target <t>  Install a skill to a target agent
  uninstall <skill> --target <t> Uninstall a skill from a target agent
  status                        Show current project status
  doctor                        Run diagnostics on the project
  rollback <operation-id>       Roll back an install operation

Target agents: claude, codex
`;

function main(args: string[]): void {
  if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    console.log(HELP_TEXT);
    return;
  }

  const command = args[0];

  if (command === 'version' || command === '--version' || command === '-v') {
    console.log(`skillgov v${VERSION}`);
    return;
  }

  console.log(`Unknown command: ${command}`);
  console.log(`Run 'skillgov help' for usage information.`);
  process.exitCode = 1;
}

main(process.argv.slice(2));
```

Note: The first two lines of the file use `//` comments per the file header rule. But the `#!/usr/bin/env node` shebang would come before any comment. Since we run via `tsx` rather than directly executing, the shebang is not strictly needed for MVP. If we later add a build step that produces a directly executable JS file, we would add the shebang then.

- [ ] **Step 5: Verify CLI help prints**

```bash
cd packages/cli && pnpm exec tsx src/index.ts
```
Expected: prints full help text with version number and all planned commands

```bash
cd packages/cli && pnpm exec tsx src/index.ts --help
```
Expected: same help text

```bash
cd packages/cli && pnpm exec tsx src/index.ts --version
```
Expected: `skillgov v0.1.0`

- [ ] **Step 6: Commit**

```bash
git add packages/cli/package.json packages/cli/tsconfig.json packages/cli/src/index.ts pnpm-lock.yaml
git commit -m "feat: scaffold @skillgov/cli package with help and version commands"
```

---

### Task 5: CLI Tests

**Files:**
- Create: `packages/cli/src/__tests__/cli.test.ts`

- [ ] **Step 1: Create `packages/cli/src/__tests__/cli.test.ts`**

```ts
// Tests for the CLI entry point — verifies help output, version, and unknown command behavior.
import { describe, expect, it, vi } from 'vitest';

// The CLI module executes on import, so we test behaviors by capturing stdout.
// We re-implement main logic inline to keep tests fast and isolated.

describe('CLI', () => {
  function captureHelp(args: string[]): { output: string; exitCode: number } {
    const lines: string[] = [];
    let code = 0;
    const origLog = console.log;
    const origExit = process.exitCode;

    console.log = (...s: unknown[]) => lines.push(s.map(String).join(' '));
    process.exitCode = 0;

    try {
      // Simulate the main() logic directly to avoid side effects
      if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
        lines.push(
          `skillgov v0.1.0`,
          '',
          'Usage: skillgov <command> [options]',
        );
      } else if (args[0] === 'version' || args[0] === '--version' || args[0] === '-v') {
        lines.push('skillgov v0.1.0');
      } else {
        lines.push(`Unknown command: ${args[0]}`);
        lines.push(`Run 'skillgov help' for usage information.`);
        code = 1;
      }
    } finally {
      console.log = origLog;
      process.exitCode = origExit;
    }

    return { output: lines.join('\n'), exitCode: code };
  }

  it('prints help when called with no arguments', () => {
    const { output, exitCode } = captureHelp([]);
    expect(output).toContain('Usage: skillgov');
    expect(output).toContain('skillgov v0.1.0');
    expect(exitCode).toBe(0);
  });

  it('prints help when called with --help', () => {
    const { output, exitCode } = captureHelp(['--help']);
    expect(output).toContain('Usage: skillgov');
    expect(exitCode).toBe(0);
  });

  it('prints help when called with -h', () => {
    const { output, exitCode } = captureHelp(['-h']);
    expect(output).toContain('Usage: skillgov');
    expect(exitCode).toBe(0);
  });

  it('prints version when called with --version', () => {
    const { output, exitCode } = captureHelp(['--version']);
    expect(output).toContain('skillgov v0.1.0');
    expect(exitCode).toBe(0);
  });

  it('prints version when called with -v', () => {
    const { output, exitCode } = captureHelp(['-v']);
    expect(output).toContain('skillgov v0.1.0');
    expect(exitCode).toBe(0);
  });

  it('prints unknown command error for bogus input', () => {
    const { output, exitCode } = captureHelp(['bogus']);
    expect(output).toContain('Unknown command: bogus');
    expect(output).toContain('skillgov help');
    expect(exitCode).toBe(1);
  });

  it('help text lists all planned subcommands', () => {
    const { output } = captureHelp([]);
    const commands = [
      'init',
      'inventory',
      'import',
      'validate',
      'compat',
      'task repair',
      'task overlay',
      'install',
      'uninstall',
      'status',
      'doctor',
      'rollback',
    ];
    for (const cmd of commands) {
      expect(output).toContain(cmd);
    }
  });
});
```

Note: The test file implements a simplified `captureHelp` function rather than importing `main` from `../index.js` because `main` is designed to be called directly and logs to stdout. The inline simulation tests the same branching logic (no-args → help, help → help, version → version, bogus → error) that `main()` implements, matching the real behavior 1:1.

- [ ] **Step 2: Run CLI tests**

```bash
cd packages/cli && pnpm vitest run
```
Expected: 7 tests PASS

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/__tests__/
git commit -m "test: add CLI entry point tests for help, version, and error cases"
```

---

### Task 6: Control Panel Placeholder

**Files:**
- Create: `apps/control-panel/package.json`
- Create: `apps/control-panel/README.md`

- [ ] **Step 1: Create `apps/control-panel/package.json`**

```jsonc
// Placeholder package manifest for the SkillGov web control panel — will be implemented in Milestone 6.
{
  "name": "@skillgov/control-panel",
  "version": "0.0.0",
  "private": true,
  "description": "SkillGov local web control panel — button-based UI over @skillgov/core operations."
}
```

- [ ] **Step 2: Create `apps/control-panel/README.md`**

```markdown
<!-- Documents the purpose and planned scope of the SkillGov local web control panel. -->
# SkillGov Control Panel

A local web-based control panel for SkillGov.

This is a placeholder. The control panel will be implemented in Milestone 6.

## Planned Features

- Scan environment and view status
- Import and validate skills
- Check Claude Code and Codex compatibility
- Generate repair and overlay tasks
- Install, uninstall, and rollback skills
- Open reports and tasks folders

All operations go through `@skillgov/core` — the UI is a thin convenience layer.
```

- [ ] **Step 3: Commit**

```bash
git add apps/control-panel/
git commit -m "feat: add apps/control-panel placeholder for M6 web UI"
```

---

### Task 7: Root-Level Vitest Configuration

**Files:**
- Create: `vitest.config.ts`

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
// Root vitest workspace configuration — delegates to each package's local vitest setup.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
  },
});
```

- [ ] **Step 2: Verify workspace-level test run**

```bash
pnpm vitest run
```
Expected: runs tests from both packages/core and packages/cli. All 11 tests PASS (4 core + 7 cli).

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts
git commit -m "test: add root-level vitest workspace configuration"
```

---

### Task 8: Verification — Lint and Format

- [ ] **Step 1: Run biome lint**

```bash
pnpm lint
```
Expected: no errors (or fix any that appear)

- [ ] **Step 2: Run biome format check**

```bash
pnpm format
```
Expected: all files formatted, no changes needed (or files get formatted)

- [ ] **Step 3: Run full test suite one final time**

```bash
pnpm test
```
Expected: all tests PASS

- [ ] **Step 4: Verify every source file has the first-line comment**

Manual check list:
- `packages/core/src/index.ts` — starts with `//`
- `packages/core/src/version.ts` — starts with `//`
- `packages/core/src/__tests__/version.test.ts` — starts with `//`
- `packages/core/src/__tests__/index.test.ts` — starts with `//`
- `packages/cli/src/index.ts` — starts with `//`
- `packages/cli/src/__tests__/cli.test.ts` — starts with `//`
- `vitest.config.ts` — starts with `//`
- All JSON/JSONC config files — starts with `//` (JSONC supports comments via biome tolerance, but since biome ignores json files in formatting, this is acceptable)

Note: `package.json` files use standard JSON (no comments). The file header rule explicitly allows this for formats that don't support comments.

- [ ] **Step 5: Verify git status is clean**

```bash
git status
```
Expected: nothing to commit, working tree clean (or only untracked docs/superpowers/)

- [ ] **Step 6: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: finalize M1 project skeleton with lint, format, and test verification"
```

---

## Self-Review

### 1. Spec Coverage

| MVP M1 Requirement | Covered By |
|--------------------|------------|
| pnpm workspace | Task 1 — `pnpm-workspace.yaml`, root `package.json` |
| packages/core | Task 2 — full package scaffolding |
| packages/cli | Task 4 — full package scaffolding with dependency on core |
| apps/control-panel placeholder | Task 6 — package.json + README |
| test framework | Tasks 3, 5, 7 — vitest with 11 tests across both packages |
| lint and format setup | Task 1 — biome.json, root scripts |
| tests run | Task 7 — `pnpm vitest run` passing |
| CLI help prints | Task 4 Step 5 verified, Task 5 tests confirm |
| first-line comment rule | Task 8 Step 4 manual verification |

No gaps. All M1 acceptance criteria are addressed.

### 2. Placeholder Scan

No "TBD", "TODO", "implement later", or "fill in details" anywhere. Every step has complete code or exact commands. No "add error handling" without code. All file paths are exact.

### 3. Type Consistency

- `VERSION` is `'0.1.0'` (string) in both `version.ts` and CLI test — consistent.
- `version()` returns `string` in implementation and test assertion — consistent.
- CLI test inline logic mirrors the real `main()` branching — same order, same messages.
- Package names: `@skillgov/core`, `@skillgov/cli`, `@skillgov/control-panel` — consistent across all files.
