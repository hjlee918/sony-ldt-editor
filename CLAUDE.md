# Sony LDT Gamma Curve Editor

## Project Overview
A browser-based gamma curve editor for Sony VPL-VW series projectors (VW260ES, VW360ES, VW385ES). Generates `.ldt` files compatible with Sony ImageDirector software for uploading custom gamma curves to the projector's Gamma 7–10 preset slots.

## Tech Stack
- **Framework**: React 18 with Vite
- **Language**: JavaScript (JSX)
- **Styling**: CSS with custom properties (light theme)
- **Fonts**: DM Sans, JetBrains Mono, Fraunces (Google Fonts)
- **Build**: Vite 5 — `npm run dev` for development, `npm run build` for production

## LDT File Format (Reverse-Engineered)
This is the critical domain knowledge for this project:

### File Structure
- **Total size**: 6,656 bytes (fixed)
- **Header**: 512 bytes
- **Data**: 6,144 bytes = 3 channels × 1,024 entries × 2 bytes (16-bit LE)

### Header Layout (512 bytes, zero-padded)
| Offset | Length | Value | Description |
|--------|--------|-------|-------------|
| 0x00 | 4 | `LDT\0` | Magic identifier |
| 0x08 | 4 | `0200` | Version |
| 0x10 | 12 | `VPL-xWxxxxES` | Model (wildcard for VW series) |
| 0x30 | 7 | `NETWORK` | Transport method |
| 0x40 | 1 | `1` | Unknown flag |
| 0x48 | 3 | `ALL` | Scope (applies to all inputs) |

### Data Layout
- 3 channels: Red, Green, Blue (in order)
- Each channel: 1,024 entries (4 pages × 256 entries)
- Each entry: 16-bit unsigned integer, little-endian
- Value range: 0–1023 (10-bit)
- **Storage order: DESCENDING** — input 1023 is stored first, input 0 is stored last
- When reading: reverse the array to get ascending input→output mapping
- When writing: reverse the ascending curve before writing

### Gamma Curve Math
- **Standard gamma**: `output = input^gamma` (power law). γ2.2 is the broadcast standard.
- **PQ (ST.2084)**: HDR tone mapping. Converts PQ-encoded signal to display output with soft highlight roll-off. Apply `pow(mapped, 1/2.2)` encoding since the projector's panel applies its own gamma on top.
- **HLG**: Hybrid Log-Gamma for broadcast HDR. OETF inverse with configurable system gamma.
- **BT.1886**: Broadcast display EOTF. Formula: `L(V) = (alpha * V + beta)^2.4` where `alpha = 1 - Lb^(1/2.4)`, `beta = Lb^(1/2.4)`, and `Lb` is the relative black level (0–0.05). At Lb=0 this is identical to gamma 2.4.
- **Cubic spline**: Natural cubic spline interpolation between control points for smooth curves.

## Key Architecture Decisions
- All curve data is stored internally as 10-bit (0–1023) arrays of length 1024
- Display format (8-bit/10-bit/percentage) is presentation-only; internal values never change
- Control points define the curve shape; cubic spline fills in the 1024 values between them
- Undo/redo history stores full channel snapshots (up to 50 states)
- Channels can be linked (same curve for R/G/B) or independent

## Features

### Curve Generators (`src/lib/generators.js`)
| Function | Description |
|---|---|
| `generateGamma(gamma)` | Power-law gamma curve (e.g. 2.2, 2.4) |
| `generateLinear()` | Identity curve |
| `generateSCurve(contrast)` | Sigmoid S-curve, default contrast 1.5 |
| `generatePQ(targetNits)` | PQ/ST.2084 HDR tone mapping to target display nits |
| `generateHLG(systemGamma)` | HLG broadcast HDR, default system gamma 1.2 |
| `generateBT1886(Lb)` | BT.1886 EOTF with configurable black level (0–0.05), default 0 |

### Canvas (`src/lib/canvas.js`)
`drawCanvas(canvas, channels, activeCh, zoom, pan, controlPts, activePointIdx, mode, fmtFn, compareChannels, previewCurve)`

- `compareChannels` — optional 3-channel reference array; drawn as dashed colored lines behind active curves
- `previewCurve` — optional single curve array; drawn as a dashed amber ghost (used for PQ slider live preview)

### App Features (`src/components/App.jsx`)
- **Compare curves**: "Set Ref" button snapshots current channels; "Compare" toggle overlays reference as dashed lines on the canvas
- **PQ live preview**: Dragging the PQ nits slider shows a dashed preview curve in real time without committing; labeled "Preview: PQ N nit" in canvas top-left; cleared on release or when Generate is clicked
- **Smooth passes**: Number input (1–50) next to the Smooth button controls how many passes of the 5-point moving average are applied per click
- **BT.1886 preset**: Sidebar section with Lb black-level slider (0–5%, default 0.5%) and a Generate button

### Edit Modes
- **Free**: Direct draw on canvas; interpolates between drag points
- **4pt / 10pt / 21pt**: Cubic spline interpolation between N movable control points
- Control points are clamped so they cannot cross neighbors (X-axis)

### Sidebar Presets
- Standard Gamma: Linear, γ1.8, γ2.0, γ2.2, γ2.4, γ2.6, S-Curve
- HDR PQ: Nits slider (50–4000) with live preview + quick-pick buttons (100/200/300/500/1000/4000 nit)
- HLG: System γ1.2
- BT.1886: Lb slider (0–5%) + Generate button

## File Organization
```
src/
  lib/
    ldt.js          — LDT file parsing and building
    generators.js   — Gamma, PQ, HLG, BT.1886, S-curve generators
    spline.js       — Natural cubic spline interpolation
    format.js       — Value display formatting (8-bit/10-bit/%)
    canvas.js       — Canvas drawing (supports compare overlay + PQ preview ghost)
    history.js      — Undo/redo history hook
  components/
    App.jsx         — Main application (all UI: toolbar, canvas, sidebar, modals)
  index.jsx         — Entry point
  index.css         — Global styles

Resources/
  47254410M.pdf              — VPL-VW385ES official operating instructions (Sony)
  generate_manual.py         — Python script to generate the calibration controls .docx
  VPL-VW385ES_Calibration_Controls.docx — Full picture/color calibration controls reference
```

## Commands
- `npm run dev` — Start dev server (localhost:5173)
- `npm run build` — Production build to `dist/`
- `npm run preview` — Preview production build

## Development Notes
- The canvas uses `devicePixelRatio` for crisp rendering on Retina displays
- Pan is triggered by Alt+drag or dragging empty canvas area when zoomed
- All control points are freely movable (both X and Y), clamped so they can't cross neighbors
- Edit modes: Free (direct draw), 4pt, 10pt, 21pt (cubic spline interpolation)
- The exported .ldt file must be exactly 6,656 bytes with the exact header format to be accepted by Sony ImageDirector

## VPL-VW385ES Projector — Picture Menu Reference
Key calibration controls confirmed from the official manual (47254410M) and OSD screenshots:

- **Calib. Preset**: 9 modes (Cinema Film 1/2, Reference, TV, Photo, Game, Bright Cinema, Bright TV, User)
- **Gamma Correction**: 1.8 / 2.0 / 2.1 / 2.2 / 2.4 / 2.6 / Gamma 7–10 (custom LDT slots) / Off
- **Color Temp**: D93 / D75 / D65 / D55 / Custom 1–5; each slot has Gain R/G/B + Bias R/G/B (6 sub-controls × 9 slots = 54)
- **Color Correction**: 6 axes (Red, Yellow, Green, Cyan, Blue, Magenta) × Hue/Saturation/Brightness = 18 adjustments
- **Color Space**: When any color space mode is selected (BT.709, Color Space 1–3, Custom, etc.), two global sliders appear: **Cyan–Red** and **Magenta–Green** — these shift the entire selected color space's gamut, not individual primaries. Total = 2 adjustments.
- **Advanced Picture**: Auto Calibration (Pre Check / Adjust / Before-After / Reset) for panel drift correction
- Full reference: `Resources/VPL-VW385ES_Calibration_Controls.docx`
