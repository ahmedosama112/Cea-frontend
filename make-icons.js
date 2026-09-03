// يولّد أيقونات الـ PWA بنفس هوية شاشة البداية (كحلي + دائرة ذهبية + CEA) بدون أي مكتبات خارجية
// التشغيل: node make-icons.js  →  icons/icon-192.png, icon-512.png, icon-maskable-512.png
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const NAVY = [0x1f, 0x38, 0x64];
const GOLD = [0xc9, 0xa8, 0x4c];

// ── خط بسيط 5x7 للحروف C E A ──
const GLYPHS = {
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
};

function makeIcon(size, maskable) {
  const px = new Uint8Array(size * size * 4);
  const cx = size / 2, cy = size / 2;
  // في الـ maskable المحتوى لازم يكون جوه دائرة آمنة 80% — نصغّر الرسم شوية
  const scale = maskable ? 0.72 : 0.9;
  const ringR = (size / 2) * scale;
  const ringW = Math.max(3, size * 0.035);
  const glow = [Math.round(NAVY[0] + (GOLD[0] - NAVY[0]) * 0.08), Math.round(NAVY[1] + (GOLD[1] - NAVY[1]) * 0.08), Math.round(NAVY[2] + (GOLD[2] - NAVY[2]) * 0.08)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      let c = NAVY;
      if (d <= ringR) c = glow;
      if (d <= ringR && d >= ringR - ringW) c = GOLD;
      const i = (y * size + x) * 4;
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
    }
  }

  // نص CEA في المنتصف
  const text = 'CEA';
  // عرض النص الكلي (3 حروف × 5 + فجوتين) = 17 وحدة — نخليه ~52% من قطر الدائرة عشان يقعد جواها مريح
  const cell = Math.max(2, Math.round((ringR * 2 * 0.52) / 17));
  const gap = cell; // مسافة بين الحروف
  const totalW = text.length * 5 * cell + (text.length - 1) * gap;
  const startX = Math.round(cx - totalW / 2);
  const startY = Math.round(cy - (7 * cell) / 2);
  text.split('').forEach((ch, ci) => {
    const g = GLYPHS[ch];
    const ox = startX + ci * (5 * cell + gap);
    for (let r = 0; r < 7; r++) for (let q = 0; q < 5; q++) {
      if (g[r][q] !== '1') continue;
      for (let dy = 0; dy < cell; dy++) for (let dx = 0; dx < cell; dx++) {
        const x = ox + q * cell + dx, y = startY + r * cell + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const i = (y * size + x) * 4;
        px[i] = GOLD[0]; px[i + 1] = GOLD[1]; px[i + 2] = GOLD[2]; px[i + 3] = 255;
      }
    }
  });
  return encodePNG(size, size, px);
}

// ── مُرمِّز PNG بسيط (RGBA, بدون فلتر) ──
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(path.join(__dirname, 'icons'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'icons', 'icon-192.png'), makeIcon(192, false));
fs.writeFileSync(path.join(__dirname, 'icons', 'icon-512.png'), makeIcon(512, false));
fs.writeFileSync(path.join(__dirname, 'icons', 'icon-maskable-512.png'), makeIcon(512, true));
console.log('icons written: icons/icon-192.png, icon-512.png, icon-maskable-512.png');
