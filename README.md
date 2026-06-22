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
            │ MQTT TCP 1883            │ MQTT TCP 1883
            ▼                          ▼
     ┌──────────────────────────────────────┐
     │        HiveMQ Public Broker          │
     │        broker.hivemq.com             │
     └──────────┬───────────────────────────┘
                │ MQTT WSS 8884
                ▼
     ┌──────────────────────────────────────┐
     │     Dashboard Web (React + Vite)     │
     │  • Grafik fluktuasi & DHT            │
     │  • Status baterai & relay live       │
     │  • Log deteksi & ekspor Excel        │
     │  • Kontrol relay via tombol          │
     │  • Sinkronisasi Google Sheets        │
     └──────────┬───────────────────────────┘
                │ HTTPS doPost
                ▼
     ┌──────────────────────────────────────┐
     │   Google Apps Script (kode.gs)       │
     │   Google Sheets sebagai database     │
     └──────────────────────────────────────┘

     NodeMCU ──HTTPS──► Telegram Bot API
     (notifikasi deteksi & relay, kontrol /relayon /relayoff)
```

---

## Fitur Dashboard

### Monitoring Real-time
- Grafik **Fluktuasi Kedatangan** per node — rentang: hari ini / 3 hari / 7 hari / minggu / bulan / tahun
- Grafik **Suhu & Kelembaban** (DHT22) per node — rentang waktu identik dengan grafik fluktuasi
- **Status baterai** tegangan (V) dan persentase tiap node secara live
- **Status relay** ON/OFF tiap node dengan indikator visual
- **Online/Offline** node dideteksi via heartbeat MQTT (timeout 15 detik)
- **Jumlah tangkapan total** per node dalam sesi berjalan

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

### Konfigurasi Sebelum Upload

Edit bagian ini di `src/main.cpp`:

```cpp
// WiFi
const char* ssid     = "NamaWiFiAnda";
const char* password = "PasswordWiFi";

// Telegram (opsional — kosongkan placeholder jika tidak pakai)
#define BOT_TOKEN  "token_dari_botfather"
#define CHAT_ID    "chat_id_dari_userinfobot"
```

> Jika `BOT_TOKEN` tetap `"YOUR_BOT_TOKEN_HERE"`, fitur Telegram dinonaktifkan otomatis saat boot.

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
| MQTT (browser) | mqtt.js (WSS 8884) |
| PWA | vite-plugin-pwa |
| Icons | Lucide React |
| Export Excel | SheetJS (xlsx) |
| Firmware | Arduino / PlatformIO (ESP8266) |
| Komunikasi IoT | MQTT via HiveMQ public broker |
| Database | Google Sheets via Apps Script |
| Notifikasi | Telegram Bot (UniversalTelegramBot) |
| Deploy | GitHub Pages (branch gh-pages) |

---

## Author

**Riyan (2305125)** — Politeknik LPP Yogyakarta  
Sistem Monitoring Light Trap UPDKS — 2026
