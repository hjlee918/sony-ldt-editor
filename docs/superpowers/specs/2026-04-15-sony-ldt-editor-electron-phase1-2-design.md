# Sony LDT Editor — Electron App (Phase 1+2) Design Spec

**Date:** 2026-04-15
**Scope:** Phase 1 (Electron foundation) + Phase 2 (Projector upload + full control)
**Out of scope:** Phase 3 (advanced control panel expansion), Phase 4 (HTML stripped version)

---

## Overview

Convert the existing Vite/React Sony LDT Gamma Curve Editor into an installable Electron desktop app for Mac and Windows. Add direct projector communication over the SDCP protocol (reverse-engineered from Wireshark capture of Sony ImageDirector traffic), enabling users to upload custom gamma curves and control all major picture settings without leaving the app.

---

## 1. Architecture

### Process Structure

Three Electron processes:

**Main process** (`electron/main.ts`)
- Owns all TCP sockets (SDCP communication)
- Owns OS window management (main window + optional detached canvas window)
- Owns file system access (LDT import/export)
- Never touches the UI directly

**Preload script** (`electron/preload.ts`)
- Exposes a narrow, typed `window.projector` API to the renderer via `contextBridge`
- Renderer has no direct access to Node.js or Electron internals

**Renderer** (`src/`)
- The existing Vite/React app, extended with projector tab and editor sizing features
- Communicates with main exclusively through the preload bridge via `ipcRenderer`

### Window Management

- **Main window:** Hosts the tabbed UI (Editor tab + Projector tab). Standard resizable OS window.
- **Detached canvas window:** Second `BrowserWindow` spawned on demand. Shows only the canvas component. Fully resizable. Synced with main window via IPC. Closing it returns to single-window layout.

### Tech Stack

| Layer | Technology |
|---|---|
| App framework | Electron 29+ |
| Build tooling | electron-vite |
| UI framework | React 18 + Vite 5 |
| Language | JavaScript/JSX (existing) + TypeScript for main/preload |
| Packaging | electron-builder |
| Auto-update | electron-updater |

---

## 2. SDCP Communication Layer

All SDCP logic lives in the main process (`electron/sdcp.ts`).

### Protocol Details

- **Transport:** TCP, projector IP, port 53484
- **Packet format:**
  ```
  [02][0A][534F4E59][0070][length 2B][SDCP data][checksum][5A]
   STX  cat  SONY    ver                                    ETX
  ```
- **Authentication:** On connect, projector sends either `NOKEY\r\n` (no auth) or a random hex string. If auth required: compute `SHA256(randomString + password)` as 64-char hex, send with `\r\n`. Projector responds `ok` or `err_auth`.
- **Command response:** Each command acknowledged with `ok` or an error code (`err_cmd`, `err_val`, `err_inactive`, etc.)
- **Timeout:** 60 seconds per command (projector factory default)

### LDT Upload Protocol

Discovered from Wireshark capture of Sony ImageDirector traffic. Upload sends 12 packets total — 4 per channel (R/G/B), each carrying 16 output values.

**Sampling:** From the 1024-entry curve, sample every 16th entry (indices 0, 16, 32, … 1008) to produce 64 control points per channel. The projector interpolates between them.

**Packet data payload (37 bytes):**
```
[gamma_slot]  1 byte   0x07=Gamma7, 0x08=Gamma8, 0x09=Gamma9, 0x0A=Gamma10
[channel]     1 byte   0x00=R, 0x01=G, 0x02=B
[start_index] 2 bytes  big-endian: 0x0000, 0x0010, 0x0020, 0x0030
[count]       1 byte   0x10 (16)
[values]      32 bytes 16 × 16-bit big-endian output values (0–1023)
```

**SDCP item code for LDT data:** `8C 00`

**Full upload sequence:**
1. Send R channel chunks (start 0, 16, 32, 48) — 4 packets, await `ok` each
2. Send G channel chunks — 4 packets
3. Send B channel chunks — 4 packets
4. Send gamma slot activation command (item `00h 22h`, value `0007h`–`000Ah`) — confirmed present in Wireshark capture (frame 4067); exact packet bytes to be verified during implementation against the live projector response

Total: ~12 round-trips, completes in <1 second on local network.

### Picture Settings Command Reference

From VPL-VW320/VW520 protocol manual (compatible with VW385ES via SDCP):

| Setting | Item Upper | Item Lower | Value range |
|---|---|---|---|
| Gamma Correction | 00h | 22h | 0000h=Off, 0001h=1.8 … 0007h=Gamma7 … 000Ah=Gamma10 |
| Brightness | 00h | 10h | 0000h–0064h (0–100) |
| Contrast | 00h | 11h | 0000h–0064h (0–100) |
| Color Temp | 00h | 17h | 0000h=D93, 0001h=D75, 0002h=D65, 0003h–0007h=Custom1–5, 0009h=D55 |
| Color Space | 00h | 3Bh | 0000h=BT.709, 0003h–0005h=CS1–3, 0006h=Custom, 0008h=BT.2020 |
| Calib. Preset | 00h | 02h | 0000h=Cinema Film 1 … 0008h=User |
| Motionflow | 00h | 59h | 0000h=Off, 0001h=Smooth High … 0005h=True Cinema |
| HDR | 00h | 7Ch | 0000h=Off, 0001h=On, 0002h=Auto |
| Advanced Iris | 00h | 1Dh | 0000h=Off, 0002h=Full, 0003h=Limited |
| NR | 00h | 25h | 0000h=Off … 0004h=Auto |
| Input Lag Reduction | 00h | 99h | 0000h=Off, 0001h=On |
| Color Correction R: Hue | 00h | 87h | FFCEh–0032h (−50 to +50) |
| Color Correction R: Saturation | 00h | 88h | FFCEh–0032h (−50 to +50) |
| Color Correction R: Brightness | 00h | 89h | FFE2h–001Eh (−30 to +30) |
| Color Correction Y: Hue | 00h | 8Ah | FFCEh–0032h |
| Color Correction Y: Saturation | 00h | 8Bh | FFCEh–0032h |
| Color Correction Y: Brightness | 00h | 8Ch | FFE2h–001Eh |
| Color Correction G: Hue | 00h | 8Dh | FFCEh–0032h |
| Color Correction G: Saturation | 00h | 8Eh | FFCEh–0032h |
| Color Correction G: Brightness | 00h | 8Fh | FFE2h–001Eh |
| Color Correction C: Hue | 00h | 90h | FFCEh–0032h |
| Color Correction C: Saturation | 00h | 91h | FFCEh–0032h |
| Color Correction C: Brightness | 00h | 92h | FFE2h–001Eh |
| Color Correction B: Hue | 00h | 93h | FFCEh–0032h |
| Color Correction B: Saturation | 00h | 94h | FFCEh–0032h |
| Color Correction B: Brightness | 00h | 95h | FFE2h–001Eh |
| Color Correction M: Hue | 00h | 96h | FFCEh–0032h |
| Color Correction M: Saturation | 00h | 97h | FFCEh–0032h |
| Color Correction M: Brightness | 00h | 98h | FFE2h–001Eh |
| Color Space Custom Cyan–Red | 00h | 76h | FFCEh–0032h |
| Color Space Custom Magenta–Green | 00h | 77h | FFCEh–0032h |
| Power | 01h | 30h | 0000h=Off, 0001h=On (Set only) |

### IPC Surface (preload bridge)

```ts
window.projector = {
  connect(ip: string, password?: string): Promise<'ok' | 'err_auth' | 'err_connect'>
  disconnect(): Promise<void>
  getStatus(): Promise<ProjectorStatus>
  set(itemUpper: number, itemLower: number, value: number): Promise<'ok' | ErrorCode>
  upload(slot: 7|8|9|10, channels: [number[], number[], number[]]): Promise<void>
  on(event: 'status' | 'upload-progress', cb: (data: any) => void): () => void
}
```

`ProjectorStatus` includes: connected, power, input, calibPreset, gammaCorrection, brightness, contrast, colorTemp, colorSpace, motionflow, hdr, all color correction values.

---

## 3. Editor Tab Enhancements

All existing curve editing features preserved without modification. Three additions:

### Draggable Divider
- Resize handle between canvas area and sidebar
- Drag to continuously resize the split
- Persisted to `localStorage` key `editorSplit`
- Minimum canvas width: 400px; minimum sidebar width: 220px

### Focus Toggle
- Button (⛶) in canvas toolbar collapses sidebar entirely
- Canvas takes full window width
- Keyboard shortcut: `F` (when focus is not in a text input)
- Press again to restore to last saved split position

### Detach Canvas
- Button in canvas toolbar opens a second `BrowserWindow` containing only the canvas + zoom/pan controls + hover readout
- Detached window is fully resizable (no min/max constraints)
- Curve edits in either window sync to the other in real time via IPC
- Closing the detached window restores single-window layout
- Detach state not persisted across app restarts

---

## 4. Projector Tab

### Status Bar (top)
Persistent strip showing: connection status (●/○ with color), projector model, power state, active input, active calibration preset, active gamma slot. Contains prominent **⬆ Upload to Gamma X** button targeting the selected slot.

### Left Column — Gamma Slots + Device Control

**Gamma Slots section:**
- Four rows: Gamma 7, 8, 9, 10
- Each row: slot label | Upload button | ▶ Use button
- Active slot highlighted; selecting a slot sets it as upload target
- Active slot indicator synced from projector status

**Power:**
- On / Standby buttons

**Input:**
- HDMI 1 / HDMI 2 toggle buttons

**Calibration Preset:**
- Dropdown: Cinema Film 1, Cinema Film 2, Reference, TV, Photo, Game, Bright Cinema, Bright TV, User

### Right Column — Picture Settings

**Sliders:** Brightness (0–100), Contrast (0–100)

**Dropdowns:** Color Temp, Color Space, Motionflow, HDR, NR, Advanced Iris, Input Lag Reduction

**Color Correction:** Compact grid — 6 color axes (Red, Yellow, Green, Cyan, Blue, Magenta) × 3 parameters (Hue, Saturation, Brightness) = 18 controls shown as mini sliders

**Color Space Custom:** Cyan–Red and Magenta–Green sliders, visible only when Color Space is set to a Custom mode

### Connection Panel (shown when disconnected)
- IP address text input (remembers last used IP via `localStorage`)
- Optional password field (for ADCP/SDCP auth)
- Connect button
- Error message on auth failure or connection timeout

---

## 5. Packaging & Distribution

### Mac
- Output: `.dmg` disk image containing universal `.app` (Intel + Apple Silicon)
- Code-signed with Apple Developer certificate
- Notarized via Apple notarization service
- Gatekeeper compliant — no "unidentified developer" warning

### Windows
- Output: NSIS `.exe` installer + portable `.zip`
- Installs to `%LOCALAPPDATA%\SonyLDTEditor`
- Creates Start Menu shortcut
- Supports clean uninstall

### App Identity
- Display name: `Sony LDT Editor`
- Bundle ID: `com.sonyldteditor.app`
- Starting version: `1.0.0`

### Auto-update
- `electron-updater` checks GitHub Releases on launch
- User-triggered update (no silent background installs)
- Update notification shown in app header

### Build Commands
```
npm run dev           # hot-reload dev server (main + preload + renderer)
npm run build         # production build + package for current OS
npm run build:mac     # Mac universal binary
npm run build:win     # Windows (requires Wine on Mac, or run on Windows CI)
```

---

## 6. Out of Scope (Future Phases)

- **Phase 3:** Lens control (shift/focus/zoom), 3D settings, SNMP monitoring, auto-discovery via SDAP broadcast
- **Phase 4:** HTML stripped version with editor features but no projector connectivity
- Code signing certificate procurement (prerequisite for distribution, handled separately)
