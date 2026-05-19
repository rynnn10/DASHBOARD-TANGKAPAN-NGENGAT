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

Proyek ini dibangun oleh **RIYAN**.

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

## 🔄 Cara Menyelaraskan (Sync) Kode antara GitHub, VS Code, & AI Studio

Agar project Anda di Web AI Studio, Local PC (VS Code), dan GitHub bisa sealur:

### 1. Masalah Tarik-Menarik (Konflik Git Push Rejects)
Masalah `"hint: Updates were rejected because the tip of your current branch is behind"`:
Ini terjadi karena **AI Studio (atau GitHub langsung) baru saja membuat commit baru** (misalnya menambahkan config deployment), tapi di komputer Anda (VS Code) commit tersebut belum ditarik (`pull`).
**Solusinya:**
```bash
# Tarik dulu perubahan terbaru dari GitHub ke local VS Code Anda
git pull origin main

# Jika muncul jendela interaktif ".git/COMMIT_EDITMSG" di VS code:
# Cukup simpan (Ctrl + S) lalu tutup jendela file tersebut (Ctrl + W), dan proses merge akan selesai otomatis.

# Lanjut push lagi dengan aman
git push origin main
```

### 2. Siklus Kerja yang Direkomendasikan
1. **Setiap Pagi/Sebelum Coding di VS Code:** Buka terminal VS Code, jalankan `git pull origin main`. 
2. **Setelah coding (atau minta AI di web untuk bikin fitur):** AI Studio akan nge-commit otomatis di GitHub. Buka VS Code Anda, klik ikon **Sinkronkan Perubahan (Sync Changes)** di panel *Source Control*, atau jalankan `git pull origin main` lagi sebelum edit local.

## 📡 Integrasi Hardware (ESP8266 Mini via MQTT)

Proyek ini telah disesuaikan agar cocok untuk menerima *Trigger* (pemicu) dari perangkat keras aslinya nanti.
File source codenya tersedia di proyek ini: `arduino_esp8266_mqtt.ino` *(bisa Anda download & buka di Arduino IDE).*

### A. Modul Yang Dibutuhkan
1. **Mikrokontroler:** Wemos D1 Mini (ESP8266).
2. **Module Sensor Hama:** Sensor Objek IR (Infrared) FC-51 (Harganya sangat murah, ~Rp 5.000).
3. **Pemantau Baterai (Pilih Salah Satu):**
   - *Paling Akurat:* **Modul INA219** (Sensor arus & tegangan via protokol I2C / pin SDA SCL).
   - *Paling Murah (Hanya Tegangan):* **Rangkaian Voltage Divider (Resistor)** - Wemos D1 Mini maksimal menerima input Analog 3.2V. Jadi wajib menggunakan resistor step-down, *misal: Resistor 100k ohm menyambung dari (+) Baterai ke pin A0, & Resistor 22k ohm untuk membuangnya ke Ground (-)*.
4. **Catu Daya:** Baterai Lithium Ion 18650 & Modul Charger TP4056 (Jika belum build in).

### B. Cara Kerja Sistem Hardware
1. Sensor *IR FC-51* ditembakkan ke arah pintu lubang serangga. 
2. Jika ada hama lewat (*Pin D1 berubah jadi LOW*), mikrokontroler mengirim pesan JSON ke broker MQTT (cth: HiveMQ atau Mosquitto).
3. Secara berkala, pin `A0` (atau I2C INA219) membaca tegangan Li-Po untuk di-publish ke MQTT.
4. Nantinya aplikasi dashboard (React) ini akan *Subscribe* ke broker MQTT Anda memakai `mqtt.js`, mendengarkan topiknya, dan menambahkannya ke *State Chart* secara interaktif!

---

> **Catatan:** Fitur mode Real-time dan login memerlukan koneksi ke Google Apps Script backend (`SCRIPT_URL`). Anda bisa menggunakan mode **Demo Offline** melalui tombol di side-menu untuk melihat tampilan interaktif secara simulasi.
