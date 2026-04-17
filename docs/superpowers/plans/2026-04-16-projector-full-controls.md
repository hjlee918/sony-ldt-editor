# Projector Full Controls Expansion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current two-column Projector tab with a three-tab layout (Picture / System / Info) covering all VPL-VW385ES menu functions, with Gamma Slots pinned above the tabs at all times.

**Architecture:** Gamma Slots + status bar stay pinned; a tab-switcher below them renders one of three new components (PictureTab, SystemTab, InfoTab). Shared control primitives (Slider, Select, Toggle, SectionCard) live in Controls.jsx. The SDCP layer is expanded to GET ~50 items per poll; best-guess item codes are used for undiscovered items — null responses fall back to defaults.

**Tech Stack:** Electron + React 18, existing SDCP TCP protocol (`electron/sdcp.ts`), existing `useProjector.js` hook, existing CSS custom properties in `src/index.css`.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/projector/Controls.jsx` | **Create** | Shared Slider, Select, Toggle, SectionCard, CtrlRow primitives |
| `electron/sdcp.ts` | **Modify** | Expand `ProjectorStatus` type + `getStatus()` to poll all ~50 items |
| `src/hooks/useProjector.js` | **Modify** | Expand `ITEM_FIELD` map + new status fields in optimistic update |
| `src/components/projector/ProjectorTab.jsx` | **Rewrite** | 3-tab switcher; Gamma Slots + status bar pinned above |
| `src/components/projector/PictureTab.jsx` | **Create** | 3-column Picture tab layout (all picture/expert/advanced controls) |
| `src/components/projector/ColorCorrection.jsx` | **Create** | Compact 6-color × 3-attribute grid (18 sliders) |
| `src/components/projector/ColorTempCustom.jsx` | **Create** | Gain R/G/B + Bias R/G/B sliders, shown only for Custom 1–5 |
| `src/components/projector/SystemTab.jsx` | **Create** | 3-column System tab (Screen / Function+3D / Power+Setup+Install) |
| `src/components/projector/InfoTab.jsx` | **Create** | 2×2 read-only cards (Identity / Signal / Active Settings / Network) |
| `src/components/projector/PictureSettings.jsx` | **Delete** | Replaced by PictureTab.jsx |
| `src/index.css` | **Modify** | Add tab bar, 3-column layouts, section cards, CC grid, toggle styles |

---

## Background: existing code to understand before starting

**`electron/sdcp.ts`** — `SdcpConnection.getStatus()` fires sequential GETs for 12 items. Each `g(upper, lower, fallback)` call calls `this.get()`, which sends a GET frame and reads `resp.readUInt16BE(resp.length - 4)` as the value. Returns null on any error; fallback used. The `ProjectorStatus` interface defines all returned fields.

**`src/hooks/useProjector.js`** — `ITEM_FIELD` maps `'upper:lower'` hex strings (e.g. `'00:22'`) to status field names. When `set()` succeeds, it does an optimistic update via `setStatus(prev => ({ ...prev, [field]: value }))`.

**`src/components/projector/PictureSettings.jsx`** — currently has `Slider` and `Select` helper components at the top. These will move to `Controls.jsx`. The file will be deleted after `PictureTab.jsx` replaces it.

**`src/index.css`** — uses CSS custom properties: `--bg`, `--bg2`, `--bg3`, `--bg4`, `--border`, `--border2`, `--text`, `--text2`, `--text3`, `--accent`. Existing projector styles live at lines 138–183.

**Signed values** — Color Correction and Color Space Custom sliders use two's-complement encoding: values > 0x7fff are negative. Helpers: `sdcpToSigned(val) = val > 0x7fff ? val - 0x10000 : val` and `signedToSdcp(val) = val < 0 ? val + 0x10000 : val`.

---

## Task 1: Shared control primitives (`Controls.jsx`)

**Files:**
- Create: `src/components/projector/Controls.jsx`

- [ ] **Step 1: Create the file**

```jsx
// src/components/projector/Controls.jsx
import { useState, useEffect } from 'react';

export function SectionCard({ title, children }) {
  return (
    <div className="proj-card">
      <div className="proj-card-header">{title}</div>
      <div className="proj-card-body">{children}</div>
    </div>
  );
}

export function CtrlRow({ label, children, indent = false }) {
  return (
    <div className={`proj-ctrl-row${indent ? ' proj-ctrl-indent' : ''}`}>
      <span className="proj-label">{label}</span>
      <div className="proj-ctrl-value">{children}</div>
    </div>
  );
}

export function Slider({ label, value, min, max, onCommit, indent = false }) {
  const [local, setLocal] = useState(value ?? min);
  useEffect(() => { setLocal(value ?? min); }, [value, min]);
  return (
    <CtrlRow label={label} indent={indent}>
      <div className="proj-slider-group">
        <input type="range" min={min} max={max} value={local}
          onChange={e => setLocal(Number(e.target.value))}
          onPointerUp={e => onCommit(Number(e.target.value))} />
        <span className="proj-slider-val">{local}</span>
      </div>
    </CtrlRow>
  );
}

export function Select({ label, value, options, onChange, indent = false }) {
  return (
    <CtrlRow label={label} indent={indent}>
      <select className="proj-select" value={value ?? options[0][0]}
        onChange={e => onChange(Number(e.target.value))}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </CtrlRow>
  );
}

export function Toggle({ label, value, onChange, indent = false }) {
  return (
    <CtrlRow label={label} indent={indent}>
      <label className="proj-toggle">
        <input type="checkbox" checked={!!value}
          onChange={e => onChange(e.target.checked ? 1 : 0)} />
        <span className="proj-toggle-track" />
      </label>
    </CtrlRow>
  );
}
```

- [ ] **Step 2: Verify file created (no runtime test needed yet — used by later tasks)**

```bash
ls src/components/projector/Controls.jsx
```
Expected: file exists.

---

## Task 2: Expand `electron/sdcp.ts` — ProjectorStatus + getStatus()

**Files:**
- Modify: `electron/sdcp.ts`

This task adds ~40 new fields to `ProjectorStatus` and expands `getStatus()` to GET them all. Best-guess item codes for undiscovered items return null → fallback, which is harmless.

- [ ] **Step 1: Replace the `ProjectorStatus` interface (lines 106–120)**

Replace:
```typescript
export interface ProjectorStatus {
  connected: boolean;
  gammaCorrection: number;
  brightness: number;
  contrast: number;
  colorTemp: number;
  colorSpace: number;
  calibPreset: number;
  motionflow: number;
  hdr: number;
  advancedIris: number;
  nr: number;
  csCustomCyanRed: number;
  csCustomMagGreen: number;
}
```

With:
```typescript
export interface ProjectorStatus {
  connected: boolean;
  // ── Picture / Core ──
  calibPreset: number;
  contrast: number;
  brightness: number;
  color: number;
  hue: number;
  colorTemp: number;
  sharpness: number;
  // ── Cinema Black Pro ──
  advancedIris: number;
  contrastEnhancer: number;
  lampControl: number;
  // ── Processing ──
  motionflow: number;
  realityCreation: number;
  // ── Expert: Noise ──
  nr: number;
  mpegNr: number;
  smoothGradation: number;
  filmMode: number;
  // ── Expert: Gamma / HDR ──
  gammaCorrection: number;
  hdr: number;
  inputLagReduction: number;
  clearWhite: number;
  xvColor: number;
  // ── Color Space ──
  colorSpace: number;
  csCustomCyanRed: number;
  csCustomMagGreen: number;
  // ── Color Temp Custom Gain/Bias ──
  ctGainR: number; ctGainG: number; ctGainB: number;
  ctBiasR: number; ctBiasG: number; ctBiasB: number;
  // ── Color Correction (6 colors × 3 attributes) ──
  ccRHue: number; ccRSat: number; ccRBri: number;
  ccYHue: number; ccYSat: number; ccYBri: number;
  ccGHue: number; ccGSat: number; ccGBri: number;
  ccCHue: number; ccCSat: number; ccCBri: number;
  ccBHue: number; ccBSat: number; ccBBri: number;
  ccMHue: number; ccMSat: number; ccMBri: number;
  // ── Screen ──
  aspect: number;
  blankLeft: number; blankRight: number; blankTop: number; blankBottom: number;
  // ── Function ──
  dynamicRange: number;
  hdmiFormat: number;
  d3Display: number; d3Format: number; d3Brightness: number;
  // ── Installation ──
  imageFlip: number;
  // ── Power / Input ──
  inputSelect: number;
}
```

- [ ] **Step 2: Replace the `getStatus()` method body (starting at line 229)**

Replace the entire `async getStatus()` method with:
```typescript
async getStatus(): Promise<ProjectorStatus> {
  const g = async (upper: number, lower: number, fallback: number): Promise<number> => {
    const v = await this.get(upper, lower);
    return v ?? fallback;
  };

  // ── Picture / Core ──
  const calibPreset      = await g(0x00, 0x02, 0);
  const contrast         = await g(0x00, 0x11, 50);
  const brightness       = await g(0x00, 0x10, 50);
  const color            = await g(0x00, 0x12, 50);   // best-guess
  const hue              = await g(0x00, 0x13, 50);   // best-guess
  const colorTemp        = await g(0x00, 0x17, 2);
  const sharpness        = await g(0x00, 0x24, 10);   // best-guess
  // ── Cinema Black Pro ──
  const advancedIris     = await g(0x00, 0x1d, 0);
  const contrastEnhancer = await g(0x00, 0x1e, 0);   // best-guess
  const lampControl      = await g(0x00, 0x1f, 1);   // best-guess
  // ── Processing ──
  const motionflow       = await g(0x00, 0x59, 0);
  const realityCreation  = await g(0x00, 0x20, 1);   // best-guess
  // ── Expert: Noise ──
  const nr               = await g(0x00, 0x25, 0);
  const mpegNr           = await g(0x00, 0x26, 0);   // best-guess
  const smoothGradation  = await g(0x00, 0x27, 0);   // best-guess
  const filmMode         = await g(0x00, 0x23, 0);   // best-guess
  // ── Expert: Gamma / HDR ──
  const gammaCorrection  = await g(0x00, 0x22, 0);
  const hdr              = await g(0x00, 0x7c, 3);   // 3=Auto (confirmed correct values)
  const inputLagReduction = await g(0x00, 0x99, 0);
  const clearWhite       = await g(0x00, 0x28, 0);   // best-guess
  const xvColor          = await g(0x00, 0x29, 0);   // best-guess
  // ── Color Space ──
  const colorSpace       = await g(0x00, 0x3b, 0);
  const csCustomCyanRed  = colorSpace === 6 ? await g(0x00, 0x76, 0) : 0;
  const csCustomMagGreen = colorSpace === 6 ? await g(0x00, 0x77, 0) : 0;
  // ── Color Temp Custom Gain/Bias (only when Custom 1–5 selected) ──
  const isCustomCT = colorTemp >= 3 && colorTemp <= 7;
  const ctGainR = isCustomCT ? await g(0x00, 0x30, 128) : 128; // best-guess codes
  const ctGainG = isCustomCT ? await g(0x00, 0x31, 128) : 128;
  const ctGainB = isCustomCT ? await g(0x00, 0x32, 128) : 128;
  const ctBiasR = isCustomCT ? await g(0x00, 0x33, 128) : 128;
  const ctBiasG = isCustomCT ? await g(0x00, 0x34, 128) : 128;
  const ctBiasB = isCustomCT ? await g(0x00, 0x35, 128) : 128;
  // ── Color Correction ──
  const ccRHue = await g(0x00, 0x87, 0); const ccRSat = await g(0x00, 0x88, 0); const ccRBri = await g(0x00, 0x89, 0);
  const ccYHue = await g(0x00, 0x8a, 0); const ccYSat = await g(0x00, 0x8b, 0); const ccYBri = await g(0x00, 0x8c, 0);
  const ccGHue = await g(0x00, 0x8d, 0); const ccGSat = await g(0x00, 0x8e, 0); const ccGBri = await g(0x00, 0x8f, 0);
  const ccCHue = await g(0x00, 0x90, 0); const ccCSat = await g(0x00, 0x91, 0); const ccCBri = await g(0x00, 0x92, 0);
  const ccBHue = await g(0x00, 0x93, 0); const ccBSat = await g(0x00, 0x94, 0); const ccBBri = await g(0x00, 0x95, 0);
  const ccMHue = await g(0x00, 0x96, 0); const ccMSat = await g(0x00, 0x97, 0); const ccMBri = await g(0x00, 0x98, 0);
  // ── Screen ──
  const aspect     = await g(0x00, 0x3c, 0); // best-guess
  const blankLeft  = await g(0x00, 0x78, 0); // best-guess
  const blankRight = await g(0x00, 0x79, 0);
  const blankTop   = await g(0x00, 0x7a, 0);
  const blankBottom = await g(0x00, 0x7b, 0);
  // ── Function ──
  const dynamicRange = await g(0x00, 0x60, 0); // best-guess
  const hdmiFormat   = await g(0x00, 0x61, 0); // best-guess
  const d3Display    = await g(0x00, 0x65, 0); // best-guess
  const d3Format     = await g(0x00, 0x66, 0); // best-guess
  const d3Brightness = await g(0x00, 0x67, 0); // best-guess
  // ── Installation ──
  const imageFlip    = await g(0x00, 0x62, 0); // best-guess
  // ── Power / Input ──
  const inputSelect  = await g(0x00, 0x03, 0); // best-guess

  return {
    connected: true,
    calibPreset, contrast, brightness, color, hue, colorTemp, sharpness,
    advancedIris, contrastEnhancer, lampControl,
    motionflow, realityCreation,
    nr, mpegNr, smoothGradation, filmMode,
    gammaCorrection, hdr, inputLagReduction, clearWhite, xvColor,
    colorSpace, csCustomCyanRed, csCustomMagGreen,
    ctGainR, ctGainG, ctGainB, ctBiasR, ctBiasG, ctBiasB,
    ccRHue, ccRSat, ccRBri, ccYHue, ccYSat, ccYBri,
    ccGHue, ccGSat, ccGBri, ccCHue, ccCSat, ccCBri,
    ccBHue, ccBSat, ccBBri, ccMHue, ccMSat, ccMBri,
    aspect, blankLeft, blankRight, blankTop, blankBottom,
    dynamicRange, hdmiFormat, d3Display, d3Format, d3Brightness,
    imageFlip, inputSelect,
  };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add electron/sdcp.ts
git commit -m "feat: expand ProjectorStatus and getStatus() with all 50+ menu items"
```

---

## Task 3: Expand `useProjector.js` — ITEM_FIELD map

**Files:**
- Modify: `src/hooks/useProjector.js` (lines 4–17)

The `ITEM_FIELD` map maps `'upper:lower'` hex keys to status field names for optimistic updates after SET. All new settable items get an entry.

- [ ] **Step 1: Replace the `ITEM_FIELD` constant (lines 4–17)**

```js
const ITEM_FIELD = {
  // ── Picture / Core ──
  '00:02': 'calibPreset',
  '00:11': 'contrast',
  '00:10': 'brightness',
  '00:12': 'color',
  '00:13': 'hue',
  '00:17': 'colorTemp',
  '00:24': 'sharpness',
  // ── Cinema Black Pro ──
  '00:1d': 'advancedIris',
  '00:1e': 'contrastEnhancer',
  '00:1f': 'lampControl',
  // ── Processing ──
  '00:59': 'motionflow',
  '00:20': 'realityCreation',
  // ── Expert: Noise ──
  '00:25': 'nr',
  '00:26': 'mpegNr',
  '00:27': 'smoothGradation',
  '00:23': 'filmMode',
  // ── Expert: Gamma / HDR ──
  '00:22': 'gammaCorrection',
  '00:7c': 'hdr',
  '00:99': 'inputLagReduction',
  '00:28': 'clearWhite',
  '00:29': 'xvColor',
  // ── Color Space ──
  '00:3b': 'colorSpace',
  '00:76': 'csCustomCyanRed',
  '00:77': 'csCustomMagGreen',
  // ── Color Temp Custom ──
  '00:30': 'ctGainR', '00:31': 'ctGainG', '00:32': 'ctGainB',
  '00:33': 'ctBiasR', '00:34': 'ctBiasG', '00:35': 'ctBiasB',
  // ── Color Correction ──
  '00:87': 'ccRHue', '00:88': 'ccRSat', '00:89': 'ccRBri',
  '00:8a': 'ccYHue', '00:8b': 'ccYSat', '00:8c': 'ccYBri',
  '00:8d': 'ccGHue', '00:8e': 'ccGSat', '00:8f': 'ccGBri',
  '00:90': 'ccCHue', '00:91': 'ccCSat', '00:92': 'ccCBri',
  '00:93': 'ccBHue', '00:94': 'ccBSat', '00:95': 'ccBBri',
  '00:96': 'ccMHue', '00:97': 'ccMSat', '00:98': 'ccMBri',
  // ── Screen ──
  '00:3c': 'aspect',
  '00:78': 'blankLeft', '00:79': 'blankRight',
  '00:7a': 'blankTop',  '00:7b': 'blankBottom',
  // ── Function ──
  '00:60': 'dynamicRange',
  '00:61': 'hdmiFormat',
  '00:65': 'd3Display', '00:66': 'd3Format', '00:67': 'd3Brightness',
  // ── Installation ──
  '00:62': 'imageFlip',
  // ── Power / Input ──
  '00:03': 'inputSelect',
};
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useProjector.js
git commit -m "feat: expand ITEM_FIELD map for all new projector controls"
```

---

## Task 4: Rewrite `ProjectorTab.jsx` — 3-tab switcher

**Files:**
- Modify: `src/components/projector/ProjectorTab.jsx` (full rewrite)

`PictureSettings.jsx` is no longer imported here. The `CALIB_OPTS` select and the two-column layout are removed. `ProjectorStatusBar` loses its upload button (upload is handled by `GammaSlots` via `onUpload`).

- [ ] **Step 1: Rewrite the file**

```jsx
// src/components/projector/ProjectorTab.jsx
import { useState } from 'react';
import ConnectionPanel from './ConnectionPanel';
import ProjectorStatusBar from './ProjectorStatusBar';
import GammaSlots from './GammaSlots';
import PictureTab from './PictureTab';
import SystemTab from './SystemTab';
import InfoTab from './InfoTab';

export default function ProjectorTab({ currentChannels, projector }) {
  const { status, uploadProgress, error, lastIp, connect, disconnect, set, activateSlot, upload } = projector;
  const [selectedSlot, setSelectedSlot] = useState(10);
  const [activeTab, setActiveTab] = useState('picture');

  const handleUpload = (slot) => {
    if (!currentChannels) return;
    setSelectedSlot(slot);
    upload(slot, currentChannels);
  };

  const handleUseSlot = (slot) => {
    set(0x00, 0x22, slot);
  };

  if (!status.connected) {
    return <ConnectionPanel onConnect={connect} lastIp={lastIp} error={error} />;
  }

  return (
    <div className="projector-tab">
      <ProjectorStatusBar status={status} error={error} onDisconnect={disconnect} />
      <GammaSlots
        status={status}
        onUpload={handleUpload}
        onUseSlot={handleUseSlot}
        uploadProgress={uploadProgress}
        uploadingSlot={selectedSlot}
      />
      <div className="proj-tab-bar">
        {[['picture', '🎛 Picture'], ['system', '⚙️ System'], ['info', 'ℹ️ Info']].map(([id, label]) => (
          <button
            key={id}
            className={`proj-tab-btn${activeTab === id ? ' active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {activeTab === 'picture' && <PictureTab status={status} onSet={set} />}
      {activeTab === 'system'  && <SystemTab  status={status} onSet={set} />}
      {activeTab === 'info'    && <InfoTab    status={status} />}
    </div>
  );
}
```

- [ ] **Step 2: Check `ProjectorStatusBar.jsx` — remove upload props if present**

Read `src/components/projector/ProjectorStatusBar.jsx`. If it accepts `onUpload` / `selectedUploadSlot` props (it does from Phase 2), remove those props and the upload button from the status bar — uploading is now done directly in GammaSlots rows.

- [ ] **Step 3: Start app and verify tab bar renders, switching works**

```bash
npm run dev
```

Open Projector tab → connect → confirm three tab buttons appear → click each → confirm no crash (tabs will be empty until next tasks).

- [ ] **Step 4: Commit**

```bash
git add src/components/projector/ProjectorTab.jsx src/components/projector/ProjectorStatusBar.jsx
git commit -m "feat: rewrite ProjectorTab with 3-tab switcher (Picture/System/Info)"
```

---

## Task 5: Create `ColorCorrection.jsx`

**Files:**
- Create: `src/components/projector/ColorCorrection.jsx`

This is a compact grid: 6 color rows × 3 attribute columns (Hue / Saturation / Brightness). Each cell has a range slider + numeric value. All values are signed (two's-complement), so use the `sdcpToSigned`/`signedToSdcp` helpers.

- [ ] **Step 1: Create the file**

```jsx
// src/components/projector/ColorCorrection.jsx
import { useState, useEffect } from 'react';
import { SectionCard } from './Controls';

function sdcpToSigned(val) { return val > 0x7fff ? val - 0x10000 : val; }
function signedToSdcp(val) { return val < 0 ? val + 0x10000 : val; }

function CcSlider({ value, min, max, onCommit }) {
  const signed = sdcpToSigned(value ?? 0);
  const [local, setLocal] = useState(signed);
  useEffect(() => { setLocal(sdcpToSigned(value ?? 0)); }, [value]);
  return (
    <div className="cc-cell">
      <input
        type="range" min={min} max={max} value={local}
        onChange={e => setLocal(Number(e.target.value))}
        onPointerUp={e => onCommit(signedToSdcp(Number(e.target.value)))}
        className="cc-range"
      />
      <span className="cc-val">{local}</span>
    </div>
  );
}

const CC_ROWS = [
  { key: 'R', label: 'Red',     dot: '#d94f4f', items: [0x87, 0x88, 0x89], fields: ['ccRHue','ccRSat','ccRBri'] },
  { key: 'Y', label: 'Yellow',  dot: '#c8a020', items: [0x8a, 0x8b, 0x8c], fields: ['ccYHue','ccYSat','ccYBri'] },
  { key: 'G', label: 'Green',   dot: '#3c9a50', items: [0x8d, 0x8e, 0x8f], fields: ['ccGHue','ccGSat','ccGBri'] },
  { key: 'C', label: 'Cyan',    dot: '#0e8a82', items: [0x90, 0x91, 0x92], fields: ['ccCHue','ccCSat','ccCBri'] },
  { key: 'B', label: 'Blue',    dot: '#3060c0', items: [0x93, 0x94, 0x95], fields: ['ccBHue','ccBSat','ccBBri'] },
  { key: 'M', label: 'Magenta', dot: '#a040a0', items: [0x96, 0x97, 0x98], fields: ['ccMHue','ccMSat','ccMBri'] },
];

export default function ColorCorrection({ status, onSet }) {
  return (
    <SectionCard title="Color Correction">
      <div className="cc-grid">
        <div className="cc-grid-header">
          <div className="cc-col-label" />
          <div className="cc-col-header">Hue</div>
          <div className="cc-col-header">Saturation</div>
          <div className="cc-col-header">Brightness</div>
        </div>
        {CC_ROWS.map(({ key, label, dot, items, fields }) => (
          <div key={key} className="cc-grid-row">
            <div className="cc-col-label">
              <span className="cc-dot" style={{ background: dot }} />
              {label}
            </div>
            {/* Hue and Saturation: -50 to +50 */}
            <CcSlider value={status[fields[0]] ?? 0} min={-50} max={50}
              onCommit={v => onSet(0x00, items[0], v)} />
            <CcSlider value={status[fields[1]] ?? 0} min={-50} max={50}
              onCommit={v => onSet(0x00, items[1], v)} />
            {/* Brightness: -30 to +30 */}
            <CcSlider value={status[fields[2]] ?? 0} min={-30} max={30}
              onCommit={v => onSet(0x00, items[2], v)} />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/projector/ColorCorrection.jsx
git commit -m "feat: add ColorCorrection 6-color × 3-attribute grid component"
```

---

## Task 6: Create `ColorTempCustom.jsx`

**Files:**
- Create: `src/components/projector/ColorTempCustom.jsx`

Renders 6 sliders (Gain R/G/B, Bias R/G/B) for the currently-selected Custom color temp slot. Only shown when `status.colorTemp` is 3–7 (Custom 1–5). Item codes are best-guesses (`00:30`–`00:35`) that the projector may or may not support.

- [ ] **Step 1: Create the file**

```jsx
// src/components/projector/ColorTempCustom.jsx
import { SectionCard, Slider } from './Controls';

const SLOT_LABELS = { 3: 'Custom 1', 4: 'Custom 2', 5: 'Custom 3', 6: 'Custom 4', 7: 'Custom 5' };

export default function ColorTempCustom({ status, onSet }) {
  const slot = status.colorTemp;
  if (slot < 3 || slot > 7) return null;

  return (
    <SectionCard title={`Color Temp — ${SLOT_LABELS[slot]}`}>
      <Slider label="Gain R" value={status.ctGainR ?? 128} min={0} max={255}
        onCommit={v => onSet(0x00, 0x30, v)} />
      <Slider label="Gain G" value={status.ctGainG ?? 128} min={0} max={255}
        onCommit={v => onSet(0x00, 0x31, v)} />
      <Slider label="Gain B" value={status.ctGainB ?? 128} min={0} max={255}
        onCommit={v => onSet(0x00, 0x32, v)} />
      <Slider label="Bias R" value={status.ctBiasR ?? 128} min={0} max={255}
        onCommit={v => onSet(0x00, 0x33, v)} />
      <Slider label="Bias G" value={status.ctBiasG ?? 128} min={0} max={255}
        onCommit={v => onSet(0x00, 0x34, v)} />
      <Slider label="Bias B" value={status.ctBiasB ?? 128} min={0} max={255}
        onCommit={v => onSet(0x00, 0x35, v)} />
    </SectionCard>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/projector/ColorTempCustom.jsx
git commit -m "feat: add ColorTempCustom Gain/Bias sliders for Custom 1-5 slots"
```

---

## Task 7: Create `PictureTab.jsx`

**Files:**
- Create: `src/components/projector/PictureTab.jsx`

3-column scrollable layout. Left column: Calib Preset + Reset, Tone, Color Temp, Color Temp Custom (conditional), Cinema Black Pro. Center column: Processing (Motionflow + Reality Creation), Expert Noise, Expert Gamma/HDR. Right column: Color Space, Color Correction grid, Auto Calibration actions.

HDR interaction rule: when `status.hdr === 3` (Auto), the Gamma Correction and Color Space selectors are rendered with `disabled` + a note below them.

- [ ] **Step 1: Create the file**

```jsx
// src/components/projector/PictureTab.jsx
import { SectionCard, Slider, Select, Toggle, CtrlRow } from './Controls';
import ColorCorrection from './ColorCorrection';
import ColorTempCustom from './ColorTempCustom';

function sdcpToSigned(val) { return val > 0x7fff ? val - 0x10000 : val; }
function signedToSdcp(val) { return val < 0 ? val + 0x10000 : val; }

const CALIB_OPTS     = [[0,'Cinema Film 1'],[1,'Cinema Film 2'],[2,'Reference'],[3,'TV'],[4,'Photo'],[5,'Game'],[6,'Bright Cinema'],[7,'Bright TV'],[8,'User']];
const COLOR_TEMP_OPTS = [[0,'D93'],[1,'D75'],[2,'D65'],[9,'D55'],[3,'Custom 1'],[4,'Custom 2'],[5,'Custom 3'],[6,'Custom 4'],[7,'Custom 5']];
const GAMMA_OPTS     = [[0,'Off'],[1,'1.8'],[2,'2.0'],[3,'2.1'],[4,'2.2'],[5,'2.4'],[6,'2.6'],[7,'Gamma 7'],[8,'Gamma 8'],[9,'Gamma 9'],[10,'Gamma 10']];
const MOTIONFLOW_OPTS = [[0,'Off'],[1,'Smooth High'],[2,'Smooth Low'],[3,'Impulse'],[4,'Combination'],[5,'True Cinema']];
const HDR_OPTS       = [[0,'Off'],[1,'HDR10'],[2,'HLG'],[3,'Auto']];
const IRIS_OPTS      = [[0,'Off'],[2,'Full'],[3,'Limited']];
const NR_OPTS        = [[0,'Off'],[1,'Low'],[2,'Medium'],[3,'High'],[4,'Auto']];
const CONTR_ENH_OPTS = [[0,'Off'],[1,'Low'],[2,'Middle'],[3,'High']];
const LAMP_OPTS      = [[0,'Low'],[1,'High']];
const SMOOTH_GRAD_OPTS = [[0,'Off'],[1,'Low'],[2,'Middle'],[3,'High']];
const FILM_MODE_OPTS = [[0,'Auto'],[1,'Off']];
const CLEAR_WHITE_OPTS = [[0,'Off'],[1,'Low'],[2,'High']];
const COLOR_SPACE_OPTS = [[0,'BT.709'],[8,'BT.2020'],[3,'CS1'],[4,'CS2'],[5,'CS3'],[6,'Custom']];

export default function PictureTab({ status, onSet }) {
  const hdrAuto = status.hdr === 3;

  return (
    <div className="picture-tab">

      {/* ── Left column ── */}
      <div className="picture-col">

        <SectionCard title="Calib Preset">
          <Select label="Mode" value={status.calibPreset ?? 0} options={CALIB_OPTS}
            onChange={v => onSet(0x00, 0x02, v)} />
          <CtrlRow label="Reset Preset">
            <button className="btn btn-sm btn-danger" onClick={() => onSet(0x00, 0x00, 0)}>
              Reset to Defaults
            </button>
          </CtrlRow>
        </SectionCard>

        <SectionCard title="Tone">
          <Slider label="Contrast"   value={status.contrast   ?? 50} min={0} max={100} onCommit={v => onSet(0x00, 0x11, v)} />
          <Slider label="Brightness" value={status.brightness ?? 50} min={0} max={100} onCommit={v => onSet(0x00, 0x10, v)} />
          <Slider label="Color"      value={status.color      ?? 50} min={0} max={100} onCommit={v => onSet(0x00, 0x12, v)} />
          <Slider label="Hue"        value={status.hue        ?? 50} min={0} max={100} onCommit={v => onSet(0x00, 0x13, v)} />
          <Slider label="Sharpness"  value={status.sharpness  ?? 10} min={0} max={100} onCommit={v => onSet(0x00, 0x24, v)} />
        </SectionCard>

        <SectionCard title="Color Temperature">
          <Select label="Preset" value={status.colorTemp ?? 2} options={COLOR_TEMP_OPTS}
            onChange={v => onSet(0x00, 0x17, v)} />
        </SectionCard>

        <ColorTempCustom status={status} onSet={onSet} />

        <SectionCard title="Cinema Black Pro">
          <Select label="Advanced Iris"     value={status.advancedIris     ?? 0} options={IRIS_OPTS}      onChange={v => onSet(0x00, 0x1d, v)} />
          <Select label="Contrast Enhancer" value={status.contrastEnhancer ?? 0} options={CONTR_ENH_OPTS} onChange={v => onSet(0x00, 0x1e, v)} />
          <Select label="Lamp Control"      value={status.lampControl      ?? 1} options={LAMP_OPTS}      onChange={v => onSet(0x00, 0x1f, v)} />
        </SectionCard>

      </div>

      {/* ── Center column ── */}
      <div className="picture-col">

        <SectionCard title="Processing">
          <Select label="Motionflow" value={status.motionflow ?? 0} options={MOTIONFLOW_OPTS}
            onChange={v => onSet(0x00, 0x59, v)} />
          <Toggle label="Reality Creation" value={status.realityCreation ?? 1}
            onChange={v => onSet(0x00, 0x20, v)} />
        </SectionCard>

        <SectionCard title="Expert — Noise">
          <Select label="NR"               value={status.nr              ?? 0} options={NR_OPTS}         onChange={v => onSet(0x00, 0x25, v)} />
          <Select label="MPEG NR"          value={status.mpegNr          ?? 0} options={NR_OPTS}         onChange={v => onSet(0x00, 0x26, v)} />
          <Select label="Smooth Gradation" value={status.smoothGradation ?? 0} options={SMOOTH_GRAD_OPTS} onChange={v => onSet(0x00, 0x27, v)} />
          <Select label="Film Mode"        value={status.filmMode        ?? 0} options={FILM_MODE_OPTS}  onChange={v => onSet(0x00, 0x23, v)} />
        </SectionCard>

        <SectionCard title="Expert — Gamma & HDR">
          <div className={hdrAuto ? 'proj-hdr-auto-group' : ''}>
            <Select label="Gamma Correction" value={status.gammaCorrection ?? 0} options={GAMMA_OPTS}
              onChange={v => onSet(0x00, 0x22, v)} />
            {hdrAuto && <div className="proj-hdr-auto-note">Auto-managed when HDR = Auto</div>}
          </div>
          <Select label="HDR" value={status.hdr ?? 3} options={HDR_OPTS}
            onChange={v => onSet(0x00, 0x7c, v)} />
          <Toggle label="Input Lag Reduction" value={status.inputLagReduction ?? 0}
            onChange={v => onSet(0x00, 0x99, v)} />
          <Select label="Clear White" value={status.clearWhite ?? 0} options={CLEAR_WHITE_OPTS}
            onChange={v => onSet(0x00, 0x28, v)} />
          <Toggle label="x.v.Color" value={status.xvColor ?? 0}
            onChange={v => onSet(0x00, 0x29, v)} />
        </SectionCard>

      </div>

      {/* ── Right column ── */}
      <div className="picture-col-wide">

        <SectionCard title="Color Space">
          <div className={hdrAuto ? 'proj-hdr-auto-group' : ''}>
            <Select label="Mode" value={status.colorSpace ?? 0} options={COLOR_SPACE_OPTS}
              onChange={v => onSet(0x00, 0x3b, v)} />
            {hdrAuto && <div className="proj-hdr-auto-note">Auto-managed when HDR = Auto</div>}
          </div>
          {status.colorSpace === 6 && (
            <>
              <Slider label="Cyan–Red"
                value={sdcpToSigned(status.csCustomCyanRed ?? 0)} min={-100} max={100}
                onCommit={v => onSet(0x00, 0x76, signedToSdcp(v))} />
              <Slider label="Magenta–Green"
                value={sdcpToSigned(status.csCustomMagGreen ?? 0)} min={-100} max={100}
                onCommit={v => onSet(0x00, 0x77, signedToSdcp(v))} />
            </>
          )}
        </SectionCard>

        <ColorCorrection status={status} onSet={onSet} />

        <SectionCard title="Advanced Picture — Auto Calibration">
          <div className="proj-note">Requires 30+ min warm-up. Lens moves during Adjust.</div>
          <CtrlRow label="">
            <div className="proj-btn-row">
              <button className="btn btn-sm" onClick={() => onSet(0x00, 0xa0, 1)}>Pre Check</button>
              <button className="btn btn-sm" onClick={() => onSet(0x00, 0xa0, 2)}>Adjust</button>
              <button className="btn btn-sm" onClick={() => onSet(0x00, 0xa0, 3)}>Before/After</button>
              <button className="btn btn-sm btn-danger" onClick={() => onSet(0x00, 0xa0, 0)}>Reset</button>
            </div>
          </CtrlRow>
        </SectionCard>

      </div>
    </div>
  );
}
```

> **Note on Auto Calibration item code:** `0x00, 0xa0` is a best-guess. If it fails silently when tested against the projector, it can be corrected via pcap capture of ImageDirector's Auto Calibration operation.

- [ ] **Step 2: Delete `PictureSettings.jsx`**

```bash
rm src/components/projector/PictureSettings.jsx
```

- [ ] **Step 3: Start app, connect to projector, verify Picture tab renders correctly**

```bash
npm run dev
```

- Verify 3 columns appear with all sections
- Adjust Contrast — confirm projector responds within 5 seconds
- Switch Color Temp to Custom 1 — confirm ColorTempCustom section appears
- Verify HDR=Auto dims Gamma and Color Space with note

- [ ] **Step 4: Commit**

```bash
git add src/components/projector/PictureTab.jsx
git rm src/components/projector/PictureSettings.jsx
git commit -m "feat: add PictureTab with all picture/expert/advanced picture controls"
```

---

## Task 8: Create `SystemTab.jsx`

**Files:**
- Create: `src/components/projector/SystemTab.jsx`

3-column grid layout. Left: Screen (Aspect + Blanking). Center: Function (Dynamic Range, HDMI Format, Test Pattern, 3D Settings group). Right (stacked): Power & Input, Setup, Installation.

- [ ] **Step 1: Create the file**

```jsx
// src/components/projector/SystemTab.jsx
import { SectionCard, Select, Slider, Toggle, CtrlRow } from './Controls';

const ASPECT_OPTS     = [[0,'Normal'],[1,'V Stretch'],[2,'Squeeze'],[3,'Stretch'],[4,'1.85:1 Zoom'],[5,'2.35:1 Zoom']];
const DYN_RANGE_OPTS  = [[0,'Auto'],[1,'Limited'],[2,'Full']];
const HDMI_FMT_OPTS   = [[0,'Standard'],[1,'Enhanced']];
const D3_DISP_OPTS    = [[0,'Auto'],[1,'3D'],[2,'2D']];
const D3_FMT_OPTS     = [[0,'Simulated 3D'],[1,'Side-by-Side'],[2,'Over-Under']];
const D3_BRI_OPTS     = [[0,'Standard'],[1,'High']];
const IMAGE_FLIP_OPTS = [[0,'Off'],[1,'HV'],[2,'H'],[3,'V']];
const INPUT_OPTS      = [[0,'HDMI 1'],[1,'HDMI 2']];
const POWER_SAVING_OPTS = [[0,'Off'],[1,'Standby']];

export default function SystemTab({ status, onSet }) {
  return (
    <div className="system-tab">

      {/* ── Left: Screen ── */}
      <div className="system-col">
        <SectionCard title="Screen">
          <Select label="Aspect" value={status.aspect ?? 0} options={ASPECT_OPTS}
            onChange={v => onSet(0x00, 0x3c, v)} />
          <Slider label="Blanking Left"   value={status.blankLeft   ?? 0} min={0} max={20} onCommit={v => onSet(0x00, 0x78, v)} />
          <Slider label="Blanking Right"  value={status.blankRight  ?? 0} min={0} max={20} onCommit={v => onSet(0x00, 0x79, v)} />
          <Slider label="Blanking Top"    value={status.blankTop    ?? 0} min={0} max={20} onCommit={v => onSet(0x00, 0x7a, v)} />
          <Slider label="Blanking Bottom" value={status.blankBottom ?? 0} min={0} max={20} onCommit={v => onSet(0x00, 0x7b, v)} />
        </SectionCard>
      </div>

      {/* ── Center: Function ── */}
      <div className="system-col">
        <SectionCard title="Function">
          <Select label="Dynamic Range"  value={status.dynamicRange ?? 0} options={DYN_RANGE_OPTS} onChange={v => onSet(0x00, 0x60, v)} />
          <Select label="HDMI Format"    value={status.hdmiFormat   ?? 0} options={HDMI_FMT_OPTS}  onChange={v => onSet(0x00, 0x61, v)} />
          <Toggle label="Test Pattern"   value={status.testPattern  ?? 0} onChange={v => onSet(0x00, 0x63, v)} />
        </SectionCard>

        <SectionCard title="3D Settings">
          <Select label="2D-3D Display"   value={status.d3Display    ?? 0} options={D3_DISP_OPTS}  onChange={v => onSet(0x00, 0x65, v)} />
          <Select label="3D Format"       value={status.d3Format     ?? 0} options={D3_FMT_OPTS}   onChange={v => onSet(0x00, 0x66, v)} />
          <Select label="3D Brightness"   value={status.d3Brightness ?? 0} options={D3_BRI_OPTS}   onChange={v => onSet(0x00, 0x67, v)} />
        </SectionCard>
      </div>

      {/* ── Right: Power + Setup + Installation ── */}
      <div className="system-col">

        <SectionCard title="Power & Input">
          <CtrlRow label="">
            <div className="proj-btn-row">
              <button className="btn btn-sm btn-accent" onClick={() => onSet(0x01, 0x30, 1)}>⏻ Power On</button>
              <button className="btn btn-sm btn-danger"  onClick={() => onSet(0x01, 0x30, 0)}>⏻ Standby</button>
            </div>
          </CtrlRow>
          <Select label="Input" value={status.inputSelect ?? 0} options={INPUT_OPTS}
            onChange={v => onSet(0x00, 0x03, v)} />
        </SectionCard>

        <SectionCard title="Setup">
          <Toggle label="High Altitude Mode" value={status.altitudeMode  ?? 0} onChange={v => onSet(0x00, 0x64, v)} />
          <Toggle label="Remote Start"       value={status.remoteStart   ?? 0} onChange={v => onSet(0x00, 0x68, v)} />
          <Toggle label="Network Management" value={status.networkMgmt   ?? 0} onChange={v => onSet(0x00, 0x69, v)} />
          <Select label="Power Saving"       value={status.powerSaving   ?? 0} options={POWER_SAVING_OPTS} onChange={v => onSet(0x00, 0x6a, v)} />
          <CtrlRow label="Factory Reset">
            <button className="btn btn-sm btn-danger" onClick={() => {
              if (window.confirm('Reset ALL settings to factory defaults?')) onSet(0x00, 0xff, 1);
            }}>All Reset</button>
          </CtrlRow>
        </SectionCard>

        <SectionCard title="Installation">
          <Select label="Image Flip"      value={status.imageFlip      ?? 0} options={IMAGE_FLIP_OPTS} onChange={v => onSet(0x00, 0x62, v)} />
          <Toggle label="Lens Control"    value={status.lensControl    ?? 1}                           onChange={v => onSet(0x00, 0x6b, v)} />
          <Toggle label="IR Receiver Front" value={status.irFront      ?? 1}                           onChange={v => onSet(0x00, 0x6c, v)} />
          <Toggle label="IR Receiver Rear"  value={status.irRear       ?? 1}                           onChange={v => onSet(0x00, 0x6d, v)} />
        </SectionCard>

      </div>
    </div>
  );
}
```

> **Note:** Setup and Installation item codes (`00:64`–`00:6d`) are best-guesses. They will be confirmed or corrected once tested against the projector. All Reset uses `00:ff` as a placeholder — it may not work until the real code is discovered.

> **Note:** `testPattern` and `altitudeMode`, `remoteStart`, `networkMgmt`, `powerSaving`, `lensControl`, `irFront`, `irRear` are new status fields — add them to `ProjectorStatus` in `sdcp.ts` and to `getStatus()` polling:

Add to `ProjectorStatus` interface (after `imageFlip`):
```typescript
testPattern: number;
altitudeMode: number; remoteStart: number; networkMgmt: number; powerSaving: number;
lensControl: number; irFront: number; irRear: number;
```

Add to `getStatus()` (after `imageFlip`):
```typescript
const testPattern  = await g(0x00, 0x63, 0);
const altitudeMode = await g(0x00, 0x64, 0);
const remoteStart  = await g(0x00, 0x68, 0);
const networkMgmt  = await g(0x00, 0x69, 0);
const powerSaving  = await g(0x00, 0x6a, 0);
const lensControl  = await g(0x00, 0x6b, 1);
const irFront      = await g(0x00, 0x6c, 1);
const irRear       = await g(0x00, 0x6d, 1);
```

Add to `ITEM_FIELD` in `useProjector.js`:
```js
'00:63': 'testPattern',
'00:64': 'altitudeMode',
'00:68': 'remoteStart',
'00:69': 'networkMgmt',
'00:6a': 'powerSaving',
'00:6b': 'lensControl',
'00:6c': 'irFront',
'00:6d': 'irRear',
```

- [ ] **Step 2: Apply the additional fields above to `sdcp.ts` and `useProjector.js`**

- [ ] **Step 3: Start app, connect, verify System tab renders all 3 columns**

```bash
npm run dev
```

- [ ] **Step 4: Commit**

```bash
git add src/components/projector/SystemTab.jsx electron/sdcp.ts src/hooks/useProjector.js
git commit -m "feat: add SystemTab (Screen/Function/3D/Power/Setup/Installation)"
```

---

## Task 9: Create `InfoTab.jsx`

**Files:**
- Create: `src/components/projector/InfoTab.jsx`

2×2 read-only card layout. All data comes from `status` (polled from projector). No SET commands.

- [ ] **Step 1: Create the file**

```jsx
// src/components/projector/InfoTab.jsx

function InfoCard({ title, children }) {
  return (
    <div className="info-card">
      <div className="info-card-header">{title}</div>
      {children}
    </div>
  );
}

function InfoRow({ label, value, highlight = false }) {
  return (
    <div className="info-row">
      <span className="info-key">{label}</span>
      <span className={`info-val${highlight ? ' info-val-highlight' : ''}`}>{value ?? '—'}</span>
    </div>
  );
}

const GAMMA_LABELS = { 0:'Off', 1:'1.8', 2:'2.0', 3:'2.1', 4:'2.2', 5:'2.4', 6:'2.6', 7:'Gamma 7', 8:'Gamma 8', 9:'Gamma 9', 10:'Gamma 10' };
const HDR_LABELS   = { 0:'Off', 1:'HDR10', 2:'HLG', 3:'Auto' };
const TEMP_LABELS  = { 0:'D93', 1:'D75', 2:'D65', 9:'D55', 3:'Custom 1', 4:'Custom 2', 5:'Custom 3', 6:'Custom 4', 7:'Custom 5' };
const CS_LABELS    = { 0:'BT.709', 8:'BT.2020', 3:'CS1', 4:'CS2', 5:'CS3', 6:'Custom' };
const CALIB_LABELS = { 0:'Cinema Film 1', 1:'Cinema Film 2', 2:'Reference', 3:'TV', 4:'Photo', 5:'Game', 6:'Bright Cinema', 7:'Bright TV', 8:'User' };
const MF_LABELS    = { 0:'Off', 1:'Smooth High', 2:'Smooth Low', 3:'Impulse', 4:'Combination', 5:'True Cinema' };

export default function InfoTab({ status }) {
  return (
    <div className="info-tab">

      <InfoCard title="Active Picture Settings">
        <InfoRow label="Calib. Preset"     value={CALIB_LABELS[status.calibPreset]}  highlight />
        <InfoRow label="Gamma Correction"  value={GAMMA_LABELS[status.gammaCorrection]} highlight />
        <InfoRow label="Color Temperature" value={TEMP_LABELS[status.colorTemp]} />
        <InfoRow label="Color Space"       value={CS_LABELS[status.colorSpace]} />
        <InfoRow label="HDR Mode"          value={HDR_LABELS[status.hdr]} />
        <InfoRow label="Motionflow"        value={MF_LABELS[status.motionflow]} />
      </InfoCard>

      <InfoCard title="Input Signal">
        <InfoRow label="Signal Type"   value={status.signalType   ?? 'No signal'} highlight />
        <InfoRow label="Color Format"  value={status.colorFormat} />
        <InfoRow label="Color Space"   value={status.signalColorSpace} />
        <InfoRow label="HDR Format"    value={status.hdrFormat} />
      </InfoCard>

      <InfoCard title="Projector Identity">
        <InfoRow label="Model Name"       value={status.modelName ?? 'VPL-VW385ES'} />
        <InfoRow label="Serial Number"    value={status.serialNo} />
        <InfoRow label="Software Version" value={status.softwareVersion} />
        <InfoRow label="Lamp Timer"       value={status.lampTimer != null ? `${status.lampTimer} h` : null} highlight />
      </InfoCard>

      <InfoCard title="Network">
        <InfoRow label="IP Address"    value={status.ip} />
        <InfoRow label="Connection"    value="● Connected" highlight />
        <InfoRow label="Protocol"      value="SDCP / TCP 53484" />
        <InfoRow label="Poll Interval" value="5 s" />
      </InfoCard>

    </div>
  );
}
```

> **Note:** `status.signalType`, `status.colorFormat`, `status.signalColorSpace`, `status.hdrFormat`, `status.modelName`, `status.serialNo`, `status.softwareVersion`, `status.lampTimer`, `status.ip` are read-only fields that must be added to `ProjectorStatus` and polled in `getStatus()`.

Add to `ProjectorStatus` in `sdcp.ts`:
```typescript
// Read-only info (polled from Information menu)
signalType?: string;
colorFormat?: string;
signalColorSpace?: string;
hdrFormat?: string;
modelName?: string;
serialNo?: string;
softwareVersion?: string;
lampTimer?: number;
ip?: string;
```

These require GET commands with item codes not yet known. Add to `getStatus()` as placeholders (return null → undefined renders as '—' in InfoTab):
```typescript
// Info menu — item codes TBD, will show '—' until discovered
const lampTimer = await this.get(0x00, 0xa1, /* fallback */ undefined as any) ?? undefined;
```

For now, add `lampTimer?: number` only and leave the string fields as `undefined` (they'll show '—'). The item codes will be discovered via pcap once we have a working UI to test against.

Also pass `ip` via connect: in `useProjector.js` `connect()`, after successful connect, do `setStatus(prev => ({ ...prev, ip }))`.

- [ ] **Step 2: Add `ip` to status in `useProjector.js` connect callback**

In the `connect` callback after `result === 'ok'`:
```js
setStatus({ connected: true, ip }); // include ip in initial status
```

- [ ] **Step 3: Start app, connect, verify Info tab shows active settings correctly**

```bash
npm run dev
```

- Verify Calib Preset and Gamma Correction labels match what the projector shows
- Verify '—' displays cleanly for not-yet-discovered fields

- [ ] **Step 4: Commit**

```bash
git add src/components/projector/InfoTab.jsx electron/sdcp.ts src/hooks/useProjector.js
git commit -m "feat: add InfoTab with 2x2 read-only projector information cards"
```

---

## Task 10: CSS additions

**Files:**
- Modify: `src/index.css`

Add all new styles after the existing projector styles (after line 183).

- [ ] **Step 1: Append to `src/index.css`**

```css
/* ── Projector tab switcher ─────────────────────────── */
.proj-tab-bar {
  display: flex;
  border-bottom: 1px solid var(--border2);
  background: var(--bg2);
  flex-shrink: 0;
}
.proj-tab-btn {
  padding: 8px 20px;
  font-size: 12px;
  color: var(--text3);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-family: var(--font);
  transition: color 0.15s;
}
.proj-tab-btn:hover { color: var(--text2); }
.proj-tab-btn.active { color: var(--text); border-bottom-color: var(--accent); }

/* ── Section cards (replace proj-section) ───────────── */
.proj-card {
  background: var(--bg);
  border: 1px solid var(--border2);
  border-radius: 8px;
  overflow: hidden;
}
.proj-card-header {
  padding: 5px 12px;
  background: var(--bg3);
  border-bottom: 1px solid var(--border);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  color: var(--text3);
  font-weight: 600;
}
.proj-card-body { padding: 6px 0; }

/* ── Control rows ───────────────────────────────────── */
.proj-ctrl-row {
  display: flex;
  align-items: center;
  padding: 4px 12px;
  gap: 8px;
  min-height: 30px;
}
.proj-ctrl-row:hover { background: var(--accent-bg); }
.proj-ctrl-indent { padding-left: 28px; }
.proj-label { flex: 0 0 130px; font-size: 12px; color: var(--text2); }
.proj-ctrl-value { flex: 1; display: flex; align-items: center; }

/* ── Toggle ─────────────────────────────────────────── */
.proj-toggle { position: relative; display: inline-block; width: 36px; height: 20px; cursor: pointer; }
.proj-toggle input { opacity: 0; width: 0; height: 0; }
.proj-toggle-track {
  position: absolute; inset: 0;
  background: var(--bg4);
  border-radius: 10px;
  border: 1px solid var(--border2);
  transition: background 0.2s;
}
.proj-toggle-track::after {
  content: '';
  position: absolute;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: var(--bg);
  top: 2px; left: 2px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  transition: left 0.2s;
}
.proj-toggle input:checked + .proj-toggle-track { background: var(--accent); border-color: var(--accent); }
.proj-toggle input:checked + .proj-toggle-track::after { left: 18px; }

/* ── HDR auto note ──────────────────────────────────── */
.proj-hdr-auto-group { opacity: 0.5; pointer-events: none; }
.proj-hdr-auto-note { font-size: 10px; color: var(--accent); padding: 2px 12px 6px; font-style: italic; }
.proj-note { font-size: 11px; color: var(--text3); padding: 4px 12px 6px; }

/* ── Picture tab: 3-column layout ───────────────────── */
.picture-tab {
  display: flex;
  gap: 10px;
  padding: 12px;
  overflow-y: auto;
  flex: 1;
  align-items: flex-start;
}
.picture-col { flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.picture-col-wide { flex: 1.4; display: flex; flex-direction: column; gap: 8px; min-width: 0; }

/* ── System tab: 3-column grid ──────────────────────── */
.system-tab {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 10px;
  padding: 12px;
  overflow-y: auto;
  flex: 1;
  align-items: flex-start;
}
.system-col { display: flex; flex-direction: column; gap: 8px; }

/* ── Info tab: 2×2 grid ─────────────────────────────── */
.info-tab {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 12px;
  overflow-y: auto;
  flex: 1;
  align-items: flex-start;
}
.info-card {
  background: var(--bg);
  border: 1px solid var(--border2);
  border-radius: 8px;
  overflow: hidden;
}
.info-card-header {
  padding: 5px 12px;
  background: var(--bg3);
  border-bottom: 1px solid var(--border);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  color: var(--text3);
  font-weight: 600;
}
.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 12px;
  border-bottom: 1px solid var(--border);
}
.info-row:last-child { border-bottom: none; }
.info-key { font-size: 12px; color: var(--text3); }
.info-val { font-size: 12px; color: var(--text2); font-family: var(--mono); }
.info-val-highlight { color: var(--accent); font-weight: 600; }

/* ── Color Correction grid ──────────────────────────── */
.cc-grid { padding: 8px 12px; }
.cc-grid-header {
  display: grid;
  grid-template-columns: 80px 1fr 1fr 1fr;
  margin-bottom: 2px;
}
.cc-col-label {
  font-size: 11px;
  color: var(--text3);
  display: flex;
  align-items: center;
  gap: 5px;
}
.cc-col-header {
  font-size: 10px;
  color: var(--text3);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  text-align: center;
}
.cc-grid-row {
  display: grid;
  grid-template-columns: 80px 1fr 1fr 1fr;
  border-top: 1px solid var(--border);
  padding: 3px 0;
  align-items: center;
}
.cc-grid-row:hover { background: var(--accent-bg); }
.cc-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.cc-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 4px;
}
.cc-range { width: 100%; }
.cc-val { font-size: 10px; color: var(--text3); font-family: var(--mono); min-width: 26px; text-align: right; }
```

- [ ] **Step 2: Start app and do a full visual pass across all 3 tabs**

```bash
npm run dev
```

Check:
- Picture tab: 3 columns visible, all sections have correct spacing
- System tab: 3-column grid, section cards consistent
- Info tab: 2×2 cards fill correctly
- Color Correction grid: 6 rows × 3 slider columns, color dots visible
- Toggle switches: round track, slides on check
- HDR = Auto → Gamma/ColorSpace sections dimmed + note visible

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "feat: add CSS for tab switcher, section cards, picture/system/info layouts, CC grid, toggles"
```

---

## Task 11: Final wiring + cleanup

**Files:**
- Modify: `src/components/projector/Controls.jsx`, `src/components/projector/SystemTab.jsx`
- Verify: all imports resolve, no dangling references to `PictureSettings`

- [ ] **Step 1: Search for any remaining imports of PictureSettings**

```bash
grep -r "PictureSettings" src/
```

Expected: no output (it was deleted in Task 7).

- [ ] **Step 2: Verify full app build succeeds**

```bash
npm run build
```

Expected: exits 0 with no errors.

- [ ] **Step 3: Confirm poll still works — watch status update**

Connect to projector → switch HDR to HDR10 on the projector OSD → wait 5s → confirm app updates.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Phase 3 complete — full projector controls expansion (Picture/System/Info tabs)"
```

---

## Self-Review Checklist (run before starting implementation)

**Spec coverage:**
- ✅ 3-tab layout with pinned Gamma Slots — Task 4
- ✅ All Picture menu controls — Task 7
- ✅ Color Correction 6×3 grid — Task 5
- ✅ Color Temp Custom Gain/Bias — Task 6
- ✅ HDR interaction rules (dim when Auto) — Task 7 (`proj-hdr-auto-group`)
- ✅ System tab (Screen/Function/3D/Power/Setup/Installation) — Task 8
- ✅ Info tab (2×2 read-only cards) — Task 9
- ✅ Best-guess item codes for unknown items — Tasks 2/8
- ✅ ITEM_FIELD map expansion for optimistic updates — Task 3
- ✅ Signed value helpers for CC and CS Custom sliders — Tasks 5/7

**Type consistency:**
- `SectionCard`, `CtrlRow`, `Slider`, `Select`, `Toggle` defined in Task 1, used in Tasks 5–9
- `status.ccRHue` etc. defined in Task 2 (sdcp.ts), consumed in Task 5 (ColorCorrection.jsx)
- `onSet(upper, lower, value)` signature consistent throughout

**Known gaps (intentional):**
- Auto Calibration item code (`0x00, 0xa0`) is a placeholder — discover via pcap if needed
- Setup/Installation item codes (`00:64`–`00:6d`) are best-guesses — test and correct as needed
- Info tab string fields (Signal Type, Model Name etc.) need item code discovery — show '—' until known
- Blanking slider max (20) is an estimate — adjust after testing against projector
