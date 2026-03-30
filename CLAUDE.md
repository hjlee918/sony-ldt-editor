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
- **Cubic spline**: Natural cubic spline interpolation between control points for smooth curves.

## Key Architecture Decisions
- All curve data is stored internally as 10-bit (0–1023) arrays of length 1024
- Display format (8-bit/10-bit/percentage) is presentation-only; internal values never change
- Control points define the curve shape; cubic spline fills in the 1024 values between them
- Undo/redo history stores full channel snapshots (up to 50 states)
- Channels can be linked (same curve for R/G/B) or independent

## File Organization
```
src/
  lib/
    ldt.js          — LDT file parsing and building
    generators.js   — Gamma, PQ, HLG, S-curve generators
    spline.js       — Natural cubic spline interpolation
    format.js       — Value display formatting (8-bit/10-bit/%)
  components/
    App.jsx         — Main application layout
    Canvas.jsx      — Curve canvas with drawing, points, zoom/pan
    Toolbar.jsx     — Channel selector, mode, undo/redo, format
    Sidebar.jsx     — Presets, PQ slider, info panels
    ControlTable.jsx — Control point value editor table
    SaveAsModal.jsx — Export filename dialog
  index.jsx         — Entry point
  index.css         — Global styles
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
