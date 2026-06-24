// Generate ikon PWA (192/512 PNG) dari favicon bug hijau (Lucide "Bug").
// Latar hijau muda #f0fdf4 (sesuai background_color manifest), bug stroke #10b981.
// Jalankan: node scripts/gen-icons.cjs
const sharp = require("sharp");
const path = require("path");

const BUG_PATHS = [
  "m8 2 1.88 1.88",
  "M14.12 3.88 16 2",
  "M9 7.13v-1a3.003 3.003 0 1 1 6 0v1",
  "M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6",
  "M12 20v-9",
  "M6.53 9C4.6 8.8 3 7.1 3 5",
  "M17.47 9c1.93-.2 3.53-1.9 3.53-4",
  "M8 14H4",
  "M20 14h-4",
  "M9 18h6",
]
  .map((d) => `<path d="${d}"/>`)
  .join("");

// Bug native 24x24 → tampil ~50% kanvas, di tengah (aman untuk maskable).
function svg(size) {
  const scale = size / 48; // 24*scale = size/2
  const off = size / 4; // ((size - size/2) / 2)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#f0fdf4"/>
  <g transform="translate(${off},${off}) scale(${scale})" fill="none" stroke="#10b981" stroke-width="1.92" stroke-linecap="round" stroke-linejoin="round">${BUG_PATHS}</g>
</svg>`;
}

async function gen(size, file) {
  const out = path.join(__dirname, "..", "public", file);
  await sharp(Buffer.from(svg(size))).png().toFile(out);
  console.log("✓ " + file + " (" + size + "x" + size + ")");
}

(async () => {
  await gen(512, "512x512.png");
  await gen(192, "192x192.png");
  console.log("Selesai.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
