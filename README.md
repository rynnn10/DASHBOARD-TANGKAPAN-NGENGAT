# 🦟 Dashboard Tangkapan Ngengat

Dashboard monitoring real-time sistem light trap penangkapan ngengat berbasis IoT. Menampilkan data dari dua node ESP8266 (NodeMCU v3) yang dilengkapi sensor IR, lampu UV, relay terjadwal DS3231, sensor DHT22, dan monitoring baterai — dengan integrasi Telegram Bot untuk notifikasi dan kontrol jarak jauh.

🌐 **Live Demo:** [rynnn10.github.io/DASHBOARD-TANGKAPAN-NGENGAT](https://rynnn10.github.io/DASHBOARD-TANGKAPAN-NGENGAT/)

---

## Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────────┐
│                    HARDWARE (2 NodeMCU v3)                  │
│                                                             │
│  ┌──────────────────┐        ┌──────────────────┐          │
│  │  Node A (UV 365nm) │       │  Node B (UV 395nm) │        │
│  │  IR Sensor (D1)  │        │  IR Sensor (D1)  │          │
│  │  DHT22 (D2)      │        │  DHT22 (D2)      │          │
│  │  DS3231 (D5/D6)  │        │  DS3231 (D5/D6)  │          │
│  │  Relay (D7)      │        │  Relay (D7)      │          │
│  │  Baterai (A0)    │        │  Baterai (A0)    │          │
│  └────────┬─────────┘        └────────┬─────────┘          │
└───────────┼──────────────────────────┼────────────────────┘
            │ MQTT 1883 (publik) /     │ 8883 TLS (HiveMQ Cloud)
            ▼                          ▼
     ┌──────────────────────────────────────┐
     │   MQTT Broker (dapat dikonfigurasi)  │
     │   • broker.hivemq.com (publik)       │
     │   • HiveMQ Cloud (auth + TLS) ✅      │
     └──────────┬───────────────────────────┘
                │ MQTT WSS 8884 (+auth)
                ▼
     ┌──────────────────────────────────────┐
     │     Dashboard Web (React + Vite)     │
     │  • Grafik fluktuasi & DHT            │
     │  • Status baterai/relay/sinyal WiFi  │
     │  • Online via MQTT LWT + badge DB    │
     │  • Log deteksi & ekspor Excel        │
     │  • Kontrol relay + reset total       │
     │  • Sinkronisasi Google Sheets        │
     └──────────┬───────────────────────────┘
                │ HTTPS doPost
                ▼
     ┌──────────────────────────────────────┐
     │   Google Apps Script (kode.gs)       │
     │   Google Sheets sebagai database     │
     └──────────────────────────────────────┘

     NodeMCU ──HTTPS(TLS)──► Telegram Bot API
     (notif deteksi/relay/baterai, kontrol /status /relayon /relayoff /auto)
```

---

## Fitur Dashboard

### Monitoring Real-time
- Grafik **Fluktuasi Kedatangan** per node — rentang: hari ini / 3 hari / 7 hari / minggu / bulan / tahun
- Grafik **Suhu & Kelembaban** (DHT22) per node — rentang waktu identik dengan grafik fluktuasi
- **Status baterai** tegangan (V) dan persentase tiap node secara live
- **Status relay** ON/OFF tiap node dengan indikator visual
- **Online/Offline** node dari **MQTT LWT** (Last Will — koneksi MQTT asli node, bukan tebakan)
- **SSID & kekuatan sinyal WiFi** + **status hardware (boot test)** per node
- **Jumlah tangkapan** per node (total tersimpan + total hari ini)

### Kontrol & Manajemen
- **Kontrol relay** Node A & Node B langsung dari popup Pengaturan via MQTT
- **Mode Demo** — data simulasi tanpa hardware, untuk presentasi
- **Mode Data Asli** — terhubung ke NodeMCU via MQTT real-time
- **Sinkronisasi Google Sheets** otomatis saat terkoneksi kembali
- **Buffer data offline** — data tetap tersimpan saat WiFi NodeMCU putus, dikirim ulang saat online
- **Ekspor Excel** tabel log deteksi

### Tampilan & UX
- Dark mode / Light mode / Mengikuti sistem
- PWA (Progressive Web App) — bisa dipasang di Android/iOS sebagai app
- Responsif mobile & desktop
- Log deteksi dengan pagination dan nomor urut

### Pengaturan (Popup)
- Kontrol relay ON/OFF per node (Node A & Node B, masing-masing terpisah)
- Toggle buffer data baterai offline
- Panduan wiring modul ke NodeMCU ESP8266
- Manajemen sheet Google Sheets tidak terpakai

---

## Hardware — NodeMCU v3 (ESP8266)

### Daftar Komponen

| Komponen | Fungsi |
|---|---|
| NodeMCU v3 (ESP8266) | Mikrokontroler utama + WiFi |
| Sensor IR (FC-51 / TCRT5000) | Mendeteksi ngengat yang melewati sensor |
| DHT22 | Mengukur suhu & kelembaban udara |
| DS3231 RTC | Jam real-time untuk jadwal relay otomatis |
| Relay 1 Channel (Active LOW) | Menghidupkan/mematikan lampu UV |
| Lampu UV | Node A: 365nm / Node B: 395nm |
| Baterai + Voltage Divider | Sumber daya & monitoring tegangan via ADC |

### Wiring Pin (sama untuk Node A dan Node B)

| Modul | Pin Modul | Pin NodeMCU | GPIO |
|---|---|---|---|
| Sensor IR | OUT | D1 | GPIO5 |
| DHT22 | DATA | D2 | GPIO4 |
| DS3231 | SDA | D5 | GPIO14 |
| DS3231 | SCL | D6 | GPIO12 |
| Relay | IN | D7 | GPIO13 |
| Baterai | + (via divider R) | A0 | ADC |
| DS3231, DHT22 | VCC | 3.3V | — |
| DS3231, DHT22 | GND | GND | — |
| Relay, IR Sensor | VCC | VIN (5V) | — |
| Relay, IR Sensor | GND | GND | — |

> **Relay Active LOW:** IN=LOW → relay ON (lampu menyala), IN=HIGH → relay OFF.

### Jadwal Relay Otomatis (DS3231)

| Waktu | Status Relay | Lampu UV |
|---|---|---|
| 18:00 → 06:00 | ON | Menyala |
| 06:00 → 18:00 | OFF | Mati |

Jadwal dapat dioverride manual via tombol di dashboard atau perintah Telegram. Gunakan `/auto` untuk kembali ke jadwal otomatis.

---

## MQTT Topics

| Topic | Arah | Payload JSON | Keterangan |
|---|---|---|---|
| `dashboard/ngengat/deteksi` | NodeMCU → Dashboard | `{"node":"A","status":"terdeteksi","ts":1234567890}` | IR sensor terpicu |
| `dashboard/ngengat/baterai` | NodeMCU → Dashboard | `{"node":"A","voltage":3.85,"percentage":72,"relay":true}` | Status tiap 10 detik |
| `dashboard/ngengat/lingkungan` | NodeMCU → Dashboard | `{"node":"A","temp":28.5,"humidity":75}` | DHT22 tiap 30 detik |
| `dashboard/ngengat/relay` | Dashboard → NodeMCU | `{"node":"A","state":true}` | Perintah relay dari dashboard |

> Data buffer offline dikirim dengan tambahan field `"buffered": true`.

---

## Firmware ESP8266

### Struktur Folder

```
Sensor_Ngengat/            ← Node A (UV 365nm)
├── src/main.cpp
└── platformio.ini

Sensor_Ngengat_NodeB/      ← Node B (UV 395nm)
├── src/main.cpp
└── platformio.ini
```

### Perbedaan Node A vs Node B

| | Node A | Node B |
|---|---|---|
| `nodeId` | `"A"` | `"B"` |
| Lampu | UV 365nm | UV 395nm |
| MQTT `clientId` prefix | `ESP8266Client-` | `ESP8266NodeB-` |
| Pin, logika, timing | Identik | Identik |

### Library Dependencies (platformio.ini)

```ini
[env:nodemcuv2]
platform = espressif8266
board = nodemcuv2
framework = arduino
monitor_speed = 115200
lib_deps =
    knolleary/PubSubClient@^2.8.0
    adafruit/DHT sensor library@^1.4.6
    adafruit/Adafruit Unified Sensor@^1.1.14
    adafruit/RTClib@^2.1.4
    https://github.com/witnessmenow/Universal-Arduino-Telegram-Bot.git
    bblanchon/ArduinoJson@^6.21.3
```

### Konfigurasi Kredensial (`secrets.h`)

> 🆕 **Penting:** kredensial **tidak lagi ditulis di `main.cpp`**, melainkan di file terpisah **`src/secrets.h`** yang sudah masuk `.gitignore` (tidak ikut ter-commit ke repo).

1. Salin template → buat file rahasia:
   `src/secrets.h.example` ➜ **`src/secrets.h`**
2. Isi nilainya (lakukan untuk **kedua** project, Node A & Node B):

```cpp
#define SECRET_WIFI_SSID  "NamaWiFiAnda"
#define SECRET_WIFI_PASS  "PasswordWiFi"

// ── MQTT broker (default = broker publik; lihat Tutorial HiveMQ Cloud di bawah) ──
#define SECRET_MQTT_TLS   0                    // 0 = tanpa TLS, 1 = HiveMQ Cloud (TLS)
#define SECRET_MQTT_HOST  "broker.hivemq.com"  // ⟶ "xxxx.s1.eu.hivemq.cloud"
#define SECRET_MQTT_PORT  1883                 // ⟶ 8883 untuk HiveMQ Cloud
#define SECRET_MQTT_USER  ""                   // ⟶ username cluster
#define SECRET_MQTT_PASS  ""                   // ⟶ password cluster

// ── Telegram (opsional) ──
#define SECRET_TG_BOT_TOKEN  "token_dari_botfather"
#define SECRET_TG_CHAT_ID    "chat_id_dari_userinfobot"
```

> ⚠️ Jika `secrets.h` belum dibuat, **compile akan gagal** — wajib disalin dari `.example` lebih dulu.
> Jika token Telegram dibiarkan placeholder, fitur Telegram dinonaktifkan otomatis saat boot.

### Cara Upload Firmware

1. Install [PlatformIO IDE](https://platformio.org/) (ekstensi VS Code)
2. Buka folder `Sensor_Ngengat/` atau `Sensor_Ngengat_NodeB/`
3. Hubungkan NodeMCU v3 via USB
4. Klik **Build** → **Upload** di toolbar PlatformIO
5. Buka **Serial Monitor** (115200 baud) untuk melihat log

---

## Telegram Bot

### Setup

1. Buka Telegram → cari **@BotFather** → `/newbot` → ikuti langkah → salin **Bot Token**
2. Cari **@userinfobot** → `/start` → salin **Chat ID** (angka)
3. Isi di `src/main.cpp` kedua node → upload ulang

### Perintah Telegram

| Perintah | Fungsi |
|---|---|
| `/status` | Tampilkan relay, mode (auto/manual), baterai, suhu, kelembaban, jumlah tangkapan |
| `/relayon` | Nyalakan relay (mode manual) |
| `/relayoff` | Matikan relay (mode manual) |
| `/auto` | Kembalikan ke jadwal otomatis DS3231 |
| `/help` | Tampilkan daftar perintah |

### Notifikasi Otomatis

| Kejadian | Pesan Dikirim |
|---|---|
| IR sensor terpicu | Ngengat terdeteksi + waktu + total sesi |
| Relay ON otomatis (18:00) | Lampu menyala + waktu |
| Relay OFF otomatis (06:00) | Lampu mati + waktu |
| Relay diubah dari dashboard | Konfirmasi perubahan + waktu |

---

## Google Apps Script (Backend)

File `kode.gs` dideploy sebagai **Web App** di Google Apps Script — berfungsi sebagai REST API yang menyimpan & mengambil data dari Google Sheets.

### Cara Deploy

1. Buka [script.google.com](https://script.google.com/) → **New Project**
2. Paste isi file `kode.gs`
3. Klik **Deploy** → **New Deployment** → tipe: **Web App**
4. Execute as: **Me** | Who has access: **Anyone**
5. Salin URL deployment
6. Paste di kolom **URL Google Sheet** di pengaturan dashboard (mode Data Asli)

### 🔄 Sinkronisasi Otomatis via `clasp` (opsional)

Agar `kode.gs` lokal langsung tersinkron ke Apps Script tanpa copy-paste manual:

**Setup sekali:**
1. Aktifkan **Apps Script API**: https://script.google.com/home/usersettings → ON
2. `npm install` (clasp sudah jadi devDependency) lalu **login**: `npx clasp login`
3. Salin **Script ID** (Apps Script → ⚙️ Project Settings) ke file `.clasp.json`:
   - `cp .clasp.json.example .clasp.json` → isi `scriptId`
4. Salin **Deployment ID** (Deploy → Manage deployments) → ganti `PASTE_DEPLOYMENT_ID` di skrip `gas:deploy` (package.json).

**Pemakaian:**
```bash
npm run gas:push     # upload kode.gs ke Apps Script (editor)
npm run gas:watch    # auto-upload tiap kali kode.gs disimpan
npm run gas:deploy   # push + update deployment (URL Web App TETAP sama)
```

> ⚠️ `gas:push` hanya update **editor** Apps Script. Live Web App baru berubah setelah `gas:deploy` (atau redeploy manual).
> ⚠️ **Push pertama menimpa kode online** dengan `kode.gs` lokal — pastikan lokal sudah versi terbaru. `.clasp.json` & manifest `appsscript.json` mengatur scriptId & setting Web App (Execute as Me, Akses Anyone).
> ⚠️ Deploy ke **deployment ID yang ada** (`-i`) menjaga URL tetap sama; tanpa itu, tiap deploy membuat URL baru.

### Sheet yang Dibuat Otomatis

| Sheet | Isi |
|---|---|
| `Status_DataAsli_A` | Log deteksi IR Node A |
| `Status_DataAsli_B` | Log deteksi IR Node B |
| `Ringkasan_DataAsli_A` | Ringkasan sesi Node A |
| `Ringkasan_DataAsli_B` | Ringkasan sesi Node B |
| `Baterai_DataAsli_A` | Data baterai Node A |
| `Baterai_DataAsli_B` | Data baterai Node B |
| `Lingkungan` | Data suhu & kelembaban kedua node (DHT22) |

---

## Dashboard Web

### Menjalankan Lokal

```bash
# Clone repository
git clone https://github.com/rynnn10/DASHBOARD-TANGKAPAN-NGENGAT.git
cd DASHBOARD-TANGKAPAN-NGENGAT

# Install dependensi
npm install

# Jalankan development server
npm run dev
# → http://localhost:3000
```

### Konfigurasi `.env` (Dashboard)

> 🆕 URL backend & broker MQTT dibaca dari **environment variables** (file `.env` di root project, sudah `.gitignore`). Buat file `.env`:

```ini
# Backend Google Apps Script
VITE_GAS_URL=https://script.google.com/macros/s/XXXX/exec

# MQTT broker — kosongkan untuk pakai broker publik default.
# Untuk HiveMQ Cloud (lihat tutorial di bawah):
VITE_MQTT_URL=wss://xxxx.s1.eu.hivemq.cloud:8884/mqtt
VITE_MQTT_USER=username_cluster
VITE_MQTT_PASS=password_cluster
```

> Variabel `VITE_*` di-inline saat **build**. Jalankan ulang `npm run dev` / `npm run build` setelah mengubah `.env`.

### Build Production

```bash
npm run build
# Output ke folder dist/
```

### Deploy ke GitHub Pages

```bash
npm run deploy
# Otomatis push dist/ ke branch gh-pages
```

---

## Struktur Project Dashboard

```
DASHBOARD-TANGKAPAN-NGENGAT/
├── src/
│   ├── App.tsx          ← Komponen utama (UI + logika MQTT + state)
│   └── global.d.ts      ← TypeScript declarations
├── index.html           ← Entry HTML
├── vite.config.ts       ← Konfigurasi Vite + PWA
├── package.json
├── kode.gs              ← Backend Google Apps Script
└── README.md
```

---

## Tech Stack

| Layer | Teknologi |
|---|---|
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS v4 |
| Chart | Recharts |
| MQTT (browser) | mqtt.js (WSS 8884, + username/password) |
| PWA | vite-plugin-pwa |
| Icons | Lucide React |
| Export Excel | SheetJS (xlsx) |
| Firmware | Arduino / PlatformIO (ESP8266) |
| MQTT (ESP) | PubSubClient — TCP 1883 (publik) / TLS 8883 (HiveMQ Cloud) |
| Komunikasi IoT | MQTT — broker publik **atau** HiveMQ Cloud (auth + TLS) |
| Kredensial | `secrets.h` (firmware) & `.env` (web) — di luar repo |
| Database | Google Sheets via Apps Script |
| Notifikasi | Telegram Bot (UniversalTelegramBot, parse mode HTML) |
| Deploy | GitHub Pages (branch gh-pages) |

---

## 🔐 Tutorial: Migrasi ke HiveMQ Cloud (Auth + TLS)

Secara default sistem memakai **broker publik** `broker.hivemq.com` (tanpa autentikasi — siapa pun bisa mengintip/memalsukan topik). Untuk lebih aman, pindah ke **HiveMQ Cloud** (gratis) yang mendukung username/password + TLS.

### A. Buat Cluster
1. Daftar di **https://console.hivemq.cloud** (gratis, tanpa kartu kredit).
2. **Create Cluster** → paket **Serverless (Free)** → tunggu status **Running**.
3. Catat **Cluster URL (Host)**, mis. `15110d5cd284483caac8b614ac358354.s1.eu.hivemq.cloud`.

### B. Buat Kredensial
- Tab **Access Management / Credentials** → **Add** → isi **Username** & **Password** (izin **Publish & Subscribe**).

### C. Port yang dipakai
| Port | Protokol | Untuk |
|---|---|---|
| **8883** | MQTT over TLS (TCP) | **Firmware ESP** |
| **8884** | MQTT over WebSocket Secure | **Dashboard web** (`wss://...:8884/mqtt`) |

### D. Konfigurasi Firmware (`secrets.h`, kedua node)
```cpp
#define SECRET_MQTT_TLS   1                                          // aktifkan TLS
#define SECRET_MQTT_HOST  "xxxx.s1.eu.hivemq.cloud"                  // host cluster Anda
#define SECRET_MQTT_PORT  8883
#define SECRET_MQTT_USER  "username_cluster"
#define SECRET_MQTT_PASS  "password_cluster"
```
Lalu **flash ulang** kedua ESP. Saat `TLS=1`, firmware otomatis memakai `WiFiClientSecure` + buffer kecil (MFLN) agar muat di RAM ESP8266.

### E. Konfigurasi Dashboard (`.env`)
```ini
VITE_MQTT_URL=wss://xxxx.s1.eu.hivemq.cloud:8884/mqtt
VITE_MQTT_USER=username_cluster
VITE_MQTT_PASS=password_cluster
```
Lalu `npm run deploy`. **Firmware & web wajib pakai cluster yang sama.**

### F. Verifikasi
- Serial ESP: `MQTT terhubung!` (ke cluster TLS).
- Web: kedua node **Online**, deteksi masuk realtime.
- Console HiveMQ → **Web Client** → subscribe `dashboard/ngengat/#` → lihat pesan ESP.

### Troubleshooting
| Gejala | Solusi |
|---|---|
| `rc=-2` berulang | Host/port salah (host tanpa `wss://`, port 8883). |
| `rc=4` / `rc=5` | Username/password salah. |
| ESP restart/crash | RAM kurang (2 TLS). Pantau monitor RAM di serial; bila perlu nonaktifkan Telegram. |
| Web tak konek | Pakai port **8884** + awalan `wss://` + akhiran `/mqtt`. |

> ⚠️ Kredensial pada dashboard ikut ke **bundle publik** (terlihat saat inspect) — broker auth tetap jauh lebih aman dari broker publik, namun untuk rahasia penuh perlu proxy/backend.

---

## 🆕 Pembaruan Terbaru

| Area | Perubahan |
|---|---|
| **Keamanan** | Kredensial dipindah ke `secrets.h` (firmware) & `.env` (web) — tidak ter-commit. Dukungan **MQTT auth + TLS** (HiveMQ Cloud). |
| **Akurasi data** | **ID deteksi stabil** (`did = node-bootRand-seq`) dari firmware → cegah hitungan ganda saat dibuka di banyak device. Pengaman anti-hapus & self-heal total dari Logs. |
| **Sensor IR** | Deteksi via **interrupt** + debounce → tak terlewat saat sibuk; diagnostic tepi sensor di serial. |
| **Status node** | Online/offline kini dari **MQTT LWT** (koneksi asli), bukan tebakan heartbeat. Relay tampil **"Tidak diketahui"** saat node offline. |
| **Waktu** | Sinkronisasi **NTP non-blocking** + koreksi RTC ke WIB. Format waktu WIB eksplisit di sheet. |
| **Telegram** | Pesan pakai **HTML** (lebih kokoh dari MarkdownV2). Total = **tangkapan hari ini**; jam aktif perintah dapat diatur dari web. Prioritas: deteksi & relay selalu didahulukan. |
| **Database** | Sheet **`Efektivitas_Harian`** (total/hari/node) & **`Log_Alarm`** (eksekusi alarm). Validasi sesi via **`Log_Login`** (hapus baris → device login ulang). |
| **Dashboard** | Badge **DB Terhubung/Gagal**, **SSID + kekuatan sinyal WiFi** per node, status hardware boot-test, **reset total opsional** (hapus semua data sheet kecuali akun), jam aktif Telegram. |
| **Identitas** | Hostname per node (`Sensor-Ngengat-NodeA/B`) tampil di router. |

> Detail tiap perubahan ada di komentar kode `main.cpp`, `App.tsx`, dan `kode.gs`.

---

## Author

**Riyan (2305125)** — Politeknik LPP Yogyakarta  
Sistem Monitoring Light Trap UPDKS — 2026
