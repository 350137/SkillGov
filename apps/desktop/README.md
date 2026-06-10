<!-- This file documents the SkillGov desktop shell app and how it hosts the existing local control panel UI. -->
# SkillGov Desktop

This app is a lightweight local desktop shell for SkillGov.

The desktop shell loads the built control panel SPA directly through Tauri.
It does not start the legacy HTTP control panel server.

## Development

```bash
pnpm --filter @skillgov/desktop dev
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

Double-click `SkillGov.exe` to open the desktop shell. It loads the embedded
SPA in a native window and should not spawn Node.js, pnpm, tsx, or an HTTP
server on port 4280.

**Note:** This exe depends on the `D:\SkillGov` project directory, Node.js,
Corepack, pnpm, and the existing `node_modules`. It is not a standalone
portable binary.
