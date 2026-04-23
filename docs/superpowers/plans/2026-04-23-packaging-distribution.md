# Packaging & Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the three remaining gaps to make the app publicly releasable: fill in the GitHub publisher identity, create the CI release workflow, and wire the in-app "downloading / ready" update UI.

**Architecture:** `electron-builder` + `electron-updater` are already installed and configured. `main.ts` already fires `checkForUpdatesAndNotify()` and sends IPC events. `preload.ts` already exposes `window.updater`. `App.jsx` already handles `update:ready`. Three small changes finish the job: one config fix, one new YAML file, one renderer addition.

**Tech Stack:** Electron 29, electron-builder 24, electron-updater 6, GitHub Actions, React 18, Vite (electron-vite).

---

## File Map

| File | Change |
|------|--------|
| `package.json` | Fix `publish.owner` from `"OWNER"` → `"hjlee918"`; add `release:mac` / `release:win` scripts |
| `.github/workflows/release.yml` | **New** — matrix CI build for macOS + Windows, publishes to GitHub Releases on tag push |
| `src/components/App.jsx` | Add `updateAvailable` state + `onAvailable` subscriber + "Downloading update…" banner |
| `src/index.css` | Add `.update-banner-downloading` modifier class |

---

## Task 1: Fix publisher identity and add release scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Fix `publish.owner` and add release scripts**

Open `package.json`. Find the `"publish"` block inside `"build"` and the `"scripts"` block. Make these two changes:

```json
"scripts": {
  "dev": "electron-vite dev",
  "build": "electron-vite build",
  "build:mac": "electron-vite build && electron-builder --mac",
  "build:win": "electron-vite build && electron-builder --win",
  "release:mac": "electron-vite build && electron-builder --mac --publish always",
  "release:win": "electron-vite build && electron-builder --win --publish always",
  "preview": "electron-vite preview",
  "test": "vitest run"
},
```

```json
"publish": {
  "provider": "github",
  "owner": "hjlee918",
  "repo": "sony-ldt-editor"
}
```

- [ ] **Step 2: Verify**

```bash
grep -A 3 '"publish"' package.json
```

Expected output:
```
"publish": {
  "provider": "github",
  "owner": "hjlee918",
```

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: set publish owner and add release scripts"
```

---

## Task 2: GitHub Actions release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create the workflows directory**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Create `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    tags: ['v*.*.*']

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: macos-latest
            script: release:mac
          - os: windows-latest
            script: release:win

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build and publish
        run: npm run ${{ matrix.script }}
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          CSC_IDENTITY_AUTO_DISCOVERY: false
```

**Notes on key fields:**
- `fail-fast: false` — if the Windows build fails, the macOS build still completes (and vice versa)
- `CSC_IDENTITY_AUTO_DISCOVERY: false` — prevents electron-builder from failing on macOS CI because no signing certificate is installed
- `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` — built-in Actions token, no manual secret setup needed
- `--publish always` (in `release:mac`/`release:win`) — explicitly uploads artifacts to the GitHub Release draft regardless of git context

- [ ] **Step 3: Validate YAML syntax**

```bash
npx js-yaml .github/workflows/release.yml && echo "YAML valid"
```

Expected: `YAML valid` (the parsed object will be printed, followed by "YAML valid")

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add GitHub Actions release workflow for macOS and Windows"
```

---

## Task 3: In-app "Downloading update" banner

**Files:**
- Modify: `src/components/App.jsx` (lines ~43 and ~143–147 and ~411–415)
- Modify: `src/index.css`

The renderer already handles `update:ready` (shows a blue "Update ready — click to restart" banner). This task adds the earlier `update:available` state so users see "Downloading update…" while the download is in progress.

- [ ] **Step 1: Add `updateAvailable` state**

In `App.jsx`, find line 43 (`const [updateReady, setUpdateReady] = useState(false);`). Add the new state on the line immediately above it:

```jsx
const [updateAvailable, setUpdateAvailable] = useState(false);
const [updateReady, setUpdateReady] = useState(false);
```

- [ ] **Step 2: Subscribe to `onAvailable` in the existing useEffect**

Find the auto-update `useEffect` (currently lines 143–147):

```jsx
// ─── Auto-update ───
useEffect(() => {
  if (!window.updater) return;
  return window.updater.onUpdateReady(() => setUpdateReady(true));
}, []);
```

Replace it with:

```jsx
// ─── Auto-update ───
useEffect(() => {
  if (!window.updater) return;
  const unsubAvail = window.updater.onUpdateAvailable(() => setUpdateAvailable(true));
  const unsubReady = window.updater.onUpdateReady(() => setUpdateReady(true));
  return () => { unsubAvail?.(); unsubReady?.(); };
}, []);
```

- [ ] **Step 3: Add the downloading banner to JSX**

Find the existing update banner in JSX (currently lines 411–415):

```jsx
{updateReady && (
  <div className="update-banner" onClick={() => window.updater.installUpdate()}>
    Update ready — click to restart and install
  </div>
)}
```

Replace it with:

```jsx
{updateAvailable && !updateReady && (
  <div className="update-banner update-banner-downloading">
    Downloading update…
  </div>
)}
{updateReady && (
  <div className="update-banner" onClick={() => window.updater.installUpdate()}>
    Update ready — click to restart and install
  </div>
)}
```

- [ ] **Step 4: Add CSS for the downloading variant**

In `src/index.css`, find the existing rule:

```css
.update-banner { background: #2060b0; color: white; padding: 8px 16px; text-align: center; cursor: pointer; font-size: 13px; }
```

Add immediately after it:

```css
.update-banner-downloading { background: #555; cursor: default; }
```

- [ ] **Step 5: Verify no console errors**

```bash
npm run dev
```

Open the app. There should be no errors related to `updater` in the console. (The banners won't show in dev mode because `checkForUpdatesAndNotify()` is guarded by `!is.dev` in `main.ts` — that's expected.)

- [ ] **Step 6: Commit**

```bash
git add src/components/App.jsx src/index.css
git commit -m "feat: add in-app downloading/ready update banners"
```

---

## Task 4: First release dry-run (local)

Verify the build produces valid installers locally before trusting CI.

- [ ] **Step 1: Build for the current platform (macOS)**

```bash
npm run build:mac
```

Expected: no errors. Creates `release/1.0.0/` containing:
- `Sony LDT Editor-1.0.0-universal.dmg`
- `Sony LDT Editor-1.0.0-universal-mac.zip`
- `latest-mac.yml`

- [ ] **Step 2: Verify the DMG opens correctly**

Double-click the `.dmg` in Finder. Drag the app to Applications. Open it. Verify:
- App launches without Gatekeeper blocking (first time: right-click → Open)
- Editor tab loads and gamma curve is functional
- Projector tab loads without errors

- [ ] **Step 3: Quit and clean up**

Move the app from Applications to Trash. Eject the DMG.

---

## Task 5: Tag and push v1.0.0

- [ ] **Step 1: Confirm `package.json` version is `1.0.0`**

```bash
grep '"version"' package.json
```

Expected: `"version": "1.0.0",`

- [ ] **Step 2: Tag and push**

```bash
git tag v1.0.0
git push origin electron-phase1-2
git push origin v1.0.0
```

- [ ] **Step 3: Watch the Actions run**

Go to `https://github.com/hjlee918/sony-ldt-editor/actions`. Two jobs (`macos-latest` and `windows-latest`) should appear running in parallel.

Wait for both to complete (~5–10 min).

- [ ] **Step 4: Review the draft release**

Go to `https://github.com/hjlee918/sony-ldt-editor/releases`. A draft release named `v1.0.0` should be present with these assets attached:
- `Sony.LDT.Editor-1.0.0-universal.dmg`
- `Sony.LDT.Editor-1.0.0-universal-mac.zip`
- `Sony.LDT.Editor.Setup.1.0.0.exe`
- `Sony.LDT.Editor-1.0.0-win.zip`
- `latest-mac.yml`
- `latest.yml`

- [ ] **Step 5: Add release notes and publish**

In the GitHub UI, click **Edit** on the draft release. Add a release description. Click **Publish Release**.

---

## Release Checklist (for every future version)

1. Commit all changes to `main` / `electron-phase1-2`
2. Bump `"version"` in `package.json`
3. `git commit -m "chore: bump version to X.Y.Z"`
4. `git tag vX.Y.Z`
5. `git push origin <branch>`
6. `git push origin vX.Y.Z`
7. Wait for CI (~5–10 min)
8. Add release notes at `github.com/hjlee918/sony-ldt-editor/releases`
9. Click **Publish Release**
