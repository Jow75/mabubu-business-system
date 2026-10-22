// Draws the app icon (indigo tile, paper-white dera, saffron stitch) as PNGs.
// Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}

// Dera outline in a 64-unit box (same as favicon.svg).
const dress = [
  [24, 13], [28, 17.5], [32, 19], [36, 17.5], [40, 13], [49, 18], [45, 27], [41, 25], [46, 51], [18, 51], [23, 25], [19, 27], [15, 18],
];
function inside(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function draw(size, maskable) {
  const S = 4; // supersampling
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const pad = maskable ? 0.12 : 0;
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++)
        for (let sx = 0; sx < S; sx++) {
          const u = ((px + (sx + 0.5) / S) / size) * 64;
          const v = ((py + (sy + 0.5) / S) / size) * 64;
          // rounded tile (full bleed for maskable)
          const rr = maskable ? 0 : 14;
          const dx = Math.max(rr - u, 0, u - (64 - rr));
          const dy = Math.max(rr - v, 0, v - (64 - rr));
          if (dx * dx + dy * dy > rr * rr) continue;
          // shrink artwork into the safe zone for maskable icons
          const k = 1 / (1 - 2 * pad);
          const au = (u - 32) * k + 32;
          const av = (v - 32) * k + 32;
          let col = [46, 58, 135];
          if (inside(au, av, dress)) col = [247, 243, 236];
          if (av > 42.8 && av < 45.2 && au > 21 && au < 43 && Math.floor((au - 21) / 2.75) % 2 === 0) col = [224, 161, 58];
          r += col[0]; g += col[1]; b += col[2]; a += 255;
        }
      const n = S * S;
      const o = py * (size * 4 + 1) + 1 + px * 4;
      const cov = a / n / 255;
      raw[o] = cov ? Math.round(r / n / cov) : 0;
      raw[o + 1] = cov ? Math.round(g / n / cov) : 0;
      raw[o + 2] = cov ? Math.round(b / n / cov) : 0;
      raw[o + 3] = Math.round(a / n);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// "any" icons are the rounded tile (desktop shortcut, taskbar, Start menu);
// the maskable one is full bleed with the dera inside the safe zone, for
// Android's own icon shapes.
writeFileSync('public/icon-192.png', draw(192, false));
writeFileSync('public/icon-512.png', draw(512, false));
writeFileSync('public/icon-maskable-512.png', draw(512, true));
console.log('Icons written to public/');
