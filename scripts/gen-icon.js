// Generates images/icon.png — professional Source Doc icon.
// No external dependencies; uses only Node.js built-ins.
'use strict';
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

const SIZE = 128;
// RGBA flat buffer
const px = new Float32Array(SIZE * SIZE * 4); // premult alpha float for blending

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// Blend src (r,g,b,a 0-1) over dst in-place
function blend(i, r, g, b, a) {
    const da = px[i+3];
    const oa = a + da * (1 - a);
    if (oa < 1e-6) return;
    px[i]   = (r * a + px[i]   * da * (1 - a)) / oa;
    px[i+1] = (g * a + px[i+1] * da * (1 - a)) / oa;
    px[i+2] = (b * a + px[i+2] * da * (1 - a)) / oa;
    px[i+3] = oa;
}

function index(x, y) { return (y * SIZE + x) * 4; }

// Signed distance: rounded rectangle (all coords in px-space)
function sdRoundRect(px_, py_, x0, y0, x1, y1, r) {
    const cx = clamp(px_, x0 + r, x1 - r);
    const cy = clamp(py_, y0 + r, y1 - r);
    const dx = px_ - cx, dy = py_ - cy;
    return Math.sqrt(dx*dx + dy*dy) - r;
}

// Fill rounded rect with AA, optional top-to-bottom gradient between two colours
function fillRRect(x0, y0, x1, y1, r, cr1, cg1, cb1, cr2, cg2, cb2, globalA) {
    const pad = 2;
    for (let y = Math.max(0, y0 - pad); y < Math.min(SIZE, y1 + pad); y++) {
        const t = (x1 - x0) > 0 ? (y - y0) / (y1 - y0) : 0;
        const rr = cr1 + (cr2 - cr1) * t;
        const gg = cg1 + (cg2 - cg1) * t;
        const bb = cb1 + (cb2 - cb1) * t;
        for (let x = Math.max(0, x0 - pad); x < Math.min(SIZE, x1 + pad); x++) {
            const d = sdRoundRect(x + 0.5, y + 0.5, x0, y0, x1, y1, r);
            const a = clamp(0.5 - d, 0, 1) * globalA;
            if (a <= 0) continue;
            blend(index(x, y), rr, gg, bb, a);
        }
    }
}

// Soft glow: radial falloff centred on a horizontal bar
function addGlow(x0, y0, x1, y1, r, g, b, strength, spread) {
    const my = (y0 + y1) / 2;
    const mx = (x0 + x1) / 2;
    const hw = (x1 - x0) / 2;
    const hh = (y1 - y0) / 2 + spread;
    for (let y = Math.max(0, Math.floor(my - spread * 3)); y < Math.min(SIZE, Math.ceil(my + spread * 3)); y++) {
        for (let x = Math.max(0, Math.floor(x0 - spread)); x < Math.min(SIZE, Math.ceil(x1 + spread)); x++) {
            const dx = Math.max(0, Math.abs(x + 0.5 - mx) - hw);
            const dy = Math.abs(y + 0.5 - my);
            const dist = Math.sqrt(dx*dx + dy*dy);
            const a = strength * Math.exp(-dist * dist / (2 * spread * spread));
            if (a <= 1e-4) continue;
            blend(index(x, y), r, g, b, clamp(a, 0, 1));
        }
    }
}

// ── Design ─────────────────────────────────────────────────────────────────

// Transparent background (already zeroed)

// Card background: dark blue-gray, with very subtle gradient top→bottom
//   top  #151822   bottom #1c1f2e
fillRRect(4, 4, 123, 123, 14,
    0x15/255, 0x18/255, 0x22/255,
    0x1c/255, 0x1f/255, 0x2e/255,
    1.0);

// Thin top accent stripe (brand colour bar at top of card)
fillRRect(4, 4, 123, 9, 14,
    0x26/255, 0xa6/255, 0xe0/255,
    0x1a/255, 0x7c/255, 0xb5/255,
    1.0);

// Code lines — 5 bars, left-indented to simulate code indentation
// Colours: muted slate for normal lines, bright cyan for highlighted line
const lines = [
    { y0: 26, y1: 33, x0: 18, x1: 97,  hi: false },   // 79 wide
    { y0: 40, y1: 47, x0: 26, x1: 87,  hi: false },   // indented, 61 wide
    { y0: 54, y1: 63, x0: 18, x1: 108, hi: true  },   // HIGHLIGHTED — full width, taller
    { y0: 70, y1: 77, x0: 26, x1: 82,  hi: false },
    { y0: 84, y1: 91, x0: 18, x1: 70,  hi: false },
    { y0: 98, y1: 105, x0: 26, x1: 60, hi: false },
];

for (const l of lines) {
    if (l.hi) {
        // Glow first (behind bar)
        addGlow(l.x0, l.y0, l.x1, l.y1,
            0x50/255, 0xc8/255, 1.0, 0.45, 7);
        // Bar itself: bright cyan #50c8ff
        fillRRect(l.x0, l.y0, l.x1, l.y1, 3,
            0x50/255, 0xc8/255, 1.0,
            0x38/255, 0xb8/255, 0xf8/255,
            1.0);
        // Ghost-text "tail" — lighter, narrower bar to the right, simulating inline comment
        fillRRect(l.x1 + 4, l.y0 + 1, Math.min(118, l.x1 + 22), l.y1 - 1, 2,
            0x50/255, 0xc8/255, 1.0,
            0x38/255, 0xb8/255, 0xf8/255,
            0.35);
    } else {
        // Normal code line: muted slate #3d4260
        fillRRect(l.x0, l.y0, l.x1, l.y1, 3,
            0x3d/255, 0x42/255, 0x60/255,
            0x3d/255, 0x42/255, 0x60/255,
            1.0);
    }
}

// ── Encode PNG ──────────────────────────────────────────────────────────────

// Convert float RGBA → Uint8 RGBA
const raw = Buffer.alloc(SIZE * SIZE * 4);
for (let i = 0; i < SIZE * SIZE * 4; i++) {
    raw[i] = clamp(Math.round(px[i] * 255), 0, 255);
}

// Build raw scanlines: each row prefixed by filter byte 0
const scanlines = Buffer.alloc(SIZE * (1 + SIZE * 4));
for (let y = 0; y < SIZE; y++) {
    const row = y * (1 + SIZE * 4);
    scanlines[row] = 0; // filter type None
    raw.copy(scanlines, row + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

function crc32(buf) {
    const table = crc32.table || (crc32.table = (() => {
        const t = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            t[n] = c;
        }
        return t;
    })());
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const t = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.concat([t, data]);
    const crcVal = Buffer.alloc(4); crcVal.writeUInt32BE(crc32(crcBuf), 0);
    return Buffer.concat([len, t, data, crcVal]);
}

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8]  = 8;  // bit depth
ihdr[9]  = 6;  // RGBA
ihdr[10] = 0;  // compression
ihdr[11] = 0;  // filter
ihdr[12] = 0;  // interlace

const compressed = zlib.deflateSync(scanlines, { level: 9 });

const out = Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
]);

const dest = path.join(__dirname, '..', 'images', 'icon.png');
fs.writeFileSync(dest, out);
console.log(`Written ${out.length} bytes → ${dest}`);
