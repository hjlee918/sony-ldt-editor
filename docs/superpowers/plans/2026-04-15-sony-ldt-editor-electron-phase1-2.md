# Sony LDT Editor — Electron App (Phase 1+2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the existing Vite/React Sony LDT Gamma Editor into an Electron desktop app with direct projector SDCP communication, LDT upload, and full picture-settings control.

**Architecture:** Three Electron processes — main (TCP/SDCP + window management), preload (contextBridge IPC surface), renderer (existing React UI + new tabs). electron-vite wraps the existing Vite/React build with minimal disruption. SDCP packets are constructed in main and tested in isolation with Vitest.

**Tech Stack:** Electron 29, electron-vite, electron-builder, electron-updater, React 18, Vitest, TypeScript (main/preload only — renderer stays JavaScript/JSX).

---

## SDCP Protocol Reference (Wireshark-Verified)

All packet bytes below are extracted from `Resources/sony projector.pcapng`.

### Outer Frame Format

```
[02][0a]             2B  STX + SDCP-over-TCP marker
[53 4f 4e 59]        4B  "SONY" community
[dir][70]            2B  direction: 00=request, 01=response; always paired with 0x70
[len_hi][len_lo]     2B  big-endian: count of ALL remaining bytes (inner_data + 1 checksum + 1 ETX)
[inner_data...]      NB  command payload (see per-command sections below)
[checksum]           1B  XOR of inner_data[1:] (skip first byte 0xa5)
[5a]                 1B  ETX — always last
```

Total frame = 10 (header) + len bytes.

### LDT Upload Packet (66 bytes, one per 16-value chunk)

```
inner_data (54 bytes):
  [a5]                   fixed session byte
  [01 00 01 00 01 05 00 01 00 01]  fixed 10-byte prefix
  [8c][00]               item code: LDT data write
  [80][27][00][25]       sub-header: set-type(80), field(27), data_len BE(0x0025=37)
  [slot]                 1B: 07=G7 08=G8 09=G9 0a=G10
  [channel]              1B: 00=R 01=G 02=B
  [start_hi][start_lo]   BE uint16: 0x0000 / 0x0010 / 0x0020 / 0x0030
  [count]                1B: always 0x10 (16)
  [32 bytes]             16 × uint16 BE output values (0–1023)
checksum = XOR of inner_data[1:]
ETX = 0x5a
```

Known-good packet (Gamma10, R channel, start=0, values from a sample curve):
```
020a534f4e5900700038
a5010001000105000100018c00802700250a000000100000000a0012001a00210029003100390041004a0052005c0065006f00790084
e05a
```

### Gamma Slot Activation Packet (35 bytes)

```
inner_data (23 bytes):
  [a5]                   fixed
  [01 00 01 00 01 05 00 01 00 01]  fixed prefix
  [8b][00]               batch SET command
  [80][08][00][06]       sub-header
  [00][07]               fixed parameter
  [00][slot_value]       slot: 07/08/09/0a
  [00][07]               fixed parameter
checksum = XOR of inner_data[1:]
ETX = 0x5a
```

Known-good packet (activate Gamma10):
```
020a534f4e5900700019
a5010001000105000100018b00800800060007000a0007
0b5a
```

### GET Status Packet (query single item)

Pattern observed for GET Gamma Correction (item 0x0022):
```
inner_data (19 bytes):
  [a5 01 00 01 00 01 05 00 01 00 01]  fixed prefix
  [00][01]               GET single-item selector
  [80][04][00][02]       sub-header
  [item_upper][item_lower]
checksum = XOR of inner_data[1:]
ETX = 0x5a
```

---

## File Map

**New files:**
- `electron/main.ts` — BrowserWindow creation, IPC handlers, SDCP orchestration
- `electron/preload.ts` — contextBridge: exposes `window.projector`
- `electron/sdcp.ts` — SDCP packet builder + SdcpConnection TCP class
- `electron/sdcp.test.ts` — Vitest unit tests for packet building
- `electron.vite.config.ts` — replaces `vite.config.js` for the Electron build
- `src/components/ResizableSplit.jsx` — draggable divider between canvas and sidebar
- `src/components/DetachedCanvas.jsx` — canvas-only renderer for second window
- `src/components/projector/ConnectionPanel.jsx`
- `src/components/projector/ProjectorStatusBar.jsx`
- `src/components/projector/GammaSlots.jsx`
- `src/components/projector/PictureSettings.jsx`
- `src/components/projector/ProjectorTab.jsx`
- `src/hooks/useProjector.js`

**Modified files:**
- `package.json` — add electron, electron-vite, electron-builder, vitest, typescript
- `src/components/App.jsx` — add tab bar, wire ResizableSplit, wire detach IPC
- `index.html` — add CSP meta tag

**Deleted files:**
- `vite.config.js` — replaced by `electron.vite.config.ts`

---

## Task 1: Install dependencies and scaffold electron-vite

**Files:**
- Modify: `package.json`
- Create: `electron.vite.config.ts`
- Create: `electron/main.ts` (stub)
- Create: `electron/preload.ts` (stub)
- Delete: `vite.config.js`

- [ ] **Step 1: Install packages**

```bash
npm install --save-dev electron@^29.0.0 electron-vite@^2.3.0 electron-builder@^24.13.3 vitest@^1.6.0 typescript@^5.4.5 @types/node@^20.12.0
npm install electron-updater@^6.1.8
```

- [ ] **Step 2: Create `electron.vite.config.ts`**

```typescript
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    plugins: [react()],
    server: { port: 5173 },
  },
});
```

- [ ] **Step 3: Create `electron/main.ts` (minimal window stub)**

```typescript
import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 700,
    minHeight: 500,
    title: 'Sony LDT Editor',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
```

- [ ] **Step 4: Create `electron/preload.ts` (empty bridge stub)**

```typescript
import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('projector', {});
```

- [ ] **Step 5: Update `package.json`**

Replace the entire `scripts` block and add the required fields:

```json
{
  "name": "sony-ldt-editor",
  "version": "1.0.0",
  "description": "Gamma curve editor for Sony VPL-VW projectors",
  "main": "./out/main/index.js",
  "type": "module",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "build:mac": "electron-vite build && electron-builder --mac",
    "build:win": "electron-vite build && electron-builder --win",
    "preview": "electron-vite preview",
    "test": "vitest run"
  }
}
```

- [ ] **Step 6: Install `@electron-toolkit/utils`**

```bash
npm install @electron-toolkit/utils
```

- [ ] **Step 7: Delete `vite.config.js`**

```bash
rm vite.config.js
```

- [ ] **Step 8: Run and verify Electron window opens**

```bash
npm run dev
```

Expected: Electron window opens, renders the existing gamma curve editor. No console errors.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json electron.vite.config.ts electron/main.ts electron/preload.ts
git commit -m "feat: scaffold electron-vite app shell"
```

---

## Task 2: SDCP packet builder (unit tested)

This task builds the packet-assembly core in isolation, fully tested before any TCP connection.

**Files:**
- Create: `electron/sdcp.ts`
- Create: `electron/sdcp.test.ts`

- [ ] **Step 1: Write failing tests first**

Create `electron/sdcp.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildFrame, buildLdtPacket, buildActivateSlotPacket } from './sdcp';

describe('buildFrame', () => {
  it('produces correct 10-byte header', () => {
    const frame = buildFrame(Buffer.from([0xa5, 0x01]));
    expect(frame[0]).toBe(0x02);
    expect(frame[1]).toBe(0x0a);
    expect(frame.slice(2, 6).toString()).toBe('SONY');
    expect(frame[6]).toBe(0x00); // request direction
    expect(frame[7]).toBe(0x70);
  });

  it('encodes length as big-endian count of remaining bytes', () => {
    // inner_data = [a5, 01], checksum = XOR of [01] = 0x01, ETX = 0x5a
    // length = 2 (inner) + 2 (checksum + ETX) = 4
    const frame = buildFrame(Buffer.from([0xa5, 0x01]));
    const len = (frame[8] << 8) | frame[9];
    expect(len).toBe(4);
  });

  it('computes checksum as XOR of inner_data[1:]', () => {
    // inner_data = [a5, 01, 00, 22]
    // checksum = 01 XOR 00 XOR 22 = 0x23
    const inner = Buffer.from([0xa5, 0x01, 0x00, 0x22]);
    const frame = buildFrame(inner);
    const checksumByte = frame[frame.length - 2];
    expect(checksumByte).toBe(0x23);
  });

  it('always ends with 0x5a', () => {
    const frame = buildFrame(Buffer.from([0xa5, 0x01]));
    expect(frame[frame.length - 1]).toBe(0x5a);
  });
});

describe('buildLdtPacket', () => {
  // Known-good test vector from Wireshark capture (frame 3851)
  // Gamma10, R channel, start=0, 16 sample values
  const KNOWN_GOOD =
    '020a534f4e5900700038' +
    'a5010001000105000100018c00802700250a000000100000000a0012001a00210029003100390041004a0052005c0065006f00790084' +
    'e05a';

  it('matches captured packet for Gamma10, R, start=0', () => {
    const values = [0, 10, 18, 26, 33, 41, 49, 57, 65, 74, 82, 92, 101, 111, 121, 132];
    const pkt = buildLdtPacket({ slot: 10, channel: 0, startIndex: 0, values });
    expect(pkt.toString('hex')).toBe(KNOWN_GOOD);
  });

  it('sets start_index correctly for second chunk (startIndex=16)', () => {
    // frame 4020 known-good
    const KNOWN_GOOD_CHUNK2 =
      '020a534f4e5900700038' +
      'a5010001000105000100018c00802700250a000010100090009c00a800b600c400d200e100f2010201120123013501470159016b017f' +
      '1b5a';
    const values = [144, 156, 168, 182, 196, 210, 225, 242, 258, 274, 291, 309, 327, 345, 363, 383];
    const pkt = buildLdtPacket({ slot: 10, channel: 0, startIndex: 16, values });
    expect(pkt.toString('hex')).toBe(KNOWN_GOOD_CHUNK2);
  });

  it('throws if values.length !== 16', () => {
    expect(() => buildLdtPacket({ slot: 10, channel: 0, startIndex: 0, values: [1, 2, 3] })).toThrow();
  });
});

describe('buildActivateSlotPacket', () => {
  // Known-good: activate Gamma10 (frame 4067)
  const KNOWN_GOOD =
    '020a534f4e5900700019' +
    'a5010001000105000100018b00800800060007000a0007' +
    '0b5a';

  it('matches captured packet for Gamma10 activation', () => {
    const pkt = buildActivateSlotPacket(10);
    expect(pkt.toString('hex')).toBe(KNOWN_GOOD);
  });

  it('uses correct slot byte for Gamma7', () => {
    const pkt = buildActivateSlotPacket(7);
    // slot byte should be 0x07
    expect(pkt[21]).toBe(0x07); // byte 22 of frame (0-indexed 21) is the slot value
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test
```

Expected: `FAIL electron/sdcp.test.ts` — `buildFrame`, `buildLdtPacket`, `buildActivateSlotPacket` not found.

- [ ] **Step 3: Implement `electron/sdcp.ts` — packet builder**

```typescript
const FIXED_PREFIX = Buffer.from([0xa5, 0x01, 0x00, 0x01, 0x00, 0x01, 0x05, 0x00, 0x01, 0x00, 0x01]);

/** Wrap inner_data in the SDCP-over-TCP outer frame. */
export function buildFrame(innerData: Buffer): Buffer {
  const checksum = innerData.slice(1).reduce((acc, b) => acc ^ b, 0);
  const len = innerData.length + 2; // +1 checksum +1 ETX
  const frame = Buffer.alloc(10 + innerData.length + 2);
  frame[0] = 0x02;
  frame[1] = 0x0a;
  frame.write('SONY', 2, 'ascii');
  frame[6] = 0x00; // request direction
  frame[7] = 0x70;
  frame[8] = (len >> 8) & 0xff;
  frame[9] = len & 0xff;
  innerData.copy(frame, 10);
  frame[10 + innerData.length] = checksum;
  frame[10 + innerData.length + 1] = 0x5a;
  return frame;
}

interface LdtPacketOptions {
  slot: 7 | 8 | 9 | 10;
  channel: 0 | 1 | 2;
  startIndex: 0 | 16 | 32 | 48;
  values: number[]; // exactly 16 values, each 0–1023
}

export function buildLdtPacket(opts: LdtPacketOptions): Buffer {
  const { slot, channel, startIndex, values } = opts;
  if (values.length !== 16) throw new Error('values must have exactly 16 entries');
  const payload = Buffer.alloc(37);
  payload[0] = slot;
  payload[1] = channel;
  payload.writeUInt16BE(startIndex, 2);
  payload[4] = 0x10; // count = 16
  for (let i = 0; i < 16; i++) {
    payload.writeUInt16BE(values[i], 5 + i * 2);
  }
  const inner = Buffer.concat([
    FIXED_PREFIX,
    Buffer.from([0x8c, 0x00, 0x80, 0x27, 0x00, 0x25]),
    payload,
  ]);
  return buildFrame(inner);
}

export function buildActivateSlotPacket(slot: 7 | 8 | 9 | 10): Buffer {
  const inner = Buffer.concat([
    FIXED_PREFIX,
    Buffer.from([0x8b, 0x00, 0x80, 0x08, 0x00, 0x06, 0x00, 0x07, 0x00, slot, 0x00, 0x07]),
  ]);
  return buildFrame(inner);
}

export function buildGetPacket(itemUpper: number, itemLower: number): Buffer {
  const inner = Buffer.concat([
    FIXED_PREFIX,
    Buffer.from([0x00, 0x01, 0x80, 0x04, 0x00, 0x02, itemUpper, itemLower]),
  ]);
  return buildFrame(inner);
}

export function buildSetPacket(itemUpper: number, itemLower: number, value: number): Buffer {
  const inner = Buffer.concat([
    FIXED_PREFIX,
    Buffer.from([
      0x00, 0x00, 0x80, 0x06, 0x00, 0x04,
      itemUpper, itemLower,
      (value >> 8) & 0xff, value & 0xff,
    ]),
  ]);
  return buildFrame(inner);
}
```

> **Note:** `buildSetPacket` and `buildGetPacket` use inferred structure. Verify against live projector during Task 9.

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test
```

Expected: `PASS electron/sdcp.test.ts` — all assertions green.

- [ ] **Step 5: Commit**

```bash
git add electron/sdcp.ts electron/sdcp.test.ts
git commit -m "feat: SDCP packet builder with verified test vectors"
```

---

## Task 3: SDCP TCP connection class

**Files:**
- Modify: `electron/sdcp.ts` — add `SdcpConnection` class

- [ ] **Step 1: Add connection class to `electron/sdcp.ts`**

Append to the existing file:

```typescript
import { createHash } from 'crypto';
import { Socket } from 'net';
import { EventEmitter } from 'events';

export type ErrorCode = 'err_auth' | 'err_connect' | 'err_cmd' | 'err_val' | 'err_inactive' | 'err_timeout';

export class SdcpConnection extends EventEmitter {
  private socket: Socket | null = null;
  private ip = '';
  private responseBuffer = Buffer.alloc(0);

  async connect(ip: string, password?: string): Promise<'ok' | ErrorCode> {
    return new Promise((resolve) => {
      const sock = new Socket();
      this.ip = ip;
      let authDone = false;

      const timer = setTimeout(() => {
        sock.destroy();
        resolve('err_connect');
      }, 10_000);

      sock.once('data', async (data) => {
        const challenge = data.toString().trim();
        if (challenge === 'NOKEY') {
          authDone = true;
          clearTimeout(timer);
          this.socket = sock;
          sock.on('data', (d) => this.onData(d));
          resolve('ok');
        } else {
          // Challenge: SHA256(challenge + password)
          const hash = createHash('sha256')
            .update(challenge + (password ?? ''))
            .digest('hex');
          sock.write(hash + '\r\n');
          sock.once('data', (resp) => {
            clearTimeout(timer);
            const answer = resp.toString().trim();
            if (answer === 'ok') {
              authDone = true;
              this.socket = sock;
              sock.on('data', (d) => this.onData(d));
              resolve('ok');
            } else {
              sock.destroy();
              resolve('err_auth');
            }
          });
        }
      });

      sock.on('error', () => {
        if (!authDone) {
          clearTimeout(timer);
          resolve('err_connect');
        }
      });

      sock.connect(53484, ip);
    });
  }

  async disconnect(): Promise<void> {
    this.socket?.destroy();
    this.socket = null;
  }

  /** Send a pre-built frame and wait for the response frame. */
  async sendFrame(frame: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('not connected'));
      const timer = setTimeout(() => reject(new Error('err_timeout')), 60_000);
      this.once('response', (resp: Buffer) => {
        clearTimeout(timer);
        resolve(resp);
      });
      this.socket.write(frame);
    });
  }

  private onData(data: Buffer): void {
    this.responseBuffer = Buffer.concat([this.responseBuffer, data]);
    // Minimum frame size: 10 header + 2 checksum+ETX = 12 bytes
    while (this.responseBuffer.length >= 12) {
      if (this.responseBuffer[0] !== 0x02 || this.responseBuffer[1] !== 0x0a) {
        // Out of sync — drop one byte and try again
        this.responseBuffer = this.responseBuffer.slice(1);
        continue;
      }
      const len = (this.responseBuffer[8] << 8) | this.responseBuffer[9];
      const frameLen = 10 + len;
      if (this.responseBuffer.length < frameLen) break;
      const frame = this.responseBuffer.slice(0, frameLen);
      this.responseBuffer = this.responseBuffer.slice(frameLen);
      this.emit('response', frame);
    }
  }

  isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }
}
```

- [ ] **Step 2: Verify existing tests still pass**

```bash
npm test
```

Expected: PASS (no new tests for connection class — live projector required).

- [ ] **Step 3: Commit**

```bash
git add electron/sdcp.ts
git commit -m "feat: SDCP TCP connection class with SHA256 auth"
```

---

## Task 4: SDCP set(), getStatus(), upload() methods

**Files:**
- Modify: `electron/sdcp.ts` — add high-level methods to `SdcpConnection`

- [ ] **Step 1: Add methods to `SdcpConnection` class in `electron/sdcp.ts`**

Inside the class, add these methods after `isConnected()`:

```typescript
  async set(itemUpper: number, itemLower: number, value: number): Promise<'ok' | ErrorCode> {
    try {
      const frame = buildSetPacket(itemUpper, itemLower, value);
      const resp = await this.sendFrame(frame);
      // Response inner data byte index 1: 05=response type, check for error
      // If response inner data contains error flags, return error code
      // OK indicated by successful round-trip with no error byte set
      return 'ok'; // TODO: parse error codes from resp if projector returns NG
    } catch (e: any) {
      return (e.message as ErrorCode) || 'err_cmd';
    }
  }

  async get(itemUpper: number, itemLower: number): Promise<number | null> {
    try {
      const frame = buildGetPacket(itemUpper, itemLower);
      const resp = await this.sendFrame(frame);
      // Value is in the last 2 bytes before checksum+ETX in response inner data
      const inner = resp.slice(10, resp.length - 2);
      if (inner.length < 2) return null;
      return inner.readUInt16BE(inner.length - 2);
    } catch {
      return null;
    }
  }

  async getStatus(): Promise<ProjectorStatus> {
    const [gamma, brightness, contrast, colorTemp, colorSpace,
           calib, motionflow, hdr, advIris, nr, inputLag] = await Promise.all([
      this.get(0x00, 0x22),
      this.get(0x00, 0x10),
      this.get(0x00, 0x11),
      this.get(0x00, 0x17),
      this.get(0x00, 0x3b),
      this.get(0x00, 0x02),
      this.get(0x00, 0x59),
      this.get(0x00, 0x7c),
      this.get(0x00, 0x1d),
      this.get(0x00, 0x25),
      this.get(0x00, 0x99),
    ]);
    return {
      connected: true,
      gammaCorrection: gamma ?? 0,
      brightness: brightness ?? 50,
      contrast: contrast ?? 50,
      colorTemp: colorTemp ?? 2,
      colorSpace: colorSpace ?? 0,
      calibPreset: calib ?? 0,
      motionflow: motionflow ?? 0,
      hdr: hdr ?? 2,
      advancedIris: advIris ?? 0,
      nr: nr ?? 0,
      inputLagReduction: inputLag ?? 0,
    };
  }

  async upload(
    slot: 7 | 8 | 9 | 10,
    channels: [number[], number[], number[]],
    onProgress?: (pct: number) => void,
  ): Promise<void> {
    const CHUNKS = 4;
    const CHANNEL_COUNT = 3;
    let step = 0;
    const total = CHANNEL_COUNT * CHUNKS + 1; // 12 data + 1 activation

    for (let ch = 0; ch < CHANNEL_COUNT; ch++) {
      const curve = channels[ch];
      for (let chunk = 0; chunk < CHUNKS; chunk++) {
        const startIndex = chunk * 16;
        // Sample every 16th entry from the 1024-entry curve
        const values = Array.from({ length: 16 }, (_, i) =>
          Math.round(Math.min(1023, Math.max(0, curve[(startIndex + i) * 16]))),
        );
        const pkt = buildLdtPacket({
          slot,
          channel: ch as 0 | 1 | 2,
          startIndex: startIndex as 0 | 16 | 32 | 48,
          values,
        });
        await this.sendFrame(pkt);
        step++;
        onProgress?.(Math.round((step / total) * 100));
      }
    }

    // Activate the slot
    const activationPkt = buildActivateSlotPacket(slot);
    await this.sendFrame(activationPkt);
    onProgress?.(100);
  }
```

Add the `ProjectorStatus` type before the class:

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
  inputLagReduction: number;
}
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: PASS (existing packet-builder tests still green).

- [ ] **Step 3: Commit**

```bash
git add electron/sdcp.ts
git commit -m "feat: SDCP set/get/getStatus/upload high-level methods"
```

---

## Task 5: Main process IPC handlers

Wire the SDCP connection into the Electron main process so the renderer can call it.

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Replace `electron/main.ts` with full version including IPC**

```typescript
import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import { SdcpConnection } from './sdcp';

let mainWindow: BrowserWindow | null = null;
let detachedWindow: BrowserWindow | null = null;
const sdcp = new SdcpConnection();

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 700,
    minHeight: 500,
    title: 'Sony LDT Editor',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// ── IPC: Projector ──────────────────────────────────────────────────────────

ipcMain.handle('projector:connect', async (_e, ip: string, password?: string) =>
  sdcp.connect(ip, password),
);

ipcMain.handle('projector:disconnect', async () => sdcp.disconnect());

ipcMain.handle('projector:getStatus', async () =>
  sdcp.isConnected() ? sdcp.getStatus() : { connected: false },
);

ipcMain.handle('projector:set', async (_e, upper: number, lower: number, value: number) =>
  sdcp.set(upper, lower, value),
);

ipcMain.handle('projector:upload', async (event, slot: number, channels: [number[], number[], number[]]) => {
  await sdcp.upload(slot as 7 | 8 | 9 | 10, channels, (pct) => {
    event.sender.send('projector:upload-progress', pct);
  });
});

// ── IPC: Detached canvas window ─────────────────────────────────────────────

ipcMain.handle('canvas:detach', async () => {
  if (detachedWindow && !detachedWindow.isDestroyed()) {
    detachedWindow.focus();
    return;
  }
  detachedWindow = new BrowserWindow({
    width: 900,
    height: 700,
    title: 'Sony LDT — Canvas',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const url = is.dev && process.env['ELECTRON_RENDERER_URL']
    ? `${process.env['ELECTRON_RENDERER_URL']}?detached=1`
    : `file://${join(__dirname, '../renderer/index.html')}?detached=1`;
  detachedWindow.loadURL(url);

  detachedWindow.on('closed', () => {
    detachedWindow = null;
    mainWindow?.webContents.send('canvas:detach-closed');
  });
});

ipcMain.handle('canvas:close-detached', async () => {
  detachedWindow?.close();
});

// Relay curve sync between windows
ipcMain.on('canvas:curve-sync', (event, data) => {
  const target = event.sender === mainWindow?.webContents
    ? detachedWindow?.webContents
    : mainWindow?.webContents;
  target?.send('canvas:curve-sync', data);
});

// ── App lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
```

- [ ] **Step 2: Verify dev server still starts**

```bash
npm run dev
```

Expected: Electron window opens with no errors in main process console.

- [ ] **Step 3: Commit**

```bash
git add electron/main.ts
git commit -m "feat: main process IPC handlers for projector and canvas detach"
```

---

## Task 6: Preload contextBridge

**Files:**
- Modify: `electron/preload.ts`

- [ ] **Step 1: Replace `electron/preload.ts` with full bridge**

```typescript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('projector', {
  connect: (ip: string, password?: string) =>
    ipcRenderer.invoke('projector:connect', ip, password),
  disconnect: () => ipcRenderer.invoke('projector:disconnect'),
  getStatus: () => ipcRenderer.invoke('projector:getStatus'),
  set: (upper: number, lower: number, value: number) =>
    ipcRenderer.invoke('projector:set', upper, lower, value),
  upload: (slot: number, channels: [number[], number[], number[]]) =>
    ipcRenderer.invoke('projector:upload', slot, channels),
  on: (event: 'status' | 'upload-progress', cb: (data: unknown) => void) => {
    const channel = event === 'upload-progress' ? 'projector:upload-progress' : `projector:${event}`;
    ipcRenderer.on(channel, (_e, data) => cb(data));
    return () => ipcRenderer.removeAllListeners(channel);
  },
});

contextBridge.exposeInMainWorld('canvasBridge', {
  detach: () => ipcRenderer.invoke('canvas:detach'),
  closeDetached: () => ipcRenderer.invoke('canvas:close-detached'),
  onDetachClosed: (cb: () => void) => {
    ipcRenderer.on('canvas:detach-closed', cb);
    return () => ipcRenderer.removeAllListeners('canvas:detach-closed');
  },
  sendCurveSync: (data: unknown) => ipcRenderer.send('canvas:curve-sync', data),
  onCurveSync: (cb: (data: unknown) => void) => {
    ipcRenderer.on('canvas:curve-sync', (_e, data) => cb(data));
    return () => ipcRenderer.removeAllListeners('canvas:curve-sync');
  },
  isDetached: () => new URLSearchParams(location.search).get('detached') === '1',
});
```

- [ ] **Step 2: Verify `window.projector` is accessible in renderer**

Open DevTools in the Electron window, run:
```javascript
window.projector
```
Expected: object with `connect`, `disconnect`, `getStatus`, `set`, `upload`, `on` functions.

- [ ] **Step 3: Commit**

```bash
git add electron/preload.ts
git commit -m "feat: preload contextBridge for projector and canvas IPC"
```

---

## Task 7: Tab navigation in App.jsx

Add the Editor | Projector tab bar without touching existing editor logic.

**Files:**
- Modify: `src/components/App.jsx`

- [ ] **Step 1: Read the top of `src/components/App.jsx` to find the root return statement**

Look for the outermost `<div>` that wraps the whole app.

- [ ] **Step 2: Add tab state and tab bar**

In `App.jsx`, near the top of the component function, add:

```jsx
const [activeTab, setActiveTab] = useState('editor'); // 'editor' | 'projector'
```

Wrap the existing root element in a tab shell. The existing JSX should become the content of the editor tab. Wrap like this:

```jsx
return (
  <div className="app-shell">
    <div className="tab-bar">
      <button
        className={`tab-btn${activeTab === 'editor' ? ' active' : ''}`}
        onClick={() => setActiveTab('editor')}
      >
        Editor
      </button>
      <button
        className={`tab-btn${activeTab === 'projector' ? ' active' : ''}`}
        onClick={() => setActiveTab('projector')}
      >
        Projector
      </button>
    </div>
    <div className="tab-content">
      <div style={{ display: activeTab === 'editor' ? 'contents' : 'none' }}>
        {/* EXISTING APP JSX goes here verbatim */}
      </div>
      {activeTab === 'projector' && (
        <div className="projector-tab-placeholder" style={{ padding: 32 }}>
          Projector tab (Task 13)
        </div>
      )}
    </div>
  </div>
);
```

- [ ] **Step 3: Add tab styles to `src/index.css`**

```css
.app-shell { display: flex; flex-direction: column; height: 100vh; }
.tab-bar {
  display: flex;
  gap: 2px;
  padding: 6px 12px 0;
  background: #f0efec;
  border-bottom: 1px solid #d8d6d0;
  flex-shrink: 0;
}
.tab-btn {
  padding: 6px 18px;
  border: none;
  border-radius: 6px 6px 0 0;
  background: #e0deda;
  color: #666;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.tab-btn.active {
  background: #fff;
  color: #1a1a1a;
  border-bottom: 2px solid #9a7b2e;
}
.tab-content { flex: 1; overflow: hidden; }
```

- [ ] **Step 4: Verify in dev server**

```bash
npm run dev
```

Click between Editor and Projector tabs. Editor tab shows the full existing editor. Projector tab shows the placeholder.

- [ ] **Step 5: Commit**

```bash
git add src/components/App.jsx src/index.css
git commit -m "feat: add Editor/Projector tab bar to App"
```

---

## Task 8: ResizableSplit component

**Files:**
- Create: `src/components/ResizableSplit.jsx`
- Modify: `src/components/App.jsx` — replace static canvas+sidebar layout with ResizableSplit

- [ ] **Step 1: Create `src/components/ResizableSplit.jsx`**

```jsx
import { useState, useRef, useCallback, useEffect } from 'react';

const MIN_LEFT = 400;
const MIN_RIGHT = 220;
const STORAGE_KEY = 'editorSplit';

export default function ResizableSplit({ left, right }) {
  const containerRef = useRef(null);
  const [leftWidth, setLeftWidth] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? parseInt(saved, 10) : null; // null = flex auto
  });
  const [isFocused, setIsFocused] = useState(false);
  const [savedWidth, setSavedWidth] = useState(null);
  const dragging = useRef(false);

  const onMouseDown = useCallback((e) => {
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startLeft = containerRef.current
      ? containerRef.current.querySelector('.split-left').offsetWidth
      : leftWidth ?? 600;

    const onMove = (me) => {
      if (!dragging.current) return;
      const container = containerRef.current;
      if (!container) return;
      const totalW = container.offsetWidth - 4; // 4px for divider
      const newLeft = Math.min(totalW - MIN_RIGHT, Math.max(MIN_LEFT, startLeft + me.clientX - startX));
      setLeftWidth(newLeft);
      localStorage.setItem(STORAGE_KEY, String(newLeft));
    };

    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [leftWidth]);

  // Focus toggle: F key
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'f' || e.key === 'F') {
        if (document.activeElement?.tagName === 'INPUT' ||
            document.activeElement?.tagName === 'TEXTAREA') return;
        toggleFocus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFocused, leftWidth]);

  const toggleFocus = useCallback(() => {
    if (!isFocused) {
      setSavedWidth(leftWidth);
      setIsFocused(true);
    } else {
      setLeftWidth(savedWidth);
      setIsFocused(false);
    }
  }, [isFocused, leftWidth, savedWidth]);

  return (
    <div className="resizable-split" ref={containerRef}
      style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
      <div className="split-left"
        style={{ width: isFocused ? '100%' : leftWidth ?? undefined, flex: leftWidth && !isFocused ? 'none' : 1, overflow: 'hidden' }}>
        {left({ focused: isFocused, onToggleFocus: toggleFocus })}
      </div>
      {!isFocused && (
        <>
          <div className="split-divider" onMouseDown={onMouseDown}
            style={{ width: 4, cursor: 'col-resize', background: '#d8d6d0', flexShrink: 0 }} />
          <div className="split-right"
            style={{ width: leftWidth ? undefined : undefined, flex: 1, minWidth: MIN_RIGHT, overflow: 'auto' }}>
            {right()}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire ResizableSplit into `App.jsx`**

In `App.jsx`, import `ResizableSplit` and wrap the canvas and sidebar sections. The `left` prop renders the canvas area (with a focus toggle button that calls `onToggleFocus`). The `right` prop renders the sidebar.

The existing canvas JSX becomes the `left` render prop. The existing sidebar JSX becomes the `right` render prop. Pass `{ focused, onToggleFocus }` to the canvas area so it can show/hide the focus toggle button.

- [ ] **Step 3: Add focus button to canvas toolbar**

In the canvas area JSX, add a button next to existing toolbar buttons:

```jsx
<button
  className="toolbar-btn"
  title="Focus canvas (F)"
  onClick={onToggleFocus}
  style={{ fontVariant: 'normal' }}
>
  {focused ? '✕' : '⛶'}
</button>
```

- [ ] **Step 4: Verify in dev server**

- Drag the divider — canvas and sidebar resize smoothly
- Press `F` key — sidebar collapses, canvas fills width
- Press `F` again — split restores
- Reload page — split position persists from localStorage

- [ ] **Step 5: Commit**

```bash
git add src/components/ResizableSplit.jsx src/components/App.jsx
git commit -m "feat: ResizableSplit with draggable divider and focus toggle"
```

---

## Task 9: Detached canvas second window

**Files:**
- Create: `src/components/DetachedCanvas.jsx`
- Modify: `src/components/App.jsx` — add detach button and IPC wiring

- [ ] **Step 1: Create `src/components/DetachedCanvas.jsx`**

This is the canvas-only renderer shown when `?detached=1` is in the URL. It receives curve data via IPC and renders the canvas.

```jsx
import { useEffect, useRef, useState } from 'react';
import { drawCanvas } from '../lib/canvas';
import { formatValue } from '../lib/format';

export default function DetachedCanvas() {
  const canvasRef = useRef(null);
  const [channels, setChannels] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState(null);

  useEffect(() => {
    if (!window.canvasBridge) return;
    const unsub = window.canvasBridge.onCurveSync((data) => {
      setChannels(data.channels);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !channels) return;
    drawCanvas(canvas, channels, 0, zoom, pan, [], -1, 'free', (v) => formatValue(v, '10bit'), null, null);
  }, [channels, zoom, pan]);

  if (!channels) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#999' }}>
      Waiting for curve data…
    </div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <canvas ref={canvasRef} style={{ flex: 1, width: '100%' }} />
    </div>
  );
}
```

- [ ] **Step 2: In `src/index.jsx`, detect detached mode**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './components/App';
import DetachedCanvas from './components/DetachedCanvas';
import './index.css';

const isDetached = new URLSearchParams(location.search).get('detached') === '1';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isDetached ? <DetachedCanvas /> : <App />}
  </React.StrictMode>
);
```

- [ ] **Step 3: Add detach button to canvas toolbar in `App.jsx`**

Add a "Detach" button next to the focus toggle button. In the click handler:

```jsx
const handleDetach = () => {
  window.canvasBridge?.detach();
};
```

When detach is active, send curve updates via `window.canvasBridge.sendCurveSync({ channels })` whenever the curve changes.

- [ ] **Step 4: Listen for detach-closed in App.jsx**

```jsx
useEffect(() => {
  if (!window.canvasBridge) return;
  return window.canvasBridge.onDetachClosed(() => {
    // detached window was closed — update UI state if needed
  });
}, []);
```

- [ ] **Step 5: Verify**

Click the Detach button. A second window opens showing the canvas. Edit a curve in the main window — the second window updates in real time. Close the second window.

- [ ] **Step 6: Commit**

```bash
git add src/components/DetachedCanvas.jsx src/index.jsx src/components/App.jsx
git commit -m "feat: detach canvas to second BrowserWindow with live sync"
```

---

## Task 10: useProjector hook

**Files:**
- Create: `src/hooks/useProjector.js`

- [ ] **Step 1: Create `src/hooks/useProjector.js`**

```javascript
import { useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_IP = 'projectorLastIp';

export function useProjector() {
  const [status, setStatus] = useState({ connected: false });
  const [uploadProgress, setUploadProgress] = useState(null); // null | 0-100
  const [error, setError] = useState(null);
  const [lastIp, setLastIp] = useState(() => localStorage.getItem(STORAGE_IP) || '');
  const pollRef = useRef(null);

  const connect = useCallback(async (ip, password) => {
    setError(null);
    const result = await window.projector.connect(ip, password);
    if (result === 'ok') {
      localStorage.setItem(STORAGE_IP, ip);
      setLastIp(ip);
      const s = await window.projector.getStatus();
      setStatus(s);
      startPolling();
    } else {
      setError(result);
    }
    return result;
  }, []);

  const disconnect = useCallback(async () => {
    stopPolling();
    await window.projector.disconnect();
    setStatus({ connected: false });
  }, []);

  const set = useCallback(async (upper, lower, value) => {
    const result = await window.projector.set(upper, lower, value);
    if (result === 'ok') {
      // Optimistically update status
      const s = await window.projector.getStatus();
      setStatus(s);
    }
    return result;
  }, []);

  const upload = useCallback(async (slot, channels) => {
    setUploadProgress(0);
    const unsub = window.projector.on('upload-progress', setUploadProgress);
    try {
      await window.projector.upload(slot, channels);
    } finally {
      unsub();
      setUploadProgress(null);
    }
  }, []);

  function startPolling() {
    stopPolling();
    pollRef.current = setInterval(async () => {
      const s = await window.projector.getStatus();
      if (!s.connected) stopPolling();
      setStatus(s);
    }, 5000);
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  useEffect(() => () => stopPolling(), []);

  return { status, uploadProgress, error, lastIp, connect, disconnect, set, upload };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useProjector.js
git commit -m "feat: useProjector hook with connect/disconnect/set/upload"
```

---

## Task 11: ConnectionPanel component

**Files:**
- Create: `src/components/projector/ConnectionPanel.jsx`

- [ ] **Step 1: Create `src/components/projector/ConnectionPanel.jsx`**

```jsx
import { useState } from 'react';

export default function ConnectionPanel({ onConnect, lastIp, error }) {
  const [ip, setIp] = useState(lastIp || '');
  const [password, setPassword] = useState('');
  const [connecting, setConnecting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setConnecting(true);
    await onConnect(ip.trim(), password || undefined);
    setConnecting(false);
  };

  return (
    <div className="connection-panel">
      <h3>Connect to Projector</h3>
      <form onSubmit={handleSubmit}>
        <label>
          IP Address
          <input
            type="text"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="192.168.0.233"
            required
            pattern="\d+\.\d+\.\d+\.\d+"
          />
        </label>
        <label>
          Password (if required)
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Leave blank if none"
          />
        </label>
        {error && (
          <div className="connection-error">
            {error === 'err_auth' ? 'Authentication failed — check password.' : 'Could not connect to projector.'}
          </div>
        )}
        <button type="submit" disabled={connecting}>
          {connecting ? 'Connecting…' : 'Connect'}
        </button>
      </form>
    </div>
  );
}
```

Add to `src/index.css`:
```css
.connection-panel { max-width: 360px; margin: 60px auto; padding: 32px; }
.connection-panel h3 { margin-bottom: 20px; }
.connection-panel label { display: flex; flex-direction: column; gap: 4px; margin-bottom: 16px; font-size: 13px; }
.connection-panel input { padding: 8px 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; }
.connection-error { color: #c43030; font-size: 13px; margin-bottom: 12px; }
```

- [ ] **Step 2: Commit**

```bash
git add src/components/projector/ConnectionPanel.jsx src/index.css
git commit -m "feat: ConnectionPanel component"
```

---

## Task 12: GammaSlots component

**Files:**
- Create: `src/components/projector/GammaSlots.jsx`

- [ ] **Step 1: Create `src/components/projector/GammaSlots.jsx`**

```jsx
const SLOTS = [
  { id: 7, label: 'Gamma 7' },
  { id: 8, label: 'Gamma 8' },
  { id: 9, label: 'Gamma 9' },
  { id: 10, label: 'Gamma 10' },
];

// gammaCorrection values from SDCP: 7=Gamma7, 8=Gamma8, 9=Gamma9, 10=Gamma10
function activeSlotFromValue(val) {
  if (val >= 7 && val <= 10) return val;
  return null;
}

export default function GammaSlots({ status, onUpload, onUseSlot, uploadProgress }) {
  const activeSlot = activeSlotFromValue(status.gammaCorrection);

  return (
    <div className="proj-section">
      <div className="proj-section-label">GAMMA SLOTS</div>
      {SLOTS.map((slot) => {
        const isActive = activeSlot === slot.id;
        const isUploading = uploadProgress !== null;
        return (
          <div key={slot.id} className={`gamma-slot-row${isActive ? ' active' : ''}`}>
            <span className="slot-label">
              {slot.label}{isActive ? ' ▶' : ''}
            </span>
            <button
              className="slot-btn upload"
              disabled={isUploading}
              onClick={() => onUpload(slot.id)}
            >
              {isUploading && isActive
                ? `${uploadProgress}%`
                : '⬆ Upload'}
            </button>
            <button
              className={`slot-btn use${isActive ? ' active' : ''}`}
              onClick={() => onUseSlot(slot.id)}
            >
              {isActive ? 'Active' : '▶ Use'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
```

Add to `src/index.css`:
```css
.gamma-slot-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid #eee; }
.gamma-slot-row.active { background: rgba(32,96,176,0.08); border-radius: 4px; padding: 6px 8px; }
.slot-label { flex: 1; font-size: 13px; }
.slot-btn { padding: 3px 10px; border-radius: 4px; border: none; cursor: pointer; font-size: 12px; }
.slot-btn.upload { background: rgba(32,96,176,0.15); color: #2060b0; }
.slot-btn.use { background: #eee; color: #555; }
.slot-btn.use.active { background: #9a7b2e; color: white; }
```

- [ ] **Step 2: Commit**

```bash
git add src/components/projector/GammaSlots.jsx src/index.css
git commit -m "feat: GammaSlots component with upload and use buttons"
```

---

## Task 13: PictureSettings component

**Files:**
- Create: `src/components/projector/PictureSettings.jsx`

- [ ] **Step 1: Create `src/components/projector/PictureSettings.jsx`**

```jsx
// SDCP item codes (upper=0x00 for all standard settings)
const ITEMS = {
  brightness:       [0x00, 0x10],
  contrast:         [0x00, 0x11],
  colorTemp:        [0x00, 0x17],
  colorSpace:       [0x00, 0x3b],
  motionflow:       [0x00, 0x59],
  hdr:              [0x00, 0x7c],
  advancedIris:     [0x00, 0x1d],
  nr:               [0x00, 0x25],
  inputLagReduction:[0x00, 0x99],
};

const COLOR_TEMP_OPTS = [
  { value: 0, label: 'D93' }, { value: 1, label: 'D75' }, { value: 2, label: 'D65' },
  { value: 3, label: 'Custom1' }, { value: 4, label: 'Custom2' }, { value: 5, label: 'Custom3' },
  { value: 6, label: 'Custom4' }, { value: 7, label: 'Custom5' }, { value: 9, label: 'D55' },
];

const COLOR_SPACE_OPTS = [
  { value: 0, label: 'BT.709' }, { value: 3, label: 'CS1' }, { value: 4, label: 'CS2' },
  { value: 5, label: 'CS3' }, { value: 6, label: 'Custom' }, { value: 8, label: 'BT.2020' },
];

const MOTIONFLOW_OPTS = [
  { value: 0, label: 'Off' }, { value: 1, label: 'Smooth High' }, { value: 2, label: 'Smooth Low' },
  { value: 3, label: 'Impulse' }, { value: 4, label: 'Combination' }, { value: 5, label: 'True Cinema' },
];

const HDR_OPTS = [
  { value: 0, label: 'Off' }, { value: 1, label: 'On' }, { value: 2, label: 'Auto' },
];

const IRIS_OPTS = [
  { value: 0, label: 'Off' }, { value: 2, label: 'Full' }, { value: 3, label: 'Limited' },
];

const NR_OPTS = [
  { value: 0, label: 'Off' }, { value: 1, label: 'Low' }, { value: 2, label: 'Medium' },
  { value: 3, label: 'High' }, { value: 4, label: 'Auto' },
];

const CALIB_OPTS = [
  { value: 0, label: 'Cinema Film 1' }, { value: 1, label: 'Cinema Film 2' },
  { value: 2, label: 'Reference' }, { value: 3, label: 'TV' }, { value: 4, label: 'Photo' },
  { value: 5, label: 'Game' }, { value: 6, label: 'Bright Cinema' }, { value: 7, label: 'Bright TV' },
  { value: 8, label: 'User' },
];

// Color correction: 6 axes × 3 params. Item codes 00h 87h-98h (see spec table).
const CC_AXES = ['Red', 'Yellow', 'Green', 'Cyan', 'Blue', 'Magenta'];
const CC_PARAMS = ['Hue', 'Sat', 'Bri'];
// Item codes start at 0x87 for Red Hue, sequential through 0x98 for Magenta Brightness
function ccItemCode(axisIndex, paramIndex) {
  return 0x87 + axisIndex * 3 + paramIndex;
}
function ccRange(paramIndex) {
  // Hue/Sat: -50 to +50 (FFCEh-0032h), Bri: -30 to +30 (FFE2h-001Eh)
  return paramIndex < 2 ? { min: -50, max: 50 } : { min: -30, max: 30 };
}
function sdcpToSigned(val) {
  // Convert uint16 SDCP value to signed int16
  return val > 0x7fff ? val - 0x10000 : val;
}
function signedToSdcp(val) {
  return val < 0 ? val + 0x10000 : val;
}

export default function PictureSettings({ status, onSet }) {
  const isCustomColorSpace = status.colorSpace === 6;

  const Dropdown = ({ label, value, opts, upper, lower }) => (
    <div className="proj-row">
      <span className="proj-label">{label}</span>
      <select
        value={value ?? ''}
        onChange={(e) => onSet(upper, lower, parseInt(e.target.value))}
        className="proj-select"
      >
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  const Slider = ({ label, value, min, max, upper, lower }) => (
    <div className="proj-slider-row">
      <div className="proj-slider-header">
        <span className="proj-label">{label}</span>
        <span className="proj-value">{value ?? '–'}</span>
      </div>
      <input
        type="range" min={min} max={max}
        value={value ?? min}
        onChange={(e) => onSet(upper, lower, parseInt(e.target.value))}
        className="proj-slider"
      />
    </div>
  );

  return (
    <div className="proj-picture-settings">
      <div className="proj-section-label">PICTURE</div>
      <Slider label="Brightness" value={status.brightness} min={0} max={100} upper={0x00} lower={0x10} />
      <Slider label="Contrast"   value={status.contrast}   min={0} max={100} upper={0x00} lower={0x11} />
      <Dropdown label="Color Temp"  value={status.colorTemp}  opts={COLOR_TEMP_OPTS}  upper={0x00} lower={0x17} />
      <Dropdown label="Color Space" value={status.colorSpace} opts={COLOR_SPACE_OPTS} upper={0x00} lower={0x3b} />
      {isCustomColorSpace && (
        <>
          <Slider label="Cyan–Red"      value={status.csCustomCyanRed}    min={-50} max={50} upper={0x00} lower={0x76} />
          <Slider label="Magenta–Green" value={status.csCustomMagGreen}   min={-50} max={50} upper={0x00} lower={0x77} />
        </>
      )}
      <Dropdown label="Motionflow"   value={status.motionflow}       opts={MOTIONFLOW_OPTS} upper={0x00} lower={0x59} />
      <Dropdown label="HDR"          value={status.hdr}              opts={HDR_OPTS}        upper={0x00} lower={0x7c} />
      <Dropdown label="Advanced Iris" value={status.advancedIris}   opts={IRIS_OPTS}       upper={0x00} lower={0x1d} />
      <Dropdown label="NR"           value={status.nr}               opts={NR_OPTS}         upper={0x00} lower={0x25} />

      <div className="proj-section-label" style={{ marginTop: 16 }}>COLOR CORRECTION</div>
      <div className="cc-grid">
        <div className="cc-header-row">
          <span></span>
          {CC_PARAMS.map(p => <span key={p} className="cc-col-label">{p}</span>)}
        </div>
        {CC_AXES.map((axis, ai) => (
          <div key={axis} className="cc-row">
            <span className="cc-axis-label">{axis}</span>
            {CC_PARAMS.map((_, pi) => {
              const { min, max } = ccRange(pi);
              const rawVal = status[`cc_${axis.toLowerCase()}_${CC_PARAMS[pi].toLowerCase()}`] ?? 0;
              const signedVal = sdcpToSigned(rawVal);
              return (
                <input
                  key={pi}
                  type="range"
                  min={min} max={max}
                  value={signedVal}
                  onChange={(e) => onSet(0x00, ccItemCode(ai, pi), signedToSdcp(parseInt(e.target.value)))}
                  className="cc-slider"
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
```

Add to `src/index.css`:
```css
.proj-picture-settings { padding: 12px; }
.proj-section-label { font-size: 11px; letter-spacing: 1px; color: #999; margin-bottom: 8px; font-weight: 600; }
.proj-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.proj-label { font-size: 13px; color: #444; }
.proj-select { font-size: 12px; padding: 2px 6px; border: 1px solid #ccc; border-radius: 4px; }
.proj-slider-row { margin-bottom: 10px; }
.proj-slider-header { display: flex; justify-content: space-between; margin-bottom: 2px; }
.proj-value { font-size: 12px; color: #666; font-family: var(--font-mono, monospace); }
.proj-slider { width: 100%; }
.cc-grid { display: grid; grid-template-columns: 60px repeat(3, 1fr); gap: 4px; }
.cc-header-row, .cc-row { display: contents; }
.cc-col-label { font-size: 10px; color: #999; text-align: center; }
.cc-axis-label { font-size: 12px; color: #444; align-self: center; }
.cc-slider { width: 100%; }
```

- [ ] **Step 2: Commit**

```bash
git add src/components/projector/PictureSettings.jsx src/index.css
git commit -m "feat: PictureSettings component with sliders, dropdowns, color correction grid"
```

---

## Task 14: ProjectorStatusBar component

**Files:**
- Create: `src/components/projector/ProjectorStatusBar.jsx`

- [ ] **Step 1: Create `src/components/projector/ProjectorStatusBar.jsx`**

```jsx
const GAMMA_LABELS = { 7: 'Gamma 7', 8: 'Gamma 8', 9: 'Gamma 9', 10: 'Gamma 10' };

function gammaLabel(val) {
  if (val >= 7 && val <= 10) return GAMMA_LABELS[val];
  if (val === 0) return 'Off';
  return `${val}`;
}

export default function ProjectorStatusBar({ status, onDisconnect, onUpload, selectedUploadSlot }) {
  if (!status.connected) return null;
  return (
    <div className="projector-status-bar">
      <span className="status-dot connected">●</span>
      <span className="status-info">VPL-VW385ES</span>
      <span className="status-chip">
        {status.power === 1 ? '⚡ ON' : '◻ STBY'}
      </span>
      <span className="status-info dimmed">Gamma: {gammaLabel(status.gammaCorrection)}</span>
      <span style={{ flex: 1 }} />
      <button className="upload-main-btn" onClick={() => onUpload(selectedUploadSlot)}>
        ⬆ Upload to {GAMMA_LABELS[selectedUploadSlot] ?? 'Slot'}
      </button>
      <button className="disconnect-btn" onClick={onDisconnect}>Disconnect</button>
    </div>
  );
}
```

Add to `src/index.css`:
```css
.projector-status-bar {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 16px;
  background: #1a1a2e;
  color: #8090b0;
  font-size: 13px;
  flex-shrink: 0;
}
.status-dot.connected { color: #22c55e; }
.status-dot.disconnected { color: #666; }
.status-info { color: #aaa; }
.status-info.dimmed { color: #666; }
.status-chip { background: #22c55e; color: #000; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.upload-main-btn { background: #9a7b2e; color: white; border: none; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.disconnect-btn { background: rgba(196,48,48,0.2); color: #e08080; border: 1px solid #c43030; padding: 4px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; }
```

- [ ] **Step 2: Commit**

```bash
git add src/components/projector/ProjectorStatusBar.jsx src/index.css
git commit -m "feat: ProjectorStatusBar component"
```

---

## Task 15: ProjectorTab — device controls (Power/Input/Calib)

**Files:**
- Create: `src/components/projector/ProjectorTab.jsx`

- [ ] **Step 1: Create `src/components/projector/ProjectorTab.jsx`**

```jsx
import { useState } from 'react';
import ConnectionPanel from './ConnectionPanel';
import ProjectorStatusBar from './ProjectorStatusBar';
import GammaSlots from './GammaSlots';
import PictureSettings from './PictureSettings';
import { useProjector } from '../../hooks/useProjector';

const CALIB_OPTS = [
  { value: 0, label: 'Cinema Film 1' }, { value: 1, label: 'Cinema Film 2' },
  { value: 2, label: 'Reference' }, { value: 3, label: 'TV' }, { value: 4, label: 'Photo' },
  { value: 5, label: 'Game' }, { value: 6, label: 'Bright Cinema' }, { value: 7, label: 'Bright TV' },
  { value: 8, label: 'User' },
];

export default function ProjectorTab({ currentChannels }) {
  const { status, uploadProgress, error, lastIp, connect, disconnect, set, upload } = useProjector();
  const [selectedSlot, setSelectedSlot] = useState(10);

  const handleUpload = (slot) => {
    if (!currentChannels) return;
    setSelectedSlot(slot);
    upload(slot, currentChannels);
  };

  const handleUseSlot = (slot) => {
    // Gamma Correction item: 00h 22h, values 0007h-000Ah for G7-G10
    set(0x00, 0x22, slot);
  };

  if (!status.connected) {
    return <ConnectionPanel onConnect={connect} lastIp={lastIp} error={error} />;
  }

  return (
    <div className="projector-tab">
      <ProjectorStatusBar
        status={status}
        onDisconnect={disconnect}
        onUpload={handleUpload}
        selectedUploadSlot={selectedSlot}
      />
      <div className="projector-columns">
        {/* Left column */}
        <div className="projector-col-left">
          <div className="proj-section">
            <div className="proj-section-label">POWER</div>
            <div className="proj-btn-row">
              <button
                className={`proj-toggle-btn${status.power === 1 ? ' active' : ''}`}
                onClick={() => set(0x01, 0x30, 0x0001)}
              >ON</button>
              <button
                className={`proj-toggle-btn${status.power !== 1 ? ' active' : ''}`}
                onClick={() => set(0x01, 0x30, 0x0000)}
              >Standby</button>
            </div>
          </div>
          <div className="proj-section">
            <div className="proj-section-label">CALIB PRESET</div>
            <select
              className="proj-select-full"
              value={status.calibPreset ?? 0}
              onChange={(e) => set(0x00, 0x02, parseInt(e.target.value))}
            >
              {CALIB_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <GammaSlots
            status={status}
            onUpload={handleUpload}
            onUseSlot={handleUseSlot}
            uploadProgress={uploadProgress}
          />
        </div>
        {/* Right column */}
        <div className="projector-col-right">
          <PictureSettings status={status} onSet={set} />
        </div>
      </div>
    </div>
  );
}
```

Add to `src/index.css`:
```css
.projector-tab { display: flex; flex-direction: column; height: 100%; background: #f7f6f3; }
.projector-columns { display: grid; grid-template-columns: 280px 1fr; gap: 0; flex: 1; overflow: auto; }
.projector-col-left { border-right: 1px solid #e0deda; padding: 16px; overflow-y: auto; }
.projector-col-right { padding: 16px; overflow-y: auto; }
.proj-section { margin-bottom: 20px; }
.proj-btn-row { display: flex; gap: 6px; }
.proj-toggle-btn { flex: 1; padding: 6px; border: 1px solid #ccc; border-radius: 4px; background: #f0efec; color: #555; cursor: pointer; font-size: 13px; }
.proj-toggle-btn.active { background: #2060b0; color: white; border-color: #2060b0; }
.proj-select-full { width: 100%; padding: 6px 8px; font-size: 13px; border: 1px solid #ccc; border-radius: 4px; }
```

- [ ] **Step 2: Wire ProjectorTab into App.jsx**

In `App.jsx`, import `ProjectorTab` and replace the projector-tab-placeholder:

```jsx
import ProjectorTab from './projector/ProjectorTab';

// In the projector tab render:
{activeTab === 'projector' && (
  <ProjectorTab currentChannels={channels} />
)}
```

Pass the current `channels` state from App.jsx into `ProjectorTab`.

- [ ] **Step 3: Verify in dev server**

Click Projector tab → ConnectionPanel shown. Fill in a fake IP and click Connect — it will fail gracefully (no real projector). With a real projector: enter actual IP, connect, verify status bar appears, sliders show.

- [ ] **Step 4: Commit**

```bash
git add src/components/projector/ProjectorTab.jsx src/index.css src/components/App.jsx
git commit -m "feat: complete ProjectorTab with connection, gamma slots, picture settings"
```

---

## Task 16: electron-builder packaging config

**Files:**
- Modify: `package.json` — add `build` section

- [ ] **Step 1: Add electron-builder config to `package.json`**

Add a top-level `"build"` key:

```json
"build": {
  "appId": "com.sonyldteditor.app",
  "productName": "Sony LDT Editor",
  "directories": {
    "buildResources": "resources"
  },
  "files": [
    "out/**/*"
  ],
  "mac": {
    "target": [{ "target": "dmg", "arch": ["universal"] }],
    "category": "public.app-category.video",
    "icon": "resources/icon.icns"
  },
  "win": {
    "target": [
      { "target": "nsis", "arch": ["x64"] },
      { "target": "zip",  "arch": ["x64"] }
    ],
    "icon": "resources/icon.ico"
  },
  "nsis": {
    "installerIcon": "resources/icon.ico",
    "uninstallerIcon": "resources/icon.ico",
    "shortcutName": "Sony LDT Editor",
    "oneClick": false,
    "allowToChangeInstallationDirectory": true
  },
  "publish": {
    "provider": "github",
    "owner": "OWNER",
    "repo": "sony-ldt-editor"
  }
}
```

- [ ] **Step 2: Create placeholder icon files**

```bash
mkdir -p resources
# Add icon.icns (Mac) and icon.ico (Win) — use any placeholder icon for now
# These must exist for the build to succeed
touch resources/icon.icns resources/icon.ico
```

For real icons before distribution: generate from a 1024×1024 PNG using `electron-icon-builder` or Sketch.

- [ ] **Step 3: Test production build (current OS only)**

```bash
npm run build
```

Expected: `out/` directory contains main/preload/renderer subdirectories. No TypeScript errors. Then:

```bash
npm run build:mac  # macOS only
```

Expected: `dist/` contains a `.dmg` file. Open it — app launches.

- [ ] **Step 4: Commit**

```bash
git add package.json resources/
git commit -m "feat: electron-builder packaging config for Mac and Windows"
```

---

## Task 17: Auto-update wiring

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Add electron-updater to `electron/main.ts`**

At the top of `electron/main.ts`, add:

```typescript
import { autoUpdater } from 'electron-updater';
```

After `createWindow()` call in `app.whenReady()`:

```typescript
app.whenReady().then(() => {
  createWindow();
  // Check for updates on launch (only in production)
  if (!is.dev) {
    autoUpdater.checkForUpdatesAndNotify();
    autoUpdater.on('update-available', () => {
      mainWindow?.webContents.send('update:available');
    });
    autoUpdater.on('update-downloaded', () => {
      mainWindow?.webContents.send('update:ready');
    });
  }
});
```

In `electron/preload.ts`, add to the exposed bridge:

```typescript
contextBridge.exposeInMainWorld('updater', {
  onUpdateAvailable: (cb: () => void) => {
    ipcRenderer.on('update:available', cb);
    return () => ipcRenderer.removeAllListeners('update:available');
  },
  onUpdateReady: (cb: () => void) => {
    ipcRenderer.on('update:ready', cb);
    return () => ipcRenderer.removeAllListeners('update:ready');
  },
  installUpdate: () => ipcRenderer.send('update:install'),
});
```

In `electron/main.ts`:
```typescript
ipcMain.on('update:install', () => autoUpdater.quitAndInstall());
```

In `App.jsx`, show a banner when `window.updater` fires:
```jsx
useEffect(() => {
  if (!window.updater) return;
  const unsub = window.updater.onUpdateReady(() => setUpdateReady(true));
  return unsub;
}, []);

// In JSX, near the top:
{updateReady && (
  <div className="update-banner" onClick={() => window.updater.installUpdate()}>
    Update ready — click to restart and install
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add electron/main.ts electron/preload.ts src/components/App.jsx
git commit -m "feat: auto-update via electron-updater with user-triggered install"
```

---

## Task 18: End-to-end verification

These steps require a real VPL-VW385ES projector on the local network.

- [ ] **Verify connection + auth**
  - Run app, go to Projector tab
  - Enter projector IP (e.g. 192.168.0.233), click Connect
  - Expected: status bar appears, green dot, model name visible
  - If projector has no password: `NOKEY` flow
  - If projector has password: SHA256 challenge flow

- [ ] **Verify getStatus populates correctly**
  - Check current gamma slot shown matches projector OSD
  - Check brightness/contrast values match

- [ ] **Verify picture settings set()**
  - Move the Brightness slider
  - Expected: projector OSD shows updated value within 1–2 seconds

- [ ] **Verify LDT upload**
  - In Editor tab, load or generate a custom PQ curve
  - Switch to Projector tab, click "⬆ Upload to Gamma 10"
  - Expected: progress bar 0→100%, projector switches to Gamma10 with custom curve
  - Verify: projector OSD → Gamma Correction → Gamma10 shows the curve (compare with ImageDirector result)

- [ ] **Verify buildSetPacket format (if projector rejects SET commands)**
  - Use Wireshark to capture a SET command from our app
  - Compare to a SET command captured from ImageDirector
  - If outer structure matches but projector returns NG, the inner TLV encoding of `buildSetPacket` needs adjustment
  - The LDT upload packets are verified — those are the critical path

- [ ] **Verify detached canvas**
  - Click Detach button
  - Second window opens with canvas only
  - Edit curve in main window — detached window updates in real time

- [ ] **Verify ResizableSplit**
  - Drag divider — smooth resize
  - Press F — sidebar collapses
  - Press F — sidebar restores to saved position
  - Reload — position persists

- [ ] **Final commit**

```bash
git add .
git commit -m "feat: Phase 1+2 complete — Electron app with SDCP projector control"
```

---

## Implementation Notes

**`buildSetPacket` verification:** The `buildSetPacket` function uses an inferred inner structure (`00 00 80 06 00 04 [item] [value]`). This should be tested against the live projector during Task 18. If the projector returns an error, compare a captured SET packet from ImageDirector against what we send. The LDT upload packets (`buildLdtPacket`) and activation packets (`buildActivateSlotPacket`) are verified against actual Wireshark captures.

**`getStatus` response parsing:** The `get()` method parses the value from the last 2 bytes of response inner data. This may need adjustment once tested against a live projector — check with Wireshark if values come back wrong.

**Color correction in status:** The `ProjectorStatus` interface in `sdcp.ts` needs to be extended with all 18 color correction fields and the 2 color space custom fields before `getStatus()` queries them. Add those GET calls to `getStatus()` in Task 4 once the basic flow is verified.

**TypeScript config:** Add `tsconfig.json` in the project root if electron-vite requires it:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": false,
    "esModuleInterop": true
  },
  "include": ["electron/**/*"]
}
```
