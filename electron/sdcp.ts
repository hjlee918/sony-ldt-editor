import { Socket } from 'net';
import { EventEmitter } from 'events';

const FIXED_PREFIX = Buffer.from([
  0xa5, 0x01, 0x00, 0x01, 0x00, 0x01, 0x05, 0x00, 0x01, 0x00, 0x01,
]);

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

interface LdtReadOptions {
  slot: 7 | 8 | 9 | 10;
  channel: 0 | 1 | 2;
  startIndex: 0 | 16 | 32 | 48;
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

/** Request 16 values from a gamma slot (mirror of buildLdtPacket for reads). */
export function buildLdtReadPacket(opts: LdtReadOptions): Buffer {
  const { slot, channel, startIndex } = opts;
  const inner = Buffer.concat([
    FIXED_PREFIX,
    Buffer.from([
      0x8c, 0x01, 0x80, 0x07, 0x00, 0x05,
      slot, channel,
      (startIndex >> 8) & 0xff, startIndex & 0xff,
      0x10, // count = 16
    ]),
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
  // SET command is 00 00 (not 00 03 — that's the SET *response* code).
  // Payload: [itemUpper, itemLower, 0x02, valueHigh, valueLow] (5 bytes, header: 80 07 00 05)
  const inner = Buffer.concat([
    FIXED_PREFIX,
    Buffer.from([
      0x00, 0x00, 0x80, 0x07, 0x00, 0x05,
      itemUpper, itemLower,
      0x02,
      (value >> 8) & 0xff, value & 0xff,
    ]),
  ]);
  return buildFrame(inner);
}

export type ErrorCode = 'err_auth' | 'err_connect' | 'err_cmd' | 'err_val' | 'err_inactive' | 'err_timeout';

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
  // ── Setup / Installation ──
  testPattern: number;
  altitudeMode: number; remoteStart: number; networkMgmt: number; powerSaving: number;
  lensControl: number; irFront: number; irRear: number;
  imageFlip: number;
  // ── Power / Input ──
  inputSelect: number;
  // ── Read-only info ──
  lampTimer?: number;
  ip?: string;
}

export class SdcpConnection extends EventEmitter {
  private socket: Socket | null = null;
  private responseBuffer = Buffer.alloc(0);
  private pendingResponses: Array<{ resolve: (buf: Buffer) => void; reject: (err: Error) => void }> = [];

  async connect(ip: string, _password?: string): Promise<'ok' | ErrorCode> {
    // Wireshark capture of VW385ES shows no auth handshake — the projector
    // accepts SDCP commands immediately after TCP connect with no challenge.
    return new Promise((resolve) => {
      const sock = new Socket();

      sock.on('connect', () => {
        this.socket = sock;
        sock.on('data', (d: Buffer) => this.onData(d));
        sock.on('error', (err) => this.onSocketError(err));
        resolve('ok');
      });

      sock.on('error', () => resolve('err_connect'));

      sock.connect(53484, ip);
    });
  }

  async disconnect(): Promise<void> {
    this.socket?.destroy();
    this.socket = null;
    this.responseBuffer = Buffer.alloc(0);
    // Reject any in-flight requests
    const pending = this.pendingResponses.splice(0);
    for (const p of pending) p.reject(new Error('err_connect'));
  }

  /** Send a pre-built frame and wait for the corresponding response. 60s timeout. */
  async sendFrame(frame: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.destroyed) {
        return reject(new Error('err_connect'));
      }
      const timer = setTimeout(() => {
        const idx = this.pendingResponses.findIndex((p) => p.reject === reject);
        if (idx !== -1) this.pendingResponses.splice(idx, 1);
        reject(new Error('err_timeout'));
      }, 1_500);
      this.pendingResponses.push({
        resolve: (buf) => { clearTimeout(timer); resolve(buf); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });
      this.socket.write(frame);
    });
  }

  private onSocketError(_err: Error): void {
    // Reject all pending requests when the socket drops
    const pending = this.pendingResponses.splice(0);
    for (const p of pending) p.reject(new Error('err_connect'));
    this.socket = null;
  }

  private onData(data: Buffer): void {
    this.responseBuffer = Buffer.concat([this.responseBuffer, data]);
    while (this.responseBuffer.length >= 12) {
      if (this.responseBuffer[0] !== 0x02 || this.responseBuffer[1] !== 0x0a) {
        this.responseBuffer = this.responseBuffer.slice(1);
        continue;
      }
      const len = (this.responseBuffer[8] << 8) | this.responseBuffer[9];
      // Total frame = 10-byte header + len bytes (which includes checksum + ETX)
      const frameLen = 10 + len;
      if (this.responseBuffer.length < frameLen) break;
      const frame = this.responseBuffer.slice(0, frameLen);
      this.responseBuffer = this.responseBuffer.slice(frameLen);
      // Dequeue the oldest pending response (FIFO)
      const pending = this.pendingResponses.shift();
      if (pending) pending.resolve(frame);
    }
  }

  isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  async set(itemUpper: number, itemLower: number, value: number): Promise<'ok' | ErrorCode> {
    try {
      const frame = buildSetPacket(itemUpper, itemLower, value);
      await this.sendFrame(frame);
      return 'ok';
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'err_cmd';
      return (msg as ErrorCode) || 'err_cmd';
    }
  }

  async get(itemUpper: number, itemLower: number): Promise<number | null> {
    try {
      const frame = buildGetPacket(itemUpper, itemLower);
      const resp = await this.sendFrame(frame);
      // Response inner data starts at byte 10. Last 2 bytes before checksum+ETX are the value.
      // frame: [10-byte header][inner_data][checksum][5a]
      // value is at resp[resp.length - 4] and resp[resp.length - 3] (before checksum and ETX)
      if (resp.length < 14) return null;
      return resp.readUInt16BE(resp.length - 4);
    } catch {
      return null;
    }
  }

  async getStatus(): Promise<ProjectorStatus> {
    // Sequential GETs: sending all at once caused queue desync when the projector
    // didn't respond to some items (e.g. set-only items), mismatching responses to promises.
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
    const hdr              = await g(0x00, 0x7c, 3);   // confirmed item code; 3=Auto default (0=Off,1=HDR10,2=HLG)
    const inputLagReduction = await g(0x00, 0x99, 0);
    const clearWhite       = await g(0x00, 0x28, 0);   // best-guess
    const xvColor          = await g(0x00, 0x29, 0);   // best-guess
    // ── Color Space ──
    const colorSpace       = await g(0x00, 0x3b, 0);
    const csCustomCyanRed  = colorSpace === 6 ? await g(0x00, 0x76, 0) : 0;
    const csCustomMagGreen = colorSpace === 6 ? await g(0x00, 0x77, 0) : 0;
    // ── Color Temp Custom Gain/Bias (only when Custom 1–5 selected) ──
    const isCustomCT = colorTemp >= 3 && colorTemp <= 7;
    const ctGainR = isCustomCT ? await g(0x00, 0x30, 128) : 128;
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
    const aspect      = await g(0x00, 0x3c, 0);
    const blankLeft   = await g(0x00, 0x78, 0);
    const blankRight  = await g(0x00, 0x79, 0);
    const blankTop    = await g(0x00, 0x7a, 0);
    const blankBottom = await g(0x00, 0x7b, 0);
    // ── Function ──
    const dynamicRange = await g(0x00, 0x60, 0);
    const hdmiFormat   = await g(0x00, 0x61, 0);
    const d3Display    = await g(0x00, 0x65, 0);
    const d3Format     = await g(0x00, 0x66, 0);
    const d3Brightness = await g(0x00, 0x67, 0);
    // ── Setup / Installation ──
    const testPattern  = await g(0x00, 0x63, 0);
    const altitudeMode = await g(0x00, 0x64, 0);
    const imageFlip    = await g(0x00, 0x62, 0);
    const remoteStart  = await g(0x00, 0x68, 0);
    const networkMgmt  = await g(0x00, 0x69, 0);
    const powerSaving  = await g(0x00, 0x6a, 0);
    const lensControl  = await g(0x00, 0x6b, 1);
    const irFront      = await g(0x00, 0x6c, 1);
    const irRear       = await g(0x00, 0x6d, 1);
    // ── Power / Input ──
    const inputSelect  = await g(0x00, 0x03, 0);

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
      testPattern, altitudeMode, imageFlip,
      remoteStart, networkMgmt, powerSaving, lensControl, irFront, irRear,
      inputSelect,
    };
  }

  async activateSlot(slot: 7 | 8 | 9 | 10): Promise<'ok' | ErrorCode> {
    try {
      const pkt = buildActivateSlotPacket(slot);
      await this.sendFrame(pkt);
      return 'ok';
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'err_cmd';
      return (msg as ErrorCode) || 'err_cmd';
    }
  }

  /**
   * Download a gamma slot from the projector.
   * Reads 12 chunks (3 channels × 4 chunks of 16 values) via the 8c 01 command
   * and reconstructs a 1024-point curve per channel via linear interpolation.
   */
  async download(slot: 7 | 8 | 9 | 10): Promise<[number[], number[], number[]]> {
    const channelPoints: number[][] = [[], [], []];

    for (let ch = 0; ch < 3; ch++) {
      for (let chunk = 0; chunk < 4; chunk++) {
        const startIndex = (chunk * 16) as 0 | 16 | 32 | 48;
        const pkt = buildLdtReadPacket({ slot, channel: ch as 0 | 1 | 2, startIndex });
        const resp = await this.sendFrame(pkt);

        // Response layout (frame offsets):
        //   [0-9]  : SDCP header
        //   [10-20]: FIXED_PREFIX (11 bytes)
        //   [21-22]: cmd 8c 02
        //   [23-24]: 80 29
        //   [25-26]: 00 27 (length)
        //   [27-28]: status
        //   [29]   : slot
        //   [30]   : channel
        //   [31-32]: startIndex
        //   [33]   : count
        //   [34 + i*2]: value i (uint16 BE), i = 0..count-1
        const count = resp[33];
        for (let i = 0; i < count; i++) {
          channelPoints[ch].push(resp.readUInt16BE(34 + i * 2));
        }
      }
    }

    // Reconstruct 1024-point curves from 64 control points (at positions 0,16,32,…,1008)
    // via linear interpolation. Positions 1009-1023 hold the last control point value.
    const curves = channelPoints.map((points) => {
      const curve = new Array<number>(1024);
      for (let x = 0; x < 1024; x++) {
        const lo = Math.min(Math.floor(x / 16), 63);
        const hi = Math.min(lo + 1, 63);
        const t = (x - lo * 16) / 16;
        curve[x] = Math.round(
          Math.min(1023, Math.max(0, points[lo] + t * (points[hi] - points[lo]))),
        );
      }
      return curve;
    });

    return curves as [number[], number[], number[]];
  }

  async upload(
    slot: 7 | 8 | 9 | 10,
    channels: [number[], number[], number[]],
    onProgress?: (pct: number) => void,
  ): Promise<void> {
    const CHANNEL_COUNT = 3;
    const CHUNKS_PER_CHANNEL = 4;
    const total = CHANNEL_COUNT * CHUNKS_PER_CHANNEL + 1; // 12 data packets + 1 activation
    let step = 0;

    // The projector's LDT table is 64 entries per channel (not 1024).
    // We map our 1024-sample curve to 64 equidistant control points
    // by stepping every 16th sample: curve[i * 16] for i = 0..63,
    // sent as four 16-entry packets with startIndex 0/16/32/48.
    for (let ch = 0; ch < CHANNEL_COUNT; ch++) {
      const curve = channels[ch];
      for (let chunk = 0; chunk < CHUNKS_PER_CHANNEL; chunk++) {
        const startIndex = (chunk * 16) as 0 | 16 | 32 | 48;
        // Sample every 16th entry from the 1024-entry curve (64 control points total per channel)
        const values = Array.from({ length: 16 }, (_, i) =>
          Math.round(Math.min(1023, Math.max(0, curve[(startIndex + i) * 16] ?? 0))),
        );
        const pkt = buildLdtPacket({
          slot,
          channel: ch as 0 | 1 | 2,
          startIndex,
          values,
        });
        await this.sendFrame(pkt);
        step++;
        onProgress?.(Math.round((step / total) * 100));
      }
    }

    // Activate the slot on the projector
    const activationPkt = buildActivateSlotPacket(slot);
    await this.sendFrame(activationPkt);
    step++;
    onProgress?.(100);
  }
}
