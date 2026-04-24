# Projector Tab — Full Controls Expansion Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-04-16
**Scope:** Phase 3 — Expand the Projector tab to cover all 90 VPL-VW385ES menu items across three tabs (Picture, System, Info), with item code discovery for unknown SDCP codes.
**Prerequisite:** Phase 1+2 complete (Electron app, SDCP GET/SET working, Gamma Slots, existing PictureSettings).

---

## Goal

Replace the current two-column Projector tab layout with a three-tab layout (Picture / System / Info) covering all projector menu functions from the VPL-VW385ES operating manual (47254410M). Gamma Slots remain pinned above the tabs at all times. Unknown SDCP item codes are discovered automatically via a sequential GET scan on connect.

---

## Architecture

### Layout — Approach A (approved)

```
┌─────────────────────────────────────────────────┐
│  Status bar: ● model · ip · power · input       │  ProjectorStatusBar (unchanged)
├─────────────────────────────────────────────────┤
│  Gamma Slots: G7 G8 G9[ACTIVE] G10  (pinned)    │  GammaSlots (unchanged)
├─────────────────────────────────────────────────┤
│  [🎛 Picture]  [⚙️ System]  [ℹ️ Info]            │  tab switcher
├─────────────────────────────────────────────────┤
│  tab content (scrollable)                       │
└─────────────────────────────────────────────────┘
```

**Picture tab** — 3 scrollable columns:
- Left: Calib Preset + Reset, Tone (Contrast/Brightness/Color/Hue/Sharpness), Color Temp (preset + Custom Gain/Bias expansion), Cinema Black Pro (Iris/Contrast Enhancer/Lamp)
- Center: Processing (Motionflow/Reality Creation + sub-controls), Expert Noise (NR/MPEG NR/Smooth Gradation/Film Mode), Expert Gamma & HDR (Gamma/HDR/Input Lag/Clear White/x.v.Color)
- Right: Color Space (mode + Custom sliders), Color Correction 6×3 grid, Advanced Picture Auto Calibration actions

**System tab** — 3-column grid:
- Left: Screen (Aspect, Blanking L/R/T/B)
- Center: Function (Dynamic Range, HDMI Format, Test Pattern, Settings Lock, 3D Settings group)
- Right (stacked): Power & Input, Setup, Installation

**Info tab** — 2×2 read-only cards:
- Projector Identity (Model, Serial, Software Version, Lamp Timer)
- Input Signal (Signal Type, Color Format, Color Space, HDR Format)
- Active Settings snapshot (Calib Preset, Gamma, Color Temp, Color Space, HDR, Motionflow)
- Network (IP, connection state, protocol, poll interval)

---

## File Structure

| File | Change |
|------|--------|
| `src/components/projector/ProjectorTab.jsx` | Major rewrite: add 3-tab switcher, compose sub-components |
| `src/components/projector/PictureTab.jsx` | New: 3-column Picture tab layout |
| `src/components/projector/SystemTab.jsx` | New: 3-column System tab layout |
| `src/components/projector/InfoTab.jsx` | New: 2×2 read-only Info tab |
| `src/components/projector/ColorCorrection.jsx` | New: 6-color × 3-attribute compact grid |
| `src/components/projector/ColorTempCustom.jsx` | New: Gain R/G/B + Bias R/G/B sliders, shown when Custom slot selected |
| `src/components/projector/PictureSettings.jsx` | Expand: add Color, Hue, Sharpness, Contrast Enhancer, Lamp Control, Reality Creation, MPEG NR, Smooth Gradation, Film Mode, Clear White, x.v.Color, Input Lag Reduction |
| `src/hooks/useProjector.js` | Expand: poll all new items, store in status, add `supportedItems` map from scan |
| `electron/sdcp.ts` | Add `scanItems()`: GET items 00:00–00:FF, return Set of working codes |
| `electron/main.ts` | Add IPC handler `projector:scanItems` |
| `electron/preload.ts` | Expose `scanItems()` on `window.projector` |
| `src/index.css` | Add styles for 3-tab layout, Color Correction grid, Color Temp Gain/Bias, System grid |

---

## SDCP Item Codes

### Known codes (verified from pcap / protocol doc)

| Item | Upper | Lower | Range | Notes |
|------|-------|-------|-------|-------|
| Calib Preset | 00 | 02 | 0–8 | ✅ implemented |
| Brightness | 00 | 10 | 0–100 | ✅ implemented |
| Contrast | 00 | 11 | 0–100 | ✅ implemented |
| Color Temp | 00 | 17 | 0=D93,1=D75,2=D65,3–7=Custom1–5,9=D55 | ✅ implemented |
| Advanced Iris | 00 | 1d | 0=Off,2=Full,3=Limited | ✅ implemented |
| Gamma Correction | 00 | 22 | 0=Off,1=1.8…6=2.6,7–10=G7–G10 | ✅ implemented |
| NR | 00 | 25 | 0=Off,1=Low,2=Med,3=High,4=Auto | ✅ implemented |
| Color Space | 00 | 3b | 0=BT.709,3=CS1,4=CS2,5=CS3,6=Custom,8=BT.2020 | ✅ implemented |
| Motionflow | 00 | 59 | 0=Off,1=SmoothHi,2=SmoothLo,3=Impulse,4=Combo,5=TrueCinema | ✅ implemented |
| CS Custom Cyan–Red | 00 | 76 | signed −100 to +100 | ✅ implemented |
| CS Custom Magenta–Green | 00 | 77 | signed −100 to +100 | ✅ implemented |
| HDR | 00 | 7c | 0=Off, 1=HDR10, 2=HLG, 3=Auto | ✅ implemented (fix values: was Off/On/Auto, correct is Off/HDR10/HLG/Auto) |
| Color Correction R: Hue | 00 | 87 | signed −50 to +50 | known, not yet in UI |
| Color Correction R: Saturation | 00 | 88 | signed −50 to +50 | known, not yet in UI |
| Color Correction R: Brightness | 00 | 89 | signed −30 to +30 | known, not yet in UI |
| Color Correction Y: Hue | 00 | 8a | signed −50 to +50 | |
| Color Correction Y: Saturation | 00 | 8b | signed −50 to +50 | |
| Color Correction Y: Brightness | 00 | 8c | signed −30 to +30 | |
| Color Correction G: Hue | 00 | 8d | signed −50 to +50 | |
| Color Correction G: Saturation | 00 | 8e | signed −50 to +50 | |
| Color Correction G: Brightness | 00 | 8f | signed −30 to +30 | |
| Color Correction C: Hue | 00 | 90 | signed −50 to +50 | |
| Color Correction C: Saturation | 00 | 91 | signed −50 to +50 | |
| Color Correction C: Brightness | 00 | 92 | signed −30 to +30 | |
| Color Correction B: Hue | 00 | 93 | signed −50 to +50 | |
| Color Correction B: Saturation | 00 | 94 | signed −50 to +50 | |
| Color Correction B: Brightness | 00 | 95 | signed −30 to +30 | |
| Color Correction M: Hue | 00 | 96 | signed −50 to +50 | |
| Color Correction M: Saturation | 00 | 97 | signed −50 to +50 | |
| Color Correction M: Brightness | 00 | 98 | signed −30 to +30 | |
| Input Lag Reduction | 00 | 99 | 0=Off,1=On | known, not yet in UI |
| Power | 01 | 30 | 0=Off,1=On | known, not yet in UI |

### Best-guess codes (to be verified by scan)

These are sequential guesses based on the pattern of known codes. The item scan will confirm which are valid.

| Item | Upper | Lower (guess) | Range | Basis |
|------|-------|---------------|-------|-------|
| Color (saturation) | 00 | 12 | 0–100 | sequential after Contrast 00:11 |
| Hue | 00 | 13 | 0–100 (center=50) | sequential |
| Film Mode | 00 | 23 | 0=Auto,1=Off | near NR at 00:25 |
| Sharpness | 00 | 24 | 0–100 | near NR |
| MPEG NR | 00 | 26 | 0=Off,1=Low,2=Med,3=High,4=Auto | sequential after NR 00:25 |
| Smooth Gradation | 00 | 27 | 0=Off,1=Low,2=Med,3=High | sequential |
| Clear White | 00 | 28 | 0=Off,1=Low,2=High | sequential |
| Contrast Enhancer | 00 | 1e | 0=Off,1=Low,2=Mid,3=High | between Iris 1d and Gamma 22 |
| Lamp Control | 00 | 1f | 0=Low,1=High | sequential |
| Reality Creation On/Off | 00 | 20 | 0=Off,1=On | sequential |
| x.v.Color | 00 | 29 | 0=Off,1=On | sequential |
| Aspect | 00 | 3c | 0=Normal,1=V Stretch,2=Squeeze,3=Stretch,4=1.85Zoom,5=2.35Zoom | near Color Space 00:3b |
| Dynamic Range | 00 | 60 | 0=Auto,1=Limited,2=Full | near Motionflow 00:59 |
| HDMI Signal Format | 00 | 61 | 0=Standard,1=Enhanced | sequential |
| Image Flip | 00 | 62 | 0=Off,1=HV,2=H,3=V | sequential |
| Color Temp Gain R | 00 | 30 | 0–255 | unknown range — scan to discover |
| Color Temp Gain G | 00 | 31 | 0–255 | |
| Color Temp Gain B | 00 | 32 | 0–255 | |
| Color Temp Bias R | 00 | 33 | 0–255 | |
| Color Temp Bias G | 00 | 34 | 0–255 | |
| Color Temp Bias B | 00 | 35 | 0–255 | |
| 3D 2D-3D Display | 00 | 65 | 0=Auto,1=3D,2=2D | guess |
| 3D Format | 00 | 66 | 0=Simulated,1=SbS,2=OU | guess |
| 3D Brightness | 00 | 67 | 0=Standard,1=High | guess |
| Blanking Left | 00 | 78 | 0–... | guess |
| Blanking Right | 00 | 79 | 0–... | guess |
| Blanking Top | 00 | 7a | 0–... | guess |
| Blanking Bottom | 00 | 7b | 0–... | guess |
| Input Select | 00 | 03 | 0=HDMI1,1=HDMI2 | guess |

### Item Code Discovery (scanItems)

On every successful connect, `sdcp.ts` fires `scanItems()`:
1. GET items `00:00` through `00:FF` sequentially (256 GETs), then `01:00` through `01:3F` (covers Power at `01:30`)
2. Items returning valid responses (not error code `01 01`) are added to `supportedItems: Set<string>` (key format `"upper:lower"` e.g. `"0:18"`)
3. `supportedItems` is stored in `useProjector` state
4. UI renders controls normally for supported items; renders them disabled with a `?` badge for unsupported items
5. Scan runs once per connection, result cached for the session

This approach means every control renders immediately — supported ones are active, unsupported ones are visually dimmed. Users can see what works on their specific projector firmware.

---

## Component Details

### `ProjectorTab.jsx` (rewrite)

```jsx
export default function ProjectorTab({ currentChannels, projector }) {
  const [tab, setTab] = useState('picture'); // 'picture' | 'system' | 'info'
  const { status, ... } = projector;

  if (!status.connected) return <ConnectionPanel ... />;

  return (
    <div className="projector-tab">
      <ProjectorStatusBar ... />
      <GammaSlots ... />                       {/* always pinned */}
      <div className="proj-tab-bar">
        <button className={tab==='picture'?'active':''} onClick={()=>setTab('picture')}>🎛 Picture</button>
        <button className={tab==='system'?'active':''} onClick={()=>setTab('system')}>⚙️ System</button>
        <button className={tab==='info'?'active':''} onClick={()=>setTab('info')}>ℹ️ Info</button>
      </div>
      {tab === 'picture' && <PictureTab status={status} onSet={set} supportedItems={supportedItems} />}
      {tab === 'system'  && <SystemTab  status={status} onSet={set} supportedItems={supportedItems} projector={projector} />}
      {tab === 'info'    && <InfoTab    status={status} />}
    </div>
  );
}
```

### `ColorCorrection.jsx`

Compact 6-row × 3-column grid. Each cell: mini slider (fires onPointerUp) + numeric value.

```jsx
const COLORS = [
  { key: 'r', label: 'Red',     dot: '#e05555', items: [0x87, 0x88, 0x89] },
  { key: 'y', label: 'Yellow',  dot: '#e0c050', items: [0x8a, 0x8b, 0x8c] },
  { key: 'g', label: 'Green',   dot: '#50c050', items: [0x8d, 0x8e, 0x8f] },
  { key: 'c', label: 'Cyan',    dot: '#50c0c0', items: [0x90, 0x91, 0x92] },
  { key: 'b', label: 'Blue',    dot: '#5080e0', items: [0x93, 0x94, 0x95] },
  { key: 'm', label: 'Magenta', dot: '#c050c0', items: [0x96, 0x97, 0x98] },
];
// Hue/Sat range: -50 to +50; Brightness: -30 to +30
// All values signed via sdcpToSigned/signedToSdcp
// Grid header row: Color | Hue | Saturation | Brightness
```

### `ColorTempCustom.jsx`

Renders only when `status.colorTemp` is 3–7 (Custom 1–5). Shows 6 sliders: Gain R/G/B, Bias R/G/B. Item codes are best-guess (00:30–00:35). Controls render disabled if not in `supportedItems`.

### `useProjector.js` — expanded status fields

New fields added to `ProjectorStatus`:
```js
{
  // existing ...
  color, hue, sharpness,               // master tone
  contrastEnhancer, lampControl,       // Cinema Black Pro
  realityCreation, rcDatabase, rcResolution, rcNoiseFilter,  // Reality Creation
  mpegNr, smoothGradation, filmMode,   // Expert noise
  clearWhite, xvColor,                 // Expert other
  inputLagReduction,                   // Expert
  ctGainR, ctGainG, ctGainB,          // Color Temp Gain (per current custom slot)
  ctBiasR, ctBiasG, ctBiasB,          // Color Temp Bias
  ccR, ccY, ccG, ccC, ccB, ccM,       // Color Correction (each: {hue, sat, bri})
  aspect, blankL, blankR, blankT, blankB,  // Screen
  dynamicRange, hdmiFormat, testPattern, settingsLock,  // Function
  d3Display, d3Format, d3Brightness, d3Depth,  // 3D
  imageFlip, lensControl, anamorphicLens, triggerSelect, irReceiver,  // Installation
  powerSaving, remoteStart, networkMgmt, altitudeMode,  // Setup
  inputSelect,                         // Power/Input
  supportedItems,                      // Set<string> from scanItems
  // read-only info
  modelName, serialNo, signalType, colorFormat, hdrFormat, softwareVersion, lampTimer,
}
```

`getStatus()` polls all items sequentially (only those in `supportedItems`). Poll interval remains 5 seconds.

### `ITEM_FIELD` map expansion

```js
const ITEM_FIELD = {
  '0:2':  'calibPreset',
  '0:16': 'brightness',    // 0x10
  '0:17': 'contrast',      // 0x11
  '0:18': 'color',         // 0x12 — guess
  '0:19': 'hue',           // 0x13 — guess
  '0:23': 'colorTemp',     // 0x17
  '0:29': 'advancedIris',  // 0x1d
  '0:30': 'contrastEnhancer', // 0x1e — guess
  '0:31': 'lampControl',   // 0x1f — guess
  '0:32': 'realityCreation', // 0x20 — guess
  '0:34': 'gammaCorrection', // 0x22
  '0:35': 'filmMode',      // 0x23 — guess
  '0:36': 'sharpness',     // 0x24 — guess
  '0:37': 'nr',            // 0x25
  '0:38': 'mpegNr',        // 0x26 — guess
  '0:39': 'smoothGradation', // 0x27 — guess
  '0:40': 'clearWhite',    // 0x28 — guess
  '0:41': 'xvColor',       // 0x29 — guess
  '0:59': 'colorSpace',    // 0x3b
  '0:89': 'motionflow',    // 0x59
  '0:118': 'csCustomCyanRed',   // 0x76
  '0:119': 'csCustomMagGreen',  // 0x77
  '0:124': 'hdr',          // 0x7c
  '0:135': 'ccRHue',       // 0x87
  // ... all CC items ...
  '0:153': 'inputLagReduction', // 0x99
  '1:48':  'power',        // 0x01:0x30
};
```

---

## Behavior Details

### HDR mode interaction rules

- **Auto**: Projector automatically detects signal metadata and applies appropriate HDR tone mapping (PQ for HDR10, HLG curve for HLG signals). Color Space is forced to BT.2020 automatically. Gamma Correction and Color Space selectors should be shown as read-only/dimmed in the app when HDR = Auto.
- **HDR10 / HLG**: Manual selection. User can choose Color Space and Gamma Correction (including custom G7–G10 LDT slots) freely.
- **Off**: Full manual control. Any Gamma slot (including G7–G10 custom LDT) can be selected. Color Space is user-selectable.

The app should reflect these constraints visually: when HDR = Auto, dim the Gamma Correction and Color Space controls with a tooltip explaining they are auto-managed by the projector.

---

### Unsupported controls

When a control's item code is not in `supportedItems`:
- The control renders at 50% opacity
- A small `?` tooltip on hover: "Item code unconfirmed — may not be supported by this firmware"
- SET commands are still sent if the user interacts (the projector will reject with an error, which is logged silently)
- This way users can still try controls even if the scan misses them

### Auto Calibration actions (Advanced Picture)

Four buttons: Pre Check, Adjust, Before/After, Reset. These send SET commands with specific item codes (to be discovered via scan — likely in the 00:Ax range). Since these are long-running operations on the projector (minutes), after clicking:
- Button shows spinner and is disabled
- Status poll detects completion (projector returns to normal state)
- No progress tracking (projector doesn't report progress)

### Reality Creation sub-controls

Shown as an indented sub-group below the Reality Creation On/Off toggle. Sub-controls only enabled when Reality Creation = On.

### Color Temp Custom Gain/Bias

- Renders a collapsible sub-section below the Color Temp preset selector
- Only visible when a Custom 1–5 slot is selected
- 6 sliders: Gain R/G/B (range TBD — likely 0–255), Bias R/G/B (range TBD)
- Item codes are slot-relative (the projector likely uses the same codes but they apply to whichever custom slot is currently selected) — verify via scan

### Panel Alignment

Not included in the UI. It requires a complex per-zone interactive grid that doesn't map well to a remote-control interface, and accidental changes could degrade image quality. Users should perform Panel Alignment from the projector OSD directly.

### Network Setting

Not included — IP address configuration is better done from the projector OSD or Sony's web UI. Our app already knows the IP from the connection form.

### Language / Menu Position

Not included — these affect the projector OSD display language, not relevant to remote control.

---

## Status Polling Strategy

`getStatus()` is called every 5 seconds. With ~40+ items to GET, sequential GETs could take 2–4 seconds on a local network. Strategy:

1. **Priority group** (every poll): items already polled — calibPreset, gammaCorrection, brightness, contrast, colorTemp, colorSpace, hdr, motionflow, advancedIris, nr, inputLagReduction
2. **Extended group** (every poll, appended): all new items that are in `supportedItems`
3. If poll takes >4 seconds, log a warning but don't reduce poll interval

Alternative: increase poll interval to 10 seconds when extended group is large. This is a tunable constant.

---

## CSS additions (`src/index.css`)

```css
/* 3-tab switcher */
.proj-tab-bar { display: flex; border-bottom: 1px solid var(--border); }
.proj-tab-btn { padding: 8px 20px; font-size: 12px; color: var(--text-muted); border-bottom: 2px solid transparent; }
.proj-tab-btn.active { color: var(--text); border-bottom-color: var(--accent); }

/* 3-column picture layout */
.picture-tab { display: flex; gap: 12px; padding: 12px; overflow-y: auto; }
.picture-col  { flex: 1; display: flex; flex-direction: column; gap: 10px; }
.picture-col-wide { flex: 1.4; display: flex; flex-direction: column; gap: 10px; }

/* System 3-column grid */
.system-tab { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; padding: 12px; align-items: start; overflow-y: auto; }

/* Info 2x2 grid */
.info-tab { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 12px; }

/* Color Correction grid */
.cc-grid { display: grid; grid-template-columns: 80px 1fr 1fr 1fr; gap: 1px; background: var(--border); }
.cc-header { background: var(--bg-2); padding: 4px 8px; font-size: 10px; text-transform: uppercase; color: var(--text-muted); }
.cc-cell { background: var(--bg-3); padding: 5px 8px; display: flex; align-items: center; gap: 4px; }
.cc-color-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

/* Unsupported control */
.ctrl-unsupported { opacity: 0.45; }
.ctrl-unsupported-badge { font-size: 9px; color: var(--text-muted); margin-left: 4px; }

/* Section sub-indent (Reality Creation sub-controls) */
.ctrl-sub-row { padding-left: 28px; }

/* Info panel */
.info-card-row { display: flex; justify-content: space-between; padding: 5px 12px; border-bottom: 1px solid var(--border); }
.info-val-highlight { color: var(--accent); font-family: 'JetBrains Mono', monospace; }
```

---

## Out of Scope

- Panel Alignment (complex interactive grid, OSD only)
- Network Setting / IP config (OSD only)
- Language / Menu Position (OSD display preferences)
- Lamp Setting (maintenance, OSD only)
- Picture Position (triggers lens motor movement, complex preset system)
- Settings Lock Level A/B enforcement in the app (projector enforces it, not the app)

---

## Testing

No automated tests for UI controls (browser-only). Manual test plan:

1. Connect to VPL-VW385ES on local network
2. Verify `scanItems` runs and `supportedItems` populates
3. For each control in Picture tab: adjust value, verify projector OSD reflects change within 5 seconds
4. Verify unknown-code controls render with `?` badge and don't crash on interaction
5. Verify Color Correction grid: adjust Red Hue, confirm projector responds
6. Verify Color Temp Custom: select Custom 1, adjust Gain R, confirm projector responds
7. Verify System tab: toggle Test Pattern, confirm projector shows/hides green pattern
8. Verify Info tab: Lamp Timer and Signal Type match projector OSD
9. Verify Gamma Slots remain pinned and functional across all 3 tabs
10. Verify poll doesn't visually reset controls while user is interacting (isBusyRef protection)
