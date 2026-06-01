<!-- This file documents the SkillGov desktop shell app and how it hosts the existing local control panel UI. -->
# SkillGov Desktop

This app is a lightweight local desktop shell for SkillGov.

The first version intentionally reuses the existing `apps/control-panel` web UI
instead of creating a second interface. The shell starts the local control panel
server and opens it inside a native Tauri window.

## Development

```bash
pnpm --filter @skillgov/desktop dev
```

The shell uses port `4280` by default. Override it with:

```bash
SKILLGOV_DESKTOP_PORT=4290 pnpm --filter @skillgov/desktop dev
```

## Local EXE Build

Build a local desktop exe that you can double-click to launch SkillGov:

```bash
corepack pnpm desktop:local-exe
```

This runs the Rust tests, builds a release exe, and copies it to:

```text
D:\SkillGov\dist\SkillGov.exe
```

Double-click `SkillGov.exe` to open the desktop shell. It will start the
control panel server on port 4280 and load it in a native window.

**Note:** This exe depends on the `D:\SkillGov` project directory, Node.js,
Corepack, pnpm, and the existing `node_modules`. It is not a standalone
portable binary.
