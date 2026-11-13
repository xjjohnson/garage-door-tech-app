import { signaturePng, strokes } from '../lib/signaturePng';

const { inflateSync } = jest.requireActual('zlib') as { inflateSync: (b: Uint8Array) => Uint8Array };
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function bytes(b64: string): Uint8Array {
  const clean = b64.replace(/=+$/, '');
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const n = [0, 1, 2, 3].reduce((acc, k) => (acc << 6) | (i + k < clean.length ? B64.indexOf(clean[i + k]!) : 0), 0);
    out.push((n >> 16) & 255);
    if (i + 2 < clean.length) out.push((n >> 8) & 255);
    if (i + 3 < clean.length) out.push(n & 255);
  }
  return new Uint8Array(out);
}
const u32 = (b: Uint8Array, o: number) => ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;

describe('signature as a PNG', () => {
  it('reads absolute and relative strokes', () => {
    expect(strokes(['M 1 2 L 3 4 L 5 6', 'm 10 10 l 2 0', 'bad<path>'])).toEqual([
      [
        [1, 2],
        [3, 4],
        [5, 6],
      ],
      [
        [10, 10],
        [12, 10],
      ],
    ]);
  });

  it('makes a valid 1-bit PNG with the ink where the stroke is', () => {
    const png = bytes(signaturePng({ paths: ['M 10 50 L 90 50'], w: 100, h: 100 }, 100));
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(u32(png, 16)).toBe(100);
    expect(u32(png, 20)).toBe(100);
    const idatLen = u32(png, 33);
    expect(String.fromCharCode(...png.subarray(37, 41))).toBe('IDAT');
    const raw = inflateSync(png.subarray(41, 41 + idatLen));
    const row = (y: number) => raw.subarray(y * 14 + 1, y * 14 + 14);
    const black = (y: number, x: number) => !(row(y)[x >> 3]! & (0x80 >> (x & 7)));
    expect(black(50, 50)).toBe(true);
    expect(black(10, 50)).toBe(false);
    expect(black(50, 5)).toBe(false);
  });
});
