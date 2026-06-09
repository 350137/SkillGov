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

Build the React SPA and start the unified server:

```text
pnpm --filter @skillgov/control-panel dev
```

The server listens on `http://localhost:4173` by default. Set `PORT` to use a
different local port. This builds `dist/spa` first so the server always serves
the React SPA — no stale artifacts.

For frontend HMR development (Vite dev server on port 5173 with API proxy):

```text
pnpm --filter @skillgov/control-panel dev:spa
```

To start the server without rebuilding (for iterative backend work):

```text
pnpm --filter @skillgov/control-panel dev:server
```

## Build

`dist/spa` is the Vite build output and is not committed to git. The `build`
script runs `vite build` to produce it.
