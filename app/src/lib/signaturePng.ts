import type { Signature } from './attachments';

/**
 * Draws a signature (its SVG strokes) as a black-and-white PNG, base64, for
 * Odoo image fields such as sale.order's `signature`, which take PNG or JPEG
 * but not SVG. Pure JS: lines are stamped with a round brush into a 1-bit
 * image, stored without compression (a signature is small anyway).
 */
export function signaturePng(sig: Pick<Signature, 'paths' | 'w' | 'h'>, width = 480): string {
  const scale = width / Math.max(1, sig.w);
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(sig.h * scale));
  const ink = new Uint8Array(w * h);
  const r = Math.max(1, 1.5 * scale);
  const dot = (cx: number, cy: number) => {
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y++)
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) ink[y * w + x] = 1;
  };
  for (const stroke of strokes(sig.paths)) {
    stroke.forEach(([x, y], i) => {
      const [px, py] = i === 0 ? [x, y] : stroke[i - 1]!;
      const steps = Math.max(1, Math.ceil(Math.hypot(x - px, y - py) * scale));
      for (let s = 0; s <= steps; s++) dot((px + ((x - px) * s) / steps) * scale, (py + ((y - py) * s) / steps) * scale);
    });
  }
  // 1-bit grayscale rows, each led by filter byte 0; a set bit is white.
  const rowBytes = Math.ceil(w / 8);
  const raw = new Uint8Array(h * (rowBytes + 1));
  for (let y = 0; y < h; y++) {
    const o = y * (rowBytes + 1);
    for (let x = 0; x < w; x++) if (!ink[y * w + x]) raw[o + 1 + (x >> 3)] |= 0x80 >> (x & 7);
    for (let x = w; x < rowBytes * 8; x++) raw[o + 1 + (x >> 3)] |= 0x80 >> (x & 7);
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr.set([1, 0, 0, 0, 0], 8);
  const png = concat([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlibStored(raw)), chunk('IEND', new Uint8Array(0))]);
  return base64(png);
}

/** The points of each stroke: "M x y L x y ..." (lowercase taken as relative). */
export function strokes(paths: string[]): [number, number][][] {
  return paths
    .filter((d) => /^[MLml0-9.\s,-]+$/.test(d))
    .map((d) => {
      const pts: [number, number][] = [];
      const tokens = d.match(/[MLml]|-?\d*\.?\d+/g) ?? [];
      let cmd = 'M';
      let x = 0;
      let y = 0;
      for (let i = 0; i < tokens.length; ) {
        if (/[MLml]/.test(tokens[i]!)) cmd = tokens[i++]!;
        const a = Number(tokens[i++]);
        const b = Number(tokens[i++]);
        if (!Number.isFinite(a) || !Number.isFinite(b)) break;
        const rel = cmd === 'm' || cmd === 'l';
        x = rel ? x + a : a;
        y = rel ? y + b : b;
        pts.push([x, y]);
      }
      return pts;
    })
    .filter((s) => s.length > 0);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** zlib data with stored (uncompressed) deflate blocks. */
function zlibStored(data: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  for (let o = 0; o < data.length || o === 0; o += 65535) {
    const part = data.subarray(o, Math.min(data.length, o + 65535));
    const last = o + 65535 >= data.length ? 1 : 0;
    const head = new Uint8Array([last, part.length & 0xff, part.length >> 8, ~part.length & 0xff, (~part.length >> 8) & 0xff]);
    blocks.push(head, part);
    if (last) break;
  }
  let a = 1;
  let b = 0;
  for (const v of data) {
    a = (a + v) % 65521;
    b = (b + a) % 65521;
  }
  const adler = new Uint8Array(4);
  new DataView(adler.buffer).setUint32(0, ((b << 16) | a) >>> 0);
  blocks.push(adler);
  return concat(blocks);
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + (i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '=') + (i + 2 < bytes.length ? B64[n & 63]! : '=');
  }
  return out;
}
