// Watcher AUTO-DEPLOY Apps Script.
// Pantau kode.gs (+ appsscript.json) → tiap disimpan: clasp push lalu clasp deploy
// ke deployment ID yang sama (URL Web App tetap). Deployment ID dibaca dari .env.
//
// Jalankan:  npm run gas:watch-deploy   (Ctrl+C untuk berhenti)
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { watch } from 'node:fs';

const id = process.env.CLASP_DEPLOYMENT_ID;
if (!id) {
  console.error('\n❌ CLASP_DEPLOYMENT_ID belum diisi di .env\n');
  process.exit(1);
}

const WATCHED = new Set(['kode.gs', 'appsscript.json']);
const DEBOUNCE_MS = 1000;

let timer = null;
let running = false;   // sedang deploy?
let pending = false;   // ada perubahan baru saat deploy berjalan?

const ts = () => new Date().toLocaleTimeString('id-ID');

function deploy() {
  if (running) { pending = true; return; }   // tunda; jalankan lagi setelah selesai
  running = true;
  try {
    console.log(`\n[${ts()}] ▶ Perubahan terdeteksi — push + deploy…`);
    execSync('clasp push -f', { stdio: 'inherit' });
    execSync(`clasp deploy -i ${id} -d "auto deploy (watch)"`, { stdio: 'inherit' });
    console.log(`[${ts()}] ✅ Ter-deploy. URL Web App tetap. Memantau lagi…`);
  } catch (e) {
    console.error(`[${ts()}] ❌ Gagal deploy: ${e.message}`);
  } finally {
    running = false;
    if (pending) { pending = false; schedule(); }  // proses perubahan yang masuk saat deploy
  }
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(deploy, DEBOUNCE_MS);
}

// Pantau direktori (non-rekursif) lalu saring nama file — lebih tahan terhadap
// "atomic save" editor (tulis temp + rename) dibanding watch file langsung.
watch('.', { persistent: true }, (_event, filename) => {
  if (filename && WATCHED.has(filename)) schedule();
});

console.log('👀 Memantau kode.gs & appsscript.json — auto push+deploy tiap disimpan.');
console.log('   (Ctrl+C untuk berhenti)');
