# Sony LDT Gamma Curve Editor

A desktop app for editing and managing custom gamma curves on Sony VPL-VW series projectors. Built with Electron + React.

- **Design** gamma curves in the editor with full visual feedback
- **Upload** directly to the projector over the network (no USB, no ImageDirector)
- **Download** the projector's stored curves back into the editor
- **Control** picture settings (brightness, contrast, color temp, etc.) from the app

## Quick Start

```bash
npm install
npm run dev
```

Launches the Electron desktop app.

## Build

```bash
npm run build     # production build
npm run preview   # preview production build
```

## Features

### Gamma Curve Editor

- **Edit modes**: Free draw, 4-point, 10-point, 21-point with cubic spline interpolation
- **Curve generators**:
  - Standard gamma: γ1.8, γ2.0, γ2.2, γ2.4, γ2.6, S-curve, Linear
  - HDR PQ/ST.2084: adjustable target nits (50–4000) with live preview
  - HLG (Hybrid Log-Gamma): configurable system gamma
  - BT.1886: configurable black level (Lb 0–5%)
- **Per-channel editing**: Link R/G/B or edit independently
- **Smooth**: multi-pass moving average (1–50 passes)
- **Compare curves**: snapshot a reference and overlay as dashed lines
- **Display formats**: 8-bit, 10-bit, or percentage
- **Undo/Redo**: full history (⌘Z / ⌘⇧Z)
- **Zoom/Pan**: scroll to zoom, Alt+drag to pan
- **Import/Export**: load/save `.ldt` files

### Projector Sync (Editor sidebar)

When connected to your projector, an upload/download panel appears in the Editor sidebar:

- Select target slot: **G7 / G8 / G9 / G10**
- **Upload to Gamma X** — send the current curve directly to the projector
- **Download from Gamma X** — load the projector's stored curve into the editor graph

### Projector Tab (Network Control)

Connect to your projector over the local network (TCP port 53484, Sony SDCP protocol):

- **Gamma slots**: Upload curves to G7–G10, switch active slot with "Use" button
- **Picture settings** (fully adjustable):
  - Calib Preset (Cinema Film 1/2, Reference, TV, Photo, Game, etc.)
  - Brightness / Contrast
  - Color Temperature (D93, D75, D65, D55, Custom 1–5)
  - Color Space (BT.709, BT.2020, CS1–3, Custom)
  - Motionflow, HDR, Advanced Iris, Noise Reduction
  - Color Space custom gamut sliders (Cyan–Red, Magenta–Green) when Custom is selected
- Real-time status polling (5-second interval)

## Compatible Projectors

- Sony VPL-VW260ES
- Sony VPL-VW360ES
- Sony VPL-VW385ES
- Other VPL-VW series projectors using the SDCP protocol on port 53484

## Connecting to Your Projector

1. Ensure the projector is on the same local network
2. Enable network standby: projector menu → **Setup** → **Network** → Standby Mode = Standard (or Network Management = ON)
3. Open the **Projector** tab in the app
4. Enter the projector's IP address and click Connect

No password is required on VPL-VW385ES (authentication is disabled by default on the SDCP port).

## LDT File Format

Sony `.ldt` files contain gamma curve lookup tables:

- **Size**: 6,656 bytes fixed
- **Header**: 512 bytes (magic `LDT\0`, model string, version, transport)
- **Data**: 3 channels (R/G/B) × 1,024 entries × 2 bytes (16-bit LE, 10-bit values)
- Values stored in **descending** order (input 1023 first)

Gamma slots G7–G10 store 64 control points per channel (sampled every 16th entry from the 1024-point curve) and are transferred over the network using Sony's SDCP binary protocol.

## Project Structure

```
electron/
  main.ts       — Electron main process, IPC handlers
  preload.ts    — Context bridge exposing projector API to renderer
  sdcp.ts       — Sony SDCP protocol: GET, SET, LDT upload/download, slot activation
src/
  lib/
    ldt.js        — LDT file parse and build
    generators.js — Curve generators (gamma, PQ, HLG, BT.1886, S-curve)
    spline.js     — Natural cubic spline interpolation
    canvas.js     — Canvas drawing (compare overlay, PQ preview ghost)
    format.js     — Value display formatting
    history.js    — Undo/redo hook
  hooks/
    useProjector.js — React hook: projector state, polling, all actions
  components/
    App.jsx                        — Main app (editor UI + projector sync sidebar)
    projector/
      ProjectorTab.jsx             — Projector tab layout
      ConnectionPanel.jsx          — IP/password connection form
      ProjectorStatusBar.jsx       — Status bar with disconnect and upload controls
      GammaSlots.jsx               — G7–G10 slot rows
      PictureSettings.jsx          — Interactive picture settings panel
```

See [CLAUDE.md](./CLAUDE.md) for detailed architecture and LDT file format documentation.
