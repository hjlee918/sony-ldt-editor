# Sony LDT Gamma Curve Editor

A browser-based gamma curve editor for Sony VPL-VW series projectors. Generates `.ldt` files compatible with Sony ImageDirector for uploading custom gamma curves to Gamma 7–10 preset slots.

## Quick Start

```bash
npm install
npm run dev
```

Opens at http://localhost:5173

## Build for Production

```bash
npm run build
```

Static files output to `dist/` — can be served from any web server or opened locally.

## Features

- **Edit modes**: Free draw, 4-point, 10-point, 21-point with cubic spline interpolation
- **Presets**: Standard gamma (1.8–2.6), PQ/ST.2084 tone mapping, HLG, S-curve
- **Per-channel**: Link R/G/B or edit independently
- **HDR PQ**: Adjustable target nit level with soft highlight roll-off
- **Display formats**: 8-bit, 10-bit, or percentage
- **Undo/Redo**: Full history with ⌘Z / ⌘⇧Z
- **Zoom/Pan**: Scroll to zoom, Alt+drag to pan
- **Import/Export**: Load existing .ldt files, export with custom filenames

## Compatible Projectors

- Sony VPL-VW260ES
- Sony VPL-VW360ES
- Sony VPL-VW385ES
- Other VPL-VW series using ImageDirector

## Project Structure

See [CLAUDE.md](./CLAUDE.md) for detailed architecture and LDT file format documentation.
