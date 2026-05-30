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
