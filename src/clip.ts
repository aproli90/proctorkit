// Packs JPEG frames into an MP4 without re-encoding (Motion JPEG, one frame per second of clip time).
// Plain code, no dependencies, runs in any browser. A clip is the same photos the camera and screen produced,
// in order; any MP4 reader that understands Motion JPEG can open it, and `clipFrames()` takes the photos back out.

/** Width and height from a JPEG's start-of-frame marker, or null if it is not a baseline/progressive JPEG. */
export function jpegSize(b: Uint8Array): { w: number; h: number } | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
    i += 2 + len;
  }
  return null;
}

const enc = new TextEncoder();
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n: number) => [(n >>> 8) & 255, n & 255];
const u24 = (n: number) => [(n >>> 16) & 255, (n >>> 8) & 255, n & 255];
function box(type: string, ...parts: (number[] | Uint8Array)[]): Uint8Array {
  const size = 8 + parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(size);
  out.set(u32(size), 0); out.set(enc.encode(type), 4);
  let o = 8; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
const full = (type: string, version: number, flags: number, ...parts: (number[] | Uint8Array)[]) => box(type, [version, ...u24(flags)], ...parts);
const MATRIX = [...u32(0x00010000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x00010000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x40000000)];

/** Frames that do not match the first frame's size are dropped (a container has one picture size). */
export function mjpegMp4(frames: Uint8Array[]): { mp4: Uint8Array; used: number } {
  const size = frames.map(jpegSize);
  const first = size.find(Boolean);
  if (!first) throw new Error('no readable JPEG frames');
  const keep = frames.filter((_, i) => size[i] && size[i]!.w === first.w && size[i]!.h === first.h);
  const n = keep.length, TS = 1000, total = n * TS;
  const esds = full('esds', 0, 0,
    [0x03, 21, ...u16(1), 0,                                  // ES descriptor: id 1
     0x04, 13, 0x6c, 0x11, ...u24(0), ...u32(0), ...u32(0),   // decoder config: JPEG (0x6C), visual stream
     0x06, 1, 0x02]);                                          // SL config
  const mp4v = box('mp4v', [0, 0, 0, 0, 0, 0, ...u16(1), ...u16(0), ...u16(0), ...u32(0), ...u32(0), ...u32(0),
    ...u16(first.w), ...u16(first.h), ...u32(0x00480000), ...u32(0x00480000), ...u32(0), ...u16(1), ...new Array(32).fill(0), ...u16(0x18), ...u16(0xffff)], esds);
  const stsd = full('stsd', 0, 0, u32(1), mp4v);
  const stts = full('stts', 0, 0, u32(1), u32(n), u32(TS));
  const stsc = full('stsc', 0, 0, u32(1), u32(1), u32(n), u32(1));
  const stsz = full('stsz', 0, 0, u32(0), u32(n), keep.flatMap((f) => u32(f.length)));
  const ftyp = box('ftyp', enc.encode('isom'), u32(512), enc.encode('isomiso2mp41'));
  // chunk offset: everything sits in one chunk right after the mdat header, so build moov once with a placeholder, then patch
  const build = (offset: number) => {
    const stco = full('stco', 0, 0, u32(1), u32(offset));
    const stbl = box('stbl', stsd, stts, stsc, stsz, stco);
    const minf = box('minf', full('vmhd', 0, 1, u16(0), u16(0), u16(0), u16(0)), box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1))), stbl);
    const mdia = box('mdia', full('mdhd', 0, 0, u32(0), u32(0), u32(TS), u32(total), u16(0x55c4), u16(0)),
      full('hdlr', 0, 0, u32(0), enc.encode('vide'), u32(0), u32(0), u32(0), enc.encode('VideoHandler\0')), minf);
    const tkhd = full('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(total), u32(0), u32(0), u16(0), u16(0), u16(0), u16(0), MATRIX, u32(first.w << 16), u32(first.h << 16));
    const mvhd = full('mvhd', 0, 0, u32(0), u32(0), u32(TS), u32(total), u32(0x00010000), u16(0x0100), u16(0), u32(0), u32(0), MATRIX, ...new Array(6).fill(u32(0)), u32(2));
    return box('moov', mvhd, box('trak', tkhd, mdia));
  };
  const moovLen = build(0).length;
  const moov = build(ftyp.length + moovLen + 8);
  const dataLen = keep.reduce((s, f) => s + f.length, 0);
  const out = new Uint8Array(ftyp.length + moov.length + 8 + dataLen);
  out.set(ftyp, 0); out.set(moov, ftyp.length);
  let o = ftyp.length + moov.length;
  out.set(u32(8 + dataLen), o); out.set(enc.encode('mdat'), o + 4); o += 8;
  for (const f of keep) { out.set(f, o); o += f.length; }
  return { mp4: out, used: n };
}

/** The JPEG frames inside a clip made by `mjpegMp4`, in order. */
export function clipFrames(mp4: Uint8Array): Uint8Array[] {
  const view = new DataView(mp4.buffer, mp4.byteOffset, mp4.byteLength);
  const find = (type: string, from: number, to: number): number => {
    for (let i = from; i + 8 <= to;) { const size = view.getUint32(i); if (String.fromCharCode(...mp4.subarray(i + 4, i + 8)) === type) return i; if (size < 8) break; i += size; }
    return -1;
  };
  const path = (types: string[]): number => { let at = 0, end = mp4.length; for (const t of types) { const i = find(t, at, end); if (i < 0) return -1; end = i + view.getUint32(i); at = i + 8; } return at - 8; };
  const stsz = path(['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsz']), stco = path(['moov', 'trak', 'mdia', 'minf', 'stbl', 'stco']);
  if (stsz < 0 || stco < 0) return [];
  const n = view.getUint32(stsz + 16);
  let o = view.getUint32(stco + 16);
  const out: Uint8Array[] = [];
  for (let k = 0; k < n; k++) { const len = view.getUint32(stsz + 20 + 4 * k); out.push(mp4.subarray(o, o + len)); o += len; }
  return out;
}
