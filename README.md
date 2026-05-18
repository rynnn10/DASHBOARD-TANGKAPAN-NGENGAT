# Dashboard Tangkapan Ngengat (Moth Catch Dashboard)

Dashboard interaktif real-time untuk memantau data tangkapan ngengat (dan hama lainnya) menggunakan sensor UV (365 nm dan 395 nm) serta sensor IR (Inframerah) yang mendukung sinkronisasi otomatis.

## 🚀 Fitur Utama

- **Pemantauan Real-time**: Visualisasi data tangkapan masing-masing node (Node A UV 365 nm dan Node B UV 395 nm) dari waktu ke waktu secara real-time.
- **Mode Offline & Online**: Mendukung penyimpanan lokal dengan sinkronisasi otomatis kembali ke server ketika koneksi pulih.
- **Tabel Log Deteksi**: Menyimpan setiap kejadian sensor IR terpicu secara mendetail, yang bisa didownload dalam bentuk Excel.
- **Otentikasi Aman**: Registrasi dengan persyaratan password tingkat tinggi untuk mencegah peretasan (indikator kekuatan password visual).
- **Kustomisasi Profil Tampilan**: Edit profil, kelola notifikasi, serta pilih preferensi satuan suhu dan tegangan.

## 🛠️ Dibangun Dengan

- **React 18**: Framework UI menggunakan functional components + Hooks.
- **Vite**: Build tool super cepat.
- **Tailwind CSS**: Utility-first CSS framework untuk UI modern dan responsif.
- **Recharts**: Pembuatan chart (Line Chart & Bar Chart) performa tinggi.
- **Lucide React**: Ikon yang minimalis dan terintegrasi mulus.
- **SheetJS (xlsx)**: Format dan eksport data ke Excel dengan mudah untuk analisis lanjutan.

## 👦 Pembuat (Author)

Proyek ini dibangun oleh **[Nama Anda / Tim Anda]**. 
*(Anda dapat mengganti ini dengan identitas pembuat aslinya di GitHub)*

## 📦 Cara Menjalankan Secara Lokal (Local Environment)

Pastikan Anda memiliki [Node.js](https://nodejs.org/) yang telah terinstall.

1. **Clone Repository ini**
   ```bash
   git clone https://github.com/username-anda/DASHBOARD-TANGKAPAN-NGENGAT.git
   cd DASHBOARD-TANGKAPAN-NGENGAT
   ```

2. **Install Dependensi**
   ```bash
   npm install
   ```
   *(Jika npm install gagal, coba pastikan struktur json Anda valid atau gunakan `npm install --force`)*

3. **Jalankan Development Server**
   ```bash
   npm run dev
   ```
   Aplikasi akan bisa diakses melalui `http://localhost:5173` (atau port lain yang ditunjukkan di terminal).

## 🌍 Cara Mendeploy (Khusus GitHub Pages)

Jika Anda ingin deploy khusus build statis ini menggunakan GitHub Pages:

1. **Atur "homepage" di package.json**
   Tambahkan baris berikut di `package.json` Anda:
   ```json
   "homepage": "https://<username-github>.github.io/<nama-repo>/"
   ```

2. **Install gh-pages**
   ```bash
   npm install --save-dev gh-pages
   ```

3. **Tambahkan Script Deploy di package.json**
   Pada bagian `"scripts"`, tambahkan baris ini:
   ```json
   "predeploy": "npm run build",
   "deploy": "gh-pages -d dist"
   ```

4. **Jalankan Perintah Deploy**
   ```bash
   npm run deploy
   ```
   *Dashboard Anda sekarang akan online dan bisa diakses lewat link publik GitHub Pages Anda!*

---

> **Catatan:** Fitur mode Real-time dan login memerlukan koneksi ke Google Apps Script backend (`SCRIPT_URL`). Anda bisa menggunakan mode **Demo Offline** melalui tombol di side-menu untuk melihat tampilan interaktif secara simulasi.
