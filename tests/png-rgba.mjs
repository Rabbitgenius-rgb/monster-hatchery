import { inflateSync } from 'node:zlib';

// Read-only PNG inspection for the generated RGBA sprite sheets. Checking only
// that an alpha channel exists missed an earlier sheet with a foggy rectangle.
export function decodeRGBA(png) {
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  if (png[24] !== 8 || png[25] !== 6 || png[28] !== 0) throw new Error('Expected non-interlaced 8-bit RGBA PNG');
  const chunks = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * 4;
  const rgba = Buffer.alloc(width * height * 4);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const k = y * stride + x, a = x >= 4 ? rgba[k - 4] : 0, b = y ? rgba[k - stride] : 0, c = y && x >= 4 ? rgba[k - stride - 4] : 0;
      let value = raw[y * (stride + 1) + 1 + x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += Math.floor((a + b) / 2);
      else if (filter === 4) value += paeth(a, b, c);
      else if (filter !== 0) throw new Error('Unknown PNG row filter');
      rgba[k] = value & 255;
    }
  }
  return { width, height, alphaAt: (x, y) => rgba[(y * width + x) * 4 + 3] };
}
