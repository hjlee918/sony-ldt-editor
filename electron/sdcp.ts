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
