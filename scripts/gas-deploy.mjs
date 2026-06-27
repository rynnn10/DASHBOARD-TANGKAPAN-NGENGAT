// Deploy Apps Script: push kode.gs lalu update deployment Web App (URL tetap sama).
// Deployment ID dibaca dari .env (CLASP_DEPLOYMENT_ID) — TIDAK ditulis di package.json,
// jadi tidak ikut ter-commit ke repo publik.
import 'dotenv/config';
import { execSync } from 'node:child_process';

const id = process.env.CLASP_DEPLOYMENT_ID;
if (!id) {
  console.error('\n❌ CLASP_DEPLOYMENT_ID belum diisi di .env');
  console.error('   Tambahkan baris: CLASP_DEPLOYMENT_ID=AKfycb...\n');
  process.exit(1);
}

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

console.log('▶ clasp push (upload kode.gs ke Apps Script)…');
run('clasp push -f');

console.log(`▶ clasp deploy -i ${id} (update Web App, URL tetap)…`);
run(`clasp deploy -i ${id} -d "auto deploy"`);

console.log('\n✅ Apps Script ter-deploy. URL Web App tidak berubah.');
