# Sony LDT Editor — Packaging & Distribution Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-04-23  
**Scope:** Phase 4 — Wire up GitHub Actions CI + release workflow + in-app update UI. Build infrastructure is already present; this phase completes the missing pieces.  
**Prerequisite:** Phase 3 complete (full projector controls UI working).

---

## Goal

Ship a downloadable installer for macOS (DMG) and Windows (NSIS) via GitHub Releases. Existing installs get an in-app notification when a new version is available. Every future release requires only a version bump + git tag.

---

## Current State (already implemented)

The following are already in place and require no changes:

| Item | Status |
|------|--------|
| `electron-builder` (devDependency) | ✅ installed |
| `electron-updater` (dependency) | ✅ installed |
| `package.json` `build` config | ✅ present — macOS universal DMG, Windows NSIS+ZIP |
| `build:mac` / `build:win` npm scripts | ✅ present |
| `autoUpdater.checkForUpdatesAndNotify()` in `main.ts` | ✅ fires on app ready |
| `update:available` / `update:ready` IPC events | ✅ sent from main |
| `window.updater` API in `preload.ts` | ✅ exposes `onAvailable`, `onReady`, `installUpdate` |
| App icons (`Resources/icon.icns`, `Resources/icon.ico`) | ✅ present |

---

## Remaining Work

Three items remain:

### 1. Fill in `publish.owner` in `package.json`

The `publish` block currently has `"owner": "OWNER"`. This must be set to the actual GitHub username before the first release. `electron-updater` reads this to know where to look for updates.

```json
"publish": {
  "provider": "github",
  "owner": "<actual-github-username>",
  "repo": "sony-ldt-editor"
}
```

### 2. GitHub Actions Workflow

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags: ['v*.*.*']

jobs:
  build:
    strategy:
      matrix:
        os: [macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - name: Build & package
        run: npm run build:${{ matrix.os == 'macos-latest' && 'mac' || 'win' }}
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Behavior:**
- Triggered by any `v*.*.*` tag push
- macOS and Windows jobs run in parallel (~5–10 min)
- `GH_TOKEN` is the built-in Actions token — no manual secret setup required
- Creates a **draft** GitHub Release with all artifacts attached
- You add release notes in the GitHub UI, then click Publish

**Artifacts produced:**
- `Sony.LDT.Editor-1.0.0-universal.dmg` (macOS, Intel + Apple Silicon)
- `Sony.LDT.Editor.Setup.1.0.0.exe` (Windows x64 installer)
- `Sony.LDT.Editor-1.0.0-win.zip` (Windows x64 portable zip)
- `latest-mac.yml` and `latest.yml` — update manifests read by `electron-updater`

### 3. In-App Update UI (renderer)

`window.updater` is already exposed in the preload but nothing in the renderer subscribes to it. Two lightweight UI additions needed in `App.jsx`:

**Update available banner** — shown when `window.updater.onAvailable` fires:
- A slim dismissible bar at the top of the app (above the tab bar): *"A new version is available. [Download]"*
- Clicking Download calls `window.updater.installUpdate()` — `electron-updater` handles the rest

**Update ready toast** — shown when `window.updater.onReady` fires:
- A toast or modal: *"Update downloaded. Restart to apply."* with **Restart Now** / **Later** buttons
- Restart Now calls `window.updater.installUpdate()` (triggers `quitAndInstall`)
- Later dismisses; update applies on next normal quit automatically

**No update found:** completely silent, no UI shown.

**Error handling:** Update check failures are already handled silently in `main.ts` — no renderer changes needed.

---

## File Map

| File | Change |
|------|--------|
| `package.json` | Set `publish.owner` to real GitHub username |
| `.github/workflows/release.yml` | **New** — matrix CI build + GitHub Release upload |
| `src/components/App.jsx` | Add update available banner + update ready toast |

---

## Release Workflow

Steps to ship any future version:

1. Make changes, commit to `main`
2. Bump `"version"` in `package.json` (semver: `1.0.0`, `1.0.1`, `1.1.0`, etc.)
3. Commit: `git commit -m "chore: bump version to 1.0.0"`
4. Tag: `git tag v1.0.0`
5. Push tag: `git push origin v1.0.0`
6. GitHub Actions builds both platforms (~5–10 min)
7. Draft release appears at `github.com/<owner>/sony-ldt-editor/releases`
8. Add release notes, click **Publish Release**
9. Existing installs detect the update on next launch

---

## Code Signing

Not included in this phase. macOS users see a Gatekeeper "unidentified developer" warning on first launch (right-click → Open to bypass). Windows users see a SmartScreen warning.

**Adding Apple signing later** requires only repository secrets (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `CSC_LINK`, `CSC_KEY_PASSWORD`) and `"hardenedRuntime": true` in the `mac` build config. No code changes needed.

---

## Out of Scope

- Code signing / notarization
- Linux builds
- Crash reporting / telemetry
- App Store distribution
- Any projector feature or UI work
