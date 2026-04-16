import { createHash } from 'crypto';
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
  inputLagReduction: number;
}

export class SdcpConnection extends EventEmitter {
  private socket: Socket | null = null;
  private responseBuffer = Buffer.alloc(0);
  private pendingResponses: Array<{ resolve: (buf: Buffer) => void; reject: (err: Error) => void }> = [];

  async connect(ip: string, password?: string): Promise<'ok' | ErrorCode> {
    return new Promise((resolve) => {
      const sock = new Socket();
      let authDone = false;

      const timer = setTimeout(() => {
        sock.destroy();
        resolve('err_connect');
      }, 10_000);

      sock.once('data', (data: Buffer) => {
        const challenge = data.toString().trim();
        if (challenge === 'NOKEY') {
          authDone = true;
          clearTimeout(timer);
          this.socket = sock;
          sock.on('data', (d: Buffer) => this.onData(d));
          sock.on('error', (err) => this.onSocketError(err));
          resolve('ok');
        } else {
          const hash = createHash('sha256')
            .update(challenge + (password ?? '').trim())
            .digest('hex');
          sock.write(hash + '\r\n');
          sock.once('data', (resp: Buffer) => {
            clearTimeout(timer);
            const answer = resp.toString().trim();
            if (answer === 'ok') {
              authDone = true;
              this.socket = sock;
              sock.on('data', (d: Buffer) => this.onData(d));
              sock.on('error', (err) => this.onSocketError(err));
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
      }, 60_000);
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
}
