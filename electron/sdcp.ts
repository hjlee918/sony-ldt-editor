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

    const gammaCorrection = await g(0x00, 0x22, 0);
    const brightness      = await g(0x00, 0x10, 50);
    const contrast        = await g(0x00, 0x11, 50);
    const colorTemp       = await g(0x00, 0x17, 2);
    const colorSpace      = await g(0x00, 0x3b, 0);
    const calibPreset     = await g(0x00, 0x02, 0);
    const motionflow      = await g(0x00, 0x59, 0);
    const hdr             = await g(0x00, 0x7c, 2);
    const advancedIris    = await g(0x00, 0x1d, 0);
    const nr              = await g(0x00, 0x25, 0);
    // Only poll custom CS sliders when in Custom color space mode (value 6)
    const csCustomCyanRed  = colorSpace === 6 ? await g(0x00, 0x76, 0) : 0;
    const csCustomMagGreen = colorSpace === 6 ? await g(0x00, 0x77, 0) : 0;

    return {
      connected: true,
      gammaCorrection,
      brightness,
      contrast,
      colorTemp,
      colorSpace,
      calibPreset,
      motionflow,
      hdr,
      advancedIris,
      nr,
      csCustomCyanRed,
      csCustomMagGreen,
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
