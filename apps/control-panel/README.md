<!-- Documents the purpose, features, and local usage of the SkillGov web control panel. -->
# SkillGov Control Panel

A local button-based web control panel for SkillGov.

The control panel exposes the same deterministic operations as `@skillgov/core`
through a small HTTP API and a browser UI. It is a convenience layer for local
use, not a separate source of truth.

## Features

- View project status
- Import and validate skills
- Check Claude Code and Codex compatibility
- Generate repair and overlay tasks
- Install, uninstall, and rollback skills
- Run doctor diagnostics

## Usage

Run the development server from this package:

```text
pnpm --filter @skillgov/control-panel dev
```

The server listens on `http://localhost:4173` by default. Set `PORT` to use a
different local port.
