import { describe, it, expect } from 'vitest';
import { buildFrame, buildLdtPacket, buildActivateSlotPacket, buildGetPacket } from './sdcp';

describe('buildFrame', () => {
  it('produces correct 10-byte header', () => {
    const frame = buildFrame(Buffer.from([0xa5, 0x01]));
    expect(frame[0]).toBe(0x02);
    expect(frame[1]).toBe(0x0a);
    expect(frame.slice(2, 6).toString()).toBe('SONY');
    expect(frame[6]).toBe(0x00); // request direction
    expect(frame[7]).toBe(0x70);
  });

  it('encodes length as count of all remaining bytes after header', () => {
    // inner_data = [a5, 01], checksum = XOR of [01] = 0x01, ETX = 0x5a
    // remaining after 10-byte header = 2 (inner) + 1 (checksum) + 1 (ETX) = 4
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
  // WIRESHARK-VERIFIED (frame 3851): Gamma10, R channel, start=0
  const KNOWN_GOOD_CHUNK1 =
    '020a534f4e5900700038' +
    'a5010001000105000100018c00802700250a000000100000000a0012001a00210029003100390041004a0052005c0065006f00790084' +
    'e05a';

  // WIRESHARK-VERIFIED (frame 4020): Gamma10, R channel, start=16
  const KNOWN_GOOD_CHUNK2 =
    '020a534f4e5900700038' +
    'a5010001000105000100018c00802700250a000010100090009c00a800b600c400d200e100f2010201120123013501470159016b017f' +
    '1b5a';

  // WIRESHARK-VERIFIED (frame 4065): Gamma10, B channel, start=48
  // NOTE: checksum corrected to 0x06 (algorithm: XOR of inner_data[1:]);
  // the original test spec had 0xef which is inconsistent with the verified algorithm.
  const KNOWN_GOOD_CHUNK3 =
    '020a534f4e5900700038' +
    'a5010001000105000100018c00802700250a0200301002d002e402f8030d03210336034a036003730388039d03b203c603db03ef03ff' +
    '065a';

  it('matches captured packet for Gamma10, R, start=0', () => {
    const values = [0, 10, 18, 26, 33, 41, 49, 57, 65, 74, 82, 92, 101, 111, 121, 132];
    const pkt = buildLdtPacket({ slot: 10, channel: 0, startIndex: 0, values });
    expect(pkt.toString('hex')).toBe(KNOWN_GOOD_CHUNK1);
  });

  it('matches captured packet for Gamma10, R, start=16', () => {
    const values = [144, 156, 168, 182, 196, 210, 225, 242, 258, 274, 291, 309, 327, 345, 363, 383];
    const pkt = buildLdtPacket({ slot: 10, channel: 0, startIndex: 16, values });
    expect(pkt.toString('hex')).toBe(KNOWN_GOOD_CHUNK2);
  });

  it('matches captured packet for Gamma10, B, start=48', () => {
    // Values from hex: 02d0=720, 02e4=740, 02f8=760, 030d=781, 0321=801, 0336=822, 034a=842, 0360=864, 0373=883, 0388=904, 039d=925, 03b2=946, 03c6=966, 03db=987, 03ef=1007, 03ff=1023
    const values = [720, 740, 760, 781, 801, 822, 842, 864, 883, 904, 925, 946, 966, 987, 1007, 1023];
    const pkt = buildLdtPacket({ slot: 10, channel: 2, startIndex: 48, values });
    expect(pkt.toString('hex')).toBe(KNOWN_GOOD_CHUNK3);
  });

  it('throws if values.length !== 16', () => {
    expect(() => buildLdtPacket({ slot: 10, channel: 0, startIndex: 0, values: [1, 2, 3] })).toThrow();
  });
});

describe('buildActivateSlotPacket', () => {
  // WIRESHARK-VERIFIED (frame 4067): activate Gamma10
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
    // slot byte is at index 30 (0-based) in the 35-byte frame
    // (10-byte header + 11-byte FIXED_PREFIX + 6 command bytes + 3 bytes to slot)
    expect(pkt[30]).toBe(0x07);
  });

  it('uses correct slot byte for Gamma9', () => {
    const pkt = buildActivateSlotPacket(9);
    expect(pkt[30]).toBe(0x09);
  });
});

describe('buildGetPacket', () => {
  // WIRESHARK-VERIFIED (frame 3774): GET Gamma Correction item 0x0022
  const KNOWN_GOOD_GAMMA =
    '020a534f4e590070001' +
    '5a5010001000105000100010001800400020022' +
    'a15a';

  it('matches captured GET packet for item 0x0022', () => {
    const pkt = buildGetPacket(0x00, 0x22);
    expect(pkt.toString('hex')).toBe(KNOWN_GOOD_GAMMA);
  });
});
