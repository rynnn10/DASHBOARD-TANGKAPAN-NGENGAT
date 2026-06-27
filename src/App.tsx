// ============================================================
// Dashboard Tangkapan Ngengat — Aplikasi utama (React)
// Terakhir diperbarui: Sabtu, 27 Juni 2026 12:07 WIB
// ============================================================
import React, { useState, useEffect } from "react";
import {
  Leaf,
  X,
  PieChart,
  List,
  Settings,
  Menu,
  Clock,
  Settings as SettingsIcon,
  Bug,
  Wifi,
  Battery,
  BatteryMedium,
  Lightbulb,
  RotateCcw,
  Microscope,
  SatelliteDish,
  CheckCircle2,
  Edit2,
  Camera,
  Save,
  Image as ImageIcon,
  Download,
  Database,
  Loader2,
  Copy,
  LogIn,
  Eye,
  EyeOff,
  AlertCircle,
  Thermometer,
  Droplets,
  Wind,
  Cpu,
  Zap,
  Cable,
  Info,
  Lock,
  RefreshCw,
} from "lucide-react";
import type { MqttClient } from "mqtt";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  ErrorBar,
} from "recharts";
import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useRegisterSW } from "virtual:pwa-register/react";
const safeParseDate = (dateStr: any) => {
  if (!dateStr) return new Date();
  const d = new Date(dateStr);
  if (isNaN(d.getTime()) && typeof dateStr === "string") {
    const parts = dateStr.split(/[Ts]/);
    const dParts = parts[0].split(/[/-]/);
    if (dParts.length === 3) {
      let day = dParts[0],
        month = dParts[1],
        year = dParts[2];
      if (year.length === 2) {
        year = dParts[0];
        day = dParts[2];
      }
      return new Date(`${year}-${month}-${day}T${parts[1] || "00:00:00"}`);
    }
  }
  return d;
};

const SCRIPT_URL = import.meta.env.VITE_GAS_URL || "";

// ── KONFIGURASI MQTT BROKER ─────────────────────────────────────────────
// Default: broker publik lama (tanpa auth). Untuk HiveMQ Cloud (auth+TLS):
//   MQTT_URL  = "wss://<cluster>.s1.eu.hivemq.cloud:8884/mqtt"
//   MQTT_USER = "username_cluster", MQTT_PASS = "password_cluster"
// CATATAN: nilai ini ikut ke bundle publik (terlihat saat inspect) — wajar untuk skala hobi.
// Bisa diisi via env (VITE_MQTT_*) atau langsung di sini.
const MQTT_URL =
  import.meta.env.VITE_MQTT_URL || "wss://broker.hivemq.com:8884/mqtt";
const MQTT_USER = import.meta.env.VITE_MQTT_USER || "";
const MQTT_PASS = import.meta.env.VITE_MQTT_PASS || "";

// POST ke GAS dengan auto-retry — atasi "gagal menghubungi server" akibat cold
// start Apps Script (request pertama lambat / sempat balas non-JSON). Coba ulang
// beberapa kali dengan jeda sebelum benar-benar dianggap gagal.
async function postWithRetry(
  body: any,
  retries = 2,
  delayMs = 1500,
): Promise<any> {
  let lastErr: any = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body),
      });
      // .json() bisa melempar jika GAS balas HTML error saat baru bangun
      return await response.json();
    } catch (e) {
      lastErr = e;
      if (attempt < retries)
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
  throw lastErr;
}

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const HARI_NAMA = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];
const BULAN_NAMA = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Ags",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

// Tentukan node dari sumber log (selaras dengan logika di kode.gs)
function logNodeKey(source: string): "NodeA" | "NodeB" | null {
  if (!source) return null;
  if (source.indexOf("365") !== -1 || source.indexOf("A") !== -1)
    return "NodeA";
  if (source.indexOf("395") !== -1 || source.indexOf("B") !== -1)
    return "NodeB";
  return null;
}

// Format timestamp bucket untuk tooltip grafik
function fmtBucketTs(startMs: number): string {
  const d = new Date(startMs);
  const hari = HARI_NAMA[d.getDay()];
  const tgl = d.getDate();
  const bln = BULAN_NAMA[d.getMonth()];
  const yr = d.getFullYear();
  const jam = d.getHours(), mnt = d.getMinutes();
  const waktu = (jam || mnt) ? ` ${String(jam).padStart(2,'0')}:${String(mnt).padStart(2,'0')}` : '';
  return `${hari}, ${tgl} ${bln} ${yr}${waktu}`;
}

// Bangun data grafik time-series dari LOG NYATA (dipakai di Mode Asli).
// Mengembalikan [] jika tidak ada tangkapan sama sekali (agar empty-state tampil).
function buildChartFromLogs(
  logs: any[],
  range: "hari" | "minggu" | "bulan" | "tahun" | "kustom",
  duration: string,
  customRange?: { start: number; end: number },
): { time: string; startMs: number; NodeA: number; NodeB: number }[] {
  const now = new Date();
  const DAY = 86400000;
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  const buckets: { time: string; start: number; end: number }[] = [];

  if (range === "kustom") {
    if (!customRange || !customRange.start || !customRange.end) return [];
    const { start, end } = customRange;
    const totalDays = Math.ceil((end - start) / DAY);
    if (totalDays <= 0) return [];
    if (totalDays <= 45) {
      for (let i = 0; i < totalDays; i++) {
        const s = start + i * DAY;
        const d = new Date(s);
        buckets.push({ time: `${d.getDate()}/${d.getMonth() + 1}`, start: s, end: s + DAY });
      }
    } else if (totalDays <= 182) {
      const weeks = Math.ceil(totalDays / 7);
      for (let i = 0; i < weeks; i++) {
        const s = start + i * 7 * DAY;
        const d = new Date(s);
        buckets.push({ time: `${d.getDate()}/${d.getMonth() + 1}`, start: s, end: Math.min(s + 7 * DAY, end + 1) });
      }
    } else {
      let cur = new Date(new Date(start).getFullYear(), new Date(start).getMonth(), 1);
      const endD = new Date(end);
      while (cur <= endD) {
        const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
        buckets.push({ time: `${BULAN_NAMA[cur.getMonth()]} ${cur.getFullYear()}`, start: cur.getTime(), end: next.getTime() });
        cur = next;
      }
    }
  } else if (range === "hari") {
    if (duration === "hari_ini") {
      const base = startOfDay(now);
      for (let h = 0; h < 24; h++) {
        const start = base + h * 3600000;
        buckets.push({
          time: `${String(h).padStart(2, "0")}:00`,
          start,
          end: start + 3600000,
        });
      }
    } else {
      const count = duration === "3_hari" ? 3 : 7;
      const base = startOfDay(now);
      for (let i = 0; i < count; i++) {
        const start = base - (count - 1 - i) * DAY;
        const d = new Date(start);
        buckets.push({ time: `${d.getDate()} ${BULAN_NAMA[d.getMonth()]}`, start, end: start + DAY });
      }
    }
  } else if (range === "minggu") {
    const dow = (now.getDay() + 6) % 7; // 0 = Senin
    const monday = startOfDay(now) - dow * DAY;
    if (duration === "minggu_ini") {
      for (let i = 0; i < 7; i++) {
        const start = monday + i * DAY;
        buckets.push({
          time: HARI_NAMA[new Date(start).getDay()],
          start,
          end: start + DAY,
        });
      }
    } else {
      const count = duration === "4_minggu" ? 4 : 7;
      for (let i = 0; i < count; i++) {
        const start = monday - (count - 1 - i) * 7 * DAY;
        const d = new Date(start);
        buckets.push({
          time: `${d.getDate()} ${BULAN_NAMA[d.getMonth()]}`,
          start,
          end: start + 7 * DAY,
        });
      }
    }
  } else if (range === "bulan") {
    if (duration === "bulan_ini") {
      const y = now.getFullYear();
      const m = now.getMonth();
      const ranges = [
        [1, 8],
        [8, 15],
        [15, 22],
        [22, 32],
      ];
      ranges.forEach((r, idx) => {
        buckets.push({
          time: `Minggu ${idx + 1}`,
          start: new Date(y, m, r[0]).getTime(),
          end: new Date(y, m, r[1]).getTime(),
        });
      });
    } else {
      const count = duration === "3_bulan" ? 3 : 6;
      for (let i = 0; i < count; i++) {
        const d = new Date(
          now.getFullYear(),
          now.getMonth() - (count - 1 - i),
          1,
        );
        buckets.push({
          time: BULAN_NAMA[d.getMonth()],
          start: d.getTime(),
          end: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(),
        });
      }
    }
  } else {
    if (duration === "tahun_ini") {
      const y = now.getFullYear();
      for (let mo = 0; mo < 12; mo++) {
        buckets.push({
          time: BULAN_NAMA[mo],
          start: new Date(y, mo, 1).getTime(),
          end: new Date(y, mo + 1, 1).getTime(),
        });
      }
    } else {
      const count = duration === "2_tahun" ? 2 : 5;
      for (let i = 0; i < count; i++) {
        const yr = now.getFullYear() - (count - 1 - i);
        buckets.push({
          time: `${yr}`,
          start: new Date(yr, 0, 1).getTime(),
          end: new Date(yr + 1, 0, 1).getTime(),
        });
      }
    }
  }

  const result = buckets.map((b) => ({ time: b.time, startMs: b.start, NodeA: 0, NodeB: 0 }));
  for (const log of logs || []) {
    const ts =
      typeof log.timestamp === "number"
        ? log.timestamp
        : new Date(log.timestamp).getTime();
    if (!ts) continue;
    const key = logNodeKey(log.source || "");
    if (!key) continue;
    for (let i = 0; i < buckets.length; i++) {
      if (ts >= buckets[i].start && ts < buckets[i].end) {
        result[i][key] += 1;
        break;
      }
    }
  }

  const hasData = result.some((r) => r.NodeA > 0 || r.NodeB > 0);
  return hasData ? result : [];
}

// Kunci tanggal lokal (WIB di perangkat pengguna) "YYYY-MM-DD" dari epoch ms
function localDateKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Hitung total ngengat PER HARI per node dari logs → untuk DB Efektivitas Harian
function computeDailyEffect(
  logs: any[],
): { date: string; day: string; NodeA: number; NodeB: number }[] {
  const map: Record<string, { NodeA: number; NodeB: number }> = {};
  for (const log of logs || []) {
    const ts =
      typeof log.timestamp === "number"
        ? log.timestamp
        : new Date(log.timestamp).getTime();
    if (!ts) continue;
    const key = logNodeKey(log.source || "");
    if (!key) continue;
    const dk = localDateKey(ts);
    if (!map[dk]) map[dk] = { NodeA: 0, NodeB: 0 };
    map[dk][key] += 1;
  }
  return Object.keys(map)
    .sort()
    .reverse()
    .map((dk) => {
      const d = new Date(dk + "T00:00:00");
      return {
        date: dk,
        day: HARI_NAMA[d.getDay()],
        NodeA: map[dk].NodeA,
        NodeB: map[dk].NodeB,
      };
    });
}

// Tampilan WiFi node: SSID + ikon batang sinyal (1–4 bar) + nilai dBm.
// Level RSSI: ≥−60 kuat penuh, ≥−67 baik, ≥−75 sedang, ≥−85 lemah.
function WifiSignal({ ssid, rssi }: { ssid?: string; rssi?: number }) {
  if (rssi === undefined || rssi === 0) return null;
  const level =
    rssi >= -60 ? 4 : rssi >= -67 ? 3 : rssi >= -75 ? 2 : rssi >= -85 ? 1 : 0;
  const barColor =
    level >= 3 ? "bg-emerald-500" : level === 2 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
        <Wifi className="w-3.5 h-3.5" /> WiFi
      </span>
      <span className="font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
        <span className="truncate max-w-[90px]" title={ssid}>
          {ssid || "-"}
        </span>
        <span className="flex items-end gap-[2px] h-3.5">
          {[1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={cn(
                "w-1 rounded-sm",
                i <= level ? barColor : "bg-gray-200 dark:bg-gray-700",
              )}
              style={{ height: `${i * 25}%` }}
            />
          ))}
        </span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
          {rssi} dBm
        </span>
      </span>
    </div>
  );
}

function buildDhtChartFromHistory(
  history: {
    timestamp: number;
    node: string;
    temp: number;
    humidity: number;
  }[],
  range: "hari" | "minggu" | "bulan" | "tahun" | "kustom",
  duration: string,
  customRange?: { start: number; end: number },
): {
  time: string;
  startMs: number;
  tempA: number | null;
  humA: number | null;
  tempB: number | null;
  humB: number | null;
  tempA_sd: number | null;
  humA_sd: number | null;
  tempB_sd: number | null;
  humB_sd: number | null;
}[] {
  const now = new Date();
  const DAY = 86400000;
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  const buckets: { time: string; start: number; end: number }[] = [];

  if (range === "kustom") {
    if (!customRange || !customRange.start || !customRange.end) return [];
    const { start, end } = customRange;
    const totalDays = Math.ceil((end - start) / DAY);
    if (totalDays <= 0) return [];
    if (totalDays <= 45) {
      for (let i = 0; i < totalDays; i++) {
        const s = start + i * DAY;
        const d = new Date(s);
        buckets.push({ time: `${d.getDate()}/${d.getMonth() + 1}`, start: s, end: s + DAY });
      }
    } else if (totalDays <= 182) {
      const weeks = Math.ceil(totalDays / 7);
      for (let i = 0; i < weeks; i++) {
        const s = start + i * 7 * DAY;
        const d = new Date(s);
        buckets.push({ time: `${d.getDate()}/${d.getMonth() + 1}`, start: s, end: Math.min(s + 7 * DAY, end + 1) });
      }
    } else {
      let cur = new Date(new Date(start).getFullYear(), new Date(start).getMonth(), 1);
      const endD = new Date(end);
      while (cur <= endD) {
        const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
        buckets.push({ time: `${BULAN_NAMA[cur.getMonth()]} ${cur.getFullYear()}`, start: cur.getTime(), end: next.getTime() });
        cur = next;
      }
    }
  } else if (range === "hari") {
    if (duration === "hari_ini") {
      const base = startOfDay(now);
      for (let h = 0; h < 24; h++) {
        const start = base + h * 3600000;
        buckets.push({
          time: `${String(h).padStart(2, "0")}:00`,
          start,
          end: start + 3600000,
        });
      }
    } else {
      const count = duration === "3_hari" ? 3 : 7;
      const base = startOfDay(now);
      for (let i = 0; i < count; i++) {
        const start = base - (count - 1 - i) * DAY;
        const d = new Date(start);
        buckets.push({ time: `${d.getDate()} ${BULAN_NAMA[d.getMonth()]}`, start, end: start + DAY });
      }
    }
  } else if (range === "minggu") {
    const dow = (now.getDay() + 6) % 7;
    const monday = startOfDay(now) - dow * DAY;
    if (duration === "minggu_ini") {
      for (let i = 0; i < 7; i++) {
        const start = monday + i * DAY;
        buckets.push({
          time: HARI_NAMA[new Date(start).getDay()],
          start,
          end: start + DAY,
        });
      }
    } else {
      const count = duration === "4_minggu" ? 4 : 7;
      for (let i = 0; i < count; i++) {
        const start = monday - (count - 1 - i) * 7 * DAY;
        const d = new Date(start);
        buckets.push({
          time: `${d.getDate()} ${BULAN_NAMA[d.getMonth()]}`,
          start,
          end: start + 7 * DAY,
        });
      }
    }
  } else if (range === "bulan") {
    if (duration === "bulan_ini") {
      const y = now.getFullYear();
      const m = now.getMonth();
      (
        [
          [1, 8],
          [8, 15],
          [15, 22],
          [22, 32],
        ] as [number, number][]
      ).forEach((r, idx) => {
        buckets.push({
          time: `Minggu ${idx + 1}`,
          start: new Date(y, m, r[0]).getTime(),
          end: new Date(y, m, r[1]).getTime(),
        });
      });
    } else {
      const count = duration === "3_bulan" ? 3 : 6;
      for (let i = 0; i < count; i++) {
        const d = new Date(
          now.getFullYear(),
          now.getMonth() - (count - 1 - i),
          1,
        );
        buckets.push({
          time: BULAN_NAMA[d.getMonth()],
          start: d.getTime(),
          end: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(),
        });
      }
    }
  } else {
    if (duration === "tahun_ini") {
      const y = now.getFullYear();
      for (let mo = 0; mo < 12; mo++) {
        buckets.push({
          time: BULAN_NAMA[mo],
          start: new Date(y, mo, 1).getTime(),
          end: new Date(y, mo + 1, 1).getTime(),
        });
      }
    } else {
      const count = duration === "2_tahun" ? 2 : 5;
      for (let i = 0; i < count; i++) {
        const yr = now.getFullYear() - (count - 1 - i);
        buckets.push({
          time: `${yr}`,
          start: new Date(yr, 0, 1).getTime(),
          end: new Date(yr + 1, 0, 1).getTime(),
        });
      }
    }
  }

  const accum = buckets.map(() => ({
    sumTempA: 0, sumSqTempA: 0, cntA: 0, sumHumA: 0, sumSqHumA: 0,
    sumTempB: 0, sumSqTempB: 0, cntB: 0, sumHumB: 0, sumSqHumB: 0,
  }));

  for (const r of history || []) {
    const ts =
      typeof r.timestamp === "number" ? r.timestamp : Number(r.timestamp);
    if (!ts) continue;
    for (let i = 0; i < buckets.length; i++) {
      if (ts >= buckets[i].start && ts < buckets[i].end) {
        if (r.node === "A") {
          accum[i].sumTempA += r.temp;
          accum[i].sumSqTempA += r.temp * r.temp;
          accum[i].sumHumA += r.humidity;
          accum[i].sumSqHumA += r.humidity * r.humidity;
          accum[i].cntA++;
        } else {
          accum[i].sumTempB += r.temp;
          accum[i].sumSqTempB += r.temp * r.temp;
          accum[i].sumHumB += r.humidity;
          accum[i].sumSqHumB += r.humidity * r.humidity;
          accum[i].cntB++;
        }
        break;
      }
    }
  }

  const sdCalc = (sum: number, sumSq: number, n: number) =>
    n > 1 ? Number(Math.sqrt(Math.max(0, (sumSq - (sum * sum) / n) / (n - 1))).toFixed(2)) : null;

  return buckets.map((b, i) => ({
    time: b.time,
    startMs: b.start,
    tempA: accum[i].cntA > 0 ? Number((accum[i].sumTempA / accum[i].cntA).toFixed(1)) : null,
    humA:  accum[i].cntA > 0 ? Number((accum[i].sumHumA  / accum[i].cntA).toFixed(1)) : null,
    tempB: accum[i].cntB > 0 ? Number((accum[i].sumTempB / accum[i].cntB).toFixed(1)) : null,
    humB:  accum[i].cntB > 0 ? Number((accum[i].sumHumB  / accum[i].cntB).toFixed(1)) : null,
    tempA_sd: accum[i].cntA > 1 ? sdCalc(accum[i].sumTempA, accum[i].sumSqTempA, accum[i].cntA) : null,
    humA_sd:  accum[i].cntA > 1 ? sdCalc(accum[i].sumHumA,  accum[i].sumSqHumA,  accum[i].cntA) : null,
    tempB_sd: accum[i].cntB > 1 ? sdCalc(accum[i].sumTempB, accum[i].sumSqTempB, accum[i].cntB) : null,
    humB_sd:  accum[i].cntB > 1 ? sdCalc(accum[i].sumHumB,  accum[i].sumSqHumB,  accum[i].cntB) : null,
  }));
}

// Label rentang waktu yang dapat dibaca manusia (untuk tooltip grafik batang)
const DURATION_LABELS: Record<string, string> = {
  hari_ini: "Hari Ini",
  "3_hari": "3 Hari Terakhir",
  "7_hari": "7 Hari Terakhir",
  minggu_ini: "Minggu Ini",
  "4_minggu": "4 Minggu Terakhir",
  "7_minggu": "7 Minggu Terakhir",
  bulan_ini: "Bulan Ini",
  "3_bulan": "3 Bulan Terakhir",
  "6_bulan": "6 Bulan Terakhir",
  tahun_ini: "Tahun Ini",
  "2_tahun": "1-2 Tahun Terakhir",
  "5_tahun": "5 Tahun Terakhir",
};

// Custom tooltip untuk semua grafik — menampilkan "Hari, Tgl Bln Thn Jam:Mnt" + ±SD jika ada
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const startMs: number | undefined = payload[0]?.payload?.startMs;
  const periodLabel: string | undefined = payload[0]?.payload?.periodLabel;
  const visibleEntries = payload.filter((e: any) =>
    e.value != null && !String(e.dataKey).endsWith('_sd')
  );
  return (
    <div className="bg-gray-900 dark:bg-gray-950 border border-gray-700 rounded-xl p-2.5 shadow-2xl text-xs min-w-[150px]">
      <p className="text-gray-300 font-semibold mb-1.5 pb-1.5 border-b border-gray-700">
        {periodLabel ? periodLabel : startMs ? fmtBucketTs(startMs) : label}
      </p>
      {visibleEntries.map((entry: any, i: number) => {
        const sdKey = String(entry.dataKey) + '_sd';
        const sdVal = entry.payload?.[sdKey];
        return (
          <p key={i} className="flex items-center justify-between gap-3 mt-1">
            <span className="flex items-center gap-1.5" style={{ color: entry.color }}>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: entry.color }} />
              {entry.name}
            </span>
            <span className="font-bold text-white">
              {entry.value}{entry.unit ?? ''}
              {sdVal != null && (
                <span className="text-gray-400 font-normal ml-1">±{sdVal}</span>
              )}
            </span>
          </p>
        );
      })}
    </div>
  );
};

import ReactCrop, {
  type Crop,
  centerCrop,
  makeAspectCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

function centerAspectCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number,
) {
  return centerCrop(
    makeAspectCrop(
      {
        unit: "%",
        width: 100,
      },
      aspect,
      mediaWidth,
      mediaHeight,
    ),
    mediaWidth,
    mediaHeight,
  );
}

const ImageUpload = ({
  label,
  icon: Icon,
  onImageUploaded,
  value,
  type,
}: any) => {
  const [isDragging, setIsDragging] = useState(false);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [imgSrc, setImgSrc] = useState("");
  const imgRef = React.useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();

  const onSelectFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      setImgSrc(reader.result?.toString() || "");
      setCropModalOpen(true);
    });
    reader.readAsDataURL(file);
  };

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    if (type === "photo") {
      setCrop(centerAspectCrop(width, height, 1));
    } else {
      setCrop(centerAspectCrop(width, height, 3)); // cover ratio 3:1 approx
    }
  };

  const handleCompleteCrop = () => {
    if (imgRef.current && crop && crop.width > 0 && crop.height > 0) {
      const image = imgRef.current;
      const canvas = document.createElement("canvas");
      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;

      // Extract pixel values from crop
      const pixelCrop =
        crop.unit === "%"
          ? {
              x: (crop.x * image.width) / 100,
              y: (crop.y * image.height) / 100,
              width: (crop.width * image.width) / 100,
              height: (crop.height * image.height) / 100,
            }
          : crop;

      // Real physical pixels of the selected area
      const cropWidth = Math.max(1, Math.round(pixelCrop.width * scaleX));
      const cropHeight = Math.max(1, Math.round(pixelCrop.height * scaleY));
      const sx = Math.max(0, Math.round(pixelCrop.x * scaleX));
      const sy = Math.max(0, Math.round(pixelCrop.y * scaleY));

      canvas.width = cropWidth;
      canvas.height = cropHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Draw exactly the cropped area
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        image,
        sx,
        sy,
        cropWidth,
        cropHeight,
        0,
        0,
        cropWidth,
        cropHeight,
      );

      // Scale down if the image is extremely large, to save Firestore document size if we use base64 (which we are doing)
      // Since it's saved in Firestore as Base64, we need it to be reasonably small (under 1MB).
      const finalCanvas = document.createElement("canvas");
      const MAX_WIDTH = type === "photo" ? 500 : 1200;
      const MAX_HEIGHT = type === "photo" ? 500 : 400;

      let width = cropWidth;
      let height = cropHeight;

      if (width > MAX_WIDTH || height > MAX_HEIGHT) {
        const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      finalCanvas.width = width;
      finalCanvas.height = height;
      const finalCtx = finalCanvas.getContext("2d");

      if (finalCtx) {
        finalCtx.imageSmoothingQuality = "high";
        finalCtx.drawImage(
          canvas,
          0,
          0,
          cropWidth,
          cropHeight,
          0,
          0,
          width,
          height,
        );
      }

      // Convert to base64
      const dataUrl = finalCanvas.toDataURL("image/jpeg", 0.85);
      onImageUploaded(dataUrl);
      setCropModalOpen(false);
      setImgSrc("");
    } else {
      setCropModalOpen(false);
      setImgSrc("");
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
      </label>
      <div
        className={`relative border-2 border-dashed rounded-lg p-2 transition-colors text-center cursor-pointer overflow-hidden
          ${isDragging ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20" : "border-gray-300 dark:border-gray-700 hover:border-emerald-400 dark:hover:border-emerald-600"}
        `}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) onSelectFile(file);
        }}
        onClick={(e) => {
          // Prevent opening input if a user is dragging on crop modal or something
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/*";
          input.onchange = (ev: any) => {
            const file = ev.target.files[0];
            if (file) onSelectFile(file);
          };
          input.click();
        }}
      >
        {value ? (
          <div
            className={`relative flex items-center justify-center ${type === "photo" ? "w-24 h-24 mx-auto" : "w-full aspect-[3/1]"}`}
          >
            <img
              src={value}
              alt="Preview"
              className={`max-h-full object-cover ${type === "photo" ? "w-full h-full rounded-full ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-gray-900" : "w-full h-full rounded-md shadow-sm"}`}
            />
            <div
              className={`absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center ${type === "photo" ? "rounded-full" : "rounded-md"}`}
            >
              <span className="text-white text-xs font-semibold">
                Ganti Gambar
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-4 text-gray-500 dark:text-gray-400">
            <Icon className="w-5 h-5 mb-2 text-gray-400" />
            <p className="text-xs font-medium">Klik atau Drag & Drop foto</p>
          </div>
        )}
      </div>

      {cropModalOpen && !!imgSrc && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
          <div
            className="bg-white dark:bg-gray-800 rounded-xl max-w-lg w-full flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Potong {label}
              </h3>
              <button
                aria-label="Tutup"
                onClick={() => setCropModalOpen(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-auto max-h-[60vh] flex justify-center bg-gray-900">
              <ReactCrop
                crop={crop}
                onChange={(c) => setCrop(c)}
                aspect={type === "photo" ? 1 : 3}
                circularCrop={type === "photo"}
              >
                <img
                  ref={imgRef}
                  alt="Crop me"
                  src={imgSrc}
                  onLoad={onImageLoad}
                  className="max-w-full"
                />
              </ReactCrop>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-end gap-3">
              <button
                onClick={() => setCropModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700 transition"
              >
                Batal
              </button>
              <button
                onClick={handleCompleteCrop}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition"
              >
                Potong & Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Stempel waktu update terakhir — diperbarui setiap ada perubahan pada web
const LAST_UPDATED = "Sabtu, 27 Juni 2026 12:07 WIB";

export default function App() {
  // Deteksi Service Worker update — tampilkan banner refresh ke user
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  // ── Notifikasi browser (Notifications API) ──────────────────────────────
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    () => ('Notification' in window ? Notification.permission : 'denied'),
  );

  // ── PWA back button (Android) → popup konfirmasi keluar ─────────────────
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const exitingRef = React.useRef(false); // true saat user benar-benar mau keluar
  useEffect(() => {
    // Deteksi PWA lebih luas: standalone / fullscreen / minimal-ui / iOS / TWA
    const isPwa =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      (navigator as any).standalone === true ||
      document.referrer.startsWith('android-app://');
    if (!isPwa) return;
    window.history.pushState({ pwa: true }, '');
    const handler = () => {
      // Jika user sudah menekan "Keluar", jangan tahan — biarkan navigasi keluar
      if (exitingRef.current) return;
      setShowExitConfirm(true);
      window.history.pushState({ pwa: true }, '');
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  // ── Tangkap event beforeinstallprompt untuk tombol install PWA custom ────
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [installDismissed, setInstallDismissed] = useState(false);
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") setInstallPrompt(null);
  };

  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [isProfileOpen, setProfileOpen] = useState(false);
  const [isSheetSettingsOpen, setSheetSettingsOpen] = useState(false);
  const [isWiringGuideOpen, setIsWiringGuideOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);

  // ---- Tipe & State Jadwal Alarm DS3231 ----
  type ScheduleItem = {
    id: number;
    label: string;
    enabled: boolean;
    days: number; // bitmask bit0=Min(Sun)...bit6=Sab(Sat)
    onHour: number; onMin: number;
    offHour: number; offMin: number;
  };
  const [schedules, setSchedules] = useState<ScheduleItem[]>(() => {
    try {
      const s = localStorage.getItem("ngengat_schedules");
      return s ? JSON.parse(s) : [{
        id: 0, label: "Default", enabled: true, days: 127,
        onHour: 18, onMin: 0, offHour: 6, offMin: 0
      }];
    } catch { return []; }
  });
  const [editingSched, setEditingSched] = useState<ScheduleItem | null>(null);
  const [schedLabel, setSchedLabel] = useState("");
  const [schedDays, setSchedDays] = useState(127);
  const [schedOnTime, setSchedOnTime] = useState("18:00");
  const [schedOffTime, setSchedOffTime] = useState("06:00");
  const [sheetUrl, setSheetUrl] = useState(
    () => localStorage.getItem("googleSheetUrl") || "",
  );
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);
  const [isSheetManagerOpen, setIsSheetManagerOpen] = useState(false);
  const [sheetScanResult, setSheetScanResult] = useState<{
    used: string[];
    unused: { name: string; rows: number }[];
  } | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isDeletingSheets, setIsDeletingSheets] = useState(false);
  const [selectedSheetsToDelete, setSelectedSheetsToDelete] = useState<
    string[]
  >([]);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetOriginNode, setResetOriginNode] = useState<"A" | "B">("A");
  const [resetTarget, setResetTarget] = useState<"A" | "B" | "both">("A");
  const [resetScope, setResetScope] = useState<"dashboard" | "both">(
    "dashboard",
  );
  // Opsi: reset juga membersihkan SEMUA sheet data (logs, grafik, lingkungan, dll)
  const [resetAllData, setResetAllData] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isLogResetModalOpen, setIsLogResetModalOpen] = useState(false);
  const [logResetScope, setLogResetScope] = useState<"dashboard" | "both">(
    "dashboard",
  );
  const [isLogResetConfirmOpen, setIsLogResetConfirmOpen] = useState(false);
  const [isLogResetting, setIsLogResetting] = useState(false);

  // DHT22 — Suhu & Kelembaban
  const [dhtData, setDhtData] = useState<{
    A: { temp: number; humidity: number; timestamp: number } | null;
    B: { temp: number; humidity: number; timestamp: number } | null;
  }>({ A: null, B: null });

  // Buffer flush toast — muncul saat data offline masuk kembali
  const [bufferToast, setBufferToast] = useState<{
    id: number;
    count: number;
    node: string;
  } | null>(null);
  const bufferFlushRef = React.useRef<{
    countA: number;
    countB: number;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ countA: 0, countB: 0, timer: null });

  // Buffer baterai — toggle diatur di popup Pengaturan
  const [bufferBatteryEnabled, setBufferBatteryEnabled] = useState(
    () => localStorage.getItem("bufferBatteryEnabled") !== "false",
  );
  const bufferBatteryEnabledRef = React.useRef(bufferBatteryEnabled);
  useEffect(() => {
    bufferBatteryEnabledRef.current = bufferBatteryEnabled;
  }, [bufferBatteryEnabled]);

  // Jam aktif Telegram (perintah masuk) — di luar jam ini sensor abaikan perintah
  // demi hemat RAM & prioritas deteksi. Dikirim ke firmware via MQTT retained.
  const [tgWindow, setTgWindow] = useState<{ start: number; end: number }>(() => {
    try {
      const s = localStorage.getItem("tgWindow");
      if (s) return JSON.parse(s);
    } catch {}
    return { start: 6, end: 18 };
  });
  const publishTgWindow = React.useCallback(
    (w: { start: number; end: number }) => {
      try { localStorage.setItem("tgWindow", JSON.stringify(w)); } catch {}
      const c = mqttClientRef.current;
      if (c) c.publish("dashboard/ngengat/tgwindow", JSON.stringify(w), { retain: true, qos: 1 });
    },
    [],
  );

  // DHT history — riwayat pembacaan suhu/kelembaban untuk sinkronisasi ke Sheet
  const [dhtHistory, setDhtHistory] = useState<
    { timestamp: number; node: string; temp: number; humidity: number }[]
  >([]);

  // DHT semua riwayat — dari Sheet + sesi ini, untuk grafik dengan rentang waktu
  const [dhtHistoryAll, setDhtHistoryAll] = useState<
    { timestamp: number; node: string; temp: number; humidity: number }[]
  >([]);
  const [dhtTimeRange, setDhtTimeRange] = useState<
    "hari" | "minggu" | "bulan" | "tahun" | "kustom"
  >("hari");
  const [dhtTimeDuration, setDhtTimeDuration] = useState<string>("7_hari");
  const [dhtCustomStart, setDhtCustomStart] = useState<string>("");
  const [dhtCustomEnd, setDhtCustomEnd] = useState<string>("");

  // Signal untuk memicu auto-sync setelah data buffer IR tiba
  const [bufferFlushSignal, setBufferFlushSignal] = useState(0);

  // Signal sync SEKETIKA tiap data MQTT real-time tiba (deteksi/lingkungan).
  // Di-debounce ~6 dtk agar deteksi beruntun digabung jadi 1 kiriman ke DB.
  const [liveSyncSignal, setLiveSyncSignal] = useState(0);

  // Merge data sheet (dhtHistoryAll) + live MQTT sesi ini (dhtHistory) tanpa duplikat
  const dhtBuiltChartData = React.useMemo(() => {
    const storedTs = new Set(dhtHistoryAll.map(h => h.timestamp));
    const merged = [
      ...dhtHistoryAll,
      ...dhtHistory.filter(h => !storedTs.has(h.timestamp)),
    ];
    if (dhtTimeRange === "kustom") {
      if (!dhtCustomStart || !dhtCustomEnd) return [];
      const start = new Date(dhtCustomStart + "T00:00:00").getTime();
      const end = new Date(dhtCustomEnd + "T23:59:59").getTime();
      if (start > end) return [];
      return buildDhtChartFromHistory(merged, "kustom", "kustom", { start, end });
    }
    return buildDhtChartFromHistory(merged, dhtTimeRange, dhtTimeDuration);
  }, [dhtHistoryAll, dhtHistory, dhtTimeRange, dhtTimeDuration, dhtCustomStart, dhtCustomEnd]);

  // Rata-rata suhu & kelembaban dari seluruh data yang tersedia
  const rataRataEnv = React.useMemo(() => {
    const storedTs = new Set(dhtHistoryAll.map(h => h.timestamp));
    const merged = [
      ...dhtHistoryAll,
      ...dhtHistory.filter(h => !storedTs.has(h.timestamp)),
    ];
    if (!merged.length) return null;
    const aItems = merged.filter(h => h.node === 'A');
    const bItems = merged.filter(h => h.node === 'B');
    const avg = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10 : null;
    return {
      A: { temp: avg(aItems.map(h => h.temp)), hum: avg(aItems.map(h => h.humidity)), count: aItems.length },
      B: { temp: avg(bItems.map(h => h.temp)), hum: avg(bItems.map(h => h.humidity)), count: bItems.length },
    };
  }, [dhtHistoryAll, dhtHistory]);

  const [isDemoMode, setIsDemoMode] = useState(
    () => localStorage.getItem("isDemoMode") !== "false",
  );
  const [theme, setTheme] = useState<"light" | "dark" | "system">(
    () => (localStorage.getItem("theme") as any) || "system",
  );
  const [dateStr, setDateStr] = useState("");
  const [timeStr, setTimeStr] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();

      const days = [
        "Minggu",
        "Senin",
        "Selasa",
        "Rabu",
        "Kamis",
        "Jumat",
        "Sabtu",
      ];
      const dayName = days[now.getDay()];

      const day = String(now.getDate()).padStart(2, "0");
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const year = now.getFullYear();

      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const seconds = String(now.getSeconds()).padStart(2, "0");

      setDateStr(`${dayName}, ${day}/${month}/${year}`);
      setTimeStr(`${hours}:${minutes}:${seconds}`);
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Auth & Profile States
  const [isLoginModalOpen, setLoginModalOpen] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [nameExistsPrompt, setNameExistsPrompt] = useState<string | null>(null);
  // Verifikasi OTP email saat daftar
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpInfo, setOtpInfo] = useState("");
  const [otpForce, setOtpForce] = useState(false);
  // Kustomisasi warna bar baterai (bisa diedit di Mode Demo)
  const [demoBatteryColorA, setDemoBatteryColorA] = useState("#22c55e");
  const [demoBatteryColorB, setDemoBatteryColorB] = useState("#eab308");
  const [loginName, setLoginName] = useState("");
  const [loginPhoto, setLoginPhoto] = useState("");
  const [loginCover, setLoginCover] = useState("");
  const [loginMode, setLoginMode] = useState<"login" | "register">("login");
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(true);
  // Status koneksi ke database (Apps Script): "unknown" | "connected" | "error"
  const [dbStatus, setDbStatus] = useState<"unknown" | "connected" | "error">("unknown");
  // Gerbang: auto-sync HANYA boleh jalan setelah fetch awal sukses (cegah kirim 0
  // yang menimpa total di DB sebelum data termuat).
  const initialLoadDoneRef = React.useRef(false);
  const [pendingRealMode, setPendingRealMode] = useState(false);

  const [userProfile, setUserProfile] = useState<{
    displayName: string;
    email: string;
    photoURL: string;
    coverUrl: string;
    notificationsEnabled?: boolean;
    temperatureUnit?: "C" | "F";
    voltageUnit?: "V" | "mV";
  } | null>(() => {
    try {
      const saved = localStorage.getItem("userProfile");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    setIsDataLoading(true);
    const timer = setTimeout(() => {
      setIsDataLoading(false);
    }, 1200); // Simulate network latency
    return () => clearTimeout(timer);
  }, [isDemoMode, userProfile]);

  // GATE LOGIN: kedua mode (Demo & Asli) kini wajib login sebelum akses dashboard.
  // Jika belum login, paksa buka modal login (non-dismissible saat gate).
  useEffect(() => {
    if (!userProfile && !loginSuccess) {
      setLoginModalOpen(true);
    }
  }, [userProfile, loginSuccess]);

  // Logout paksa: hapus profil + token sesi, buka modal login.
  const forceLogout = React.useCallback(() => {
    setUserProfile(null);
    try {
      localStorage.removeItem("userProfile");
      localStorage.removeItem("sessionToken");
    } catch {}
    setLoginSuccess(false);
    setLoginModalOpen(true);
  }, []);

  // VALIDASI SESI — sesi sah hanya jika baris Log_Login (token) masih ada di DB.
  // Admin hapus baris di sheet → token tak ketemu → device ini login ulang.
  // Cek 20 dtk setelah buka (beri waktu baris login tersimpan) lalu tiap 5 menit.
  // TIDAK logout saat gagal jaringan — hanya saat server tegas bilang valid:false.
  useEffect(() => {
    if (isDemoMode || !userProfile || !SCRIPT_URL) return;
    let cancelled = false;
    const validate = async () => {
      const token = localStorage.getItem("sessionToken");
      if (!token) {
        // Sesi lama tanpa token → wajib login ulang sekali agar dapat token
        if (!cancelled) forceLogout();
        return;
      }
      try {
        const res = await postWithRetry({
          action: "validateSession",
          email: userProfile.email,
          sessionId: token,
          isDemoMode: false,
        });
        if (!cancelled && res && res.status === "success" && res.valid === false) {
          forceLogout();
        }
      } catch {
        // jaringan gagal → biarkan sesi (jangan logout)
      }
    };
    const first = setTimeout(validate, 20000);
    const iv = setInterval(validate, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(iv);
    };
  }, [isDemoMode, userProfile, forceLogout]);

  // Tutup modal login setelah animasi sukses — profil sudah disimpan sebelumnya
  useEffect(() => {
    if (!loginSuccess) return;
    const timer = setTimeout(() => {
      setLoginModalOpen(false);
      setLoginSuccess(false);
      setLoginEmail("");
      setLoginPassword("");
      setLoginName("");
    }, 1500);
    return () => clearTimeout(timer);
  }, [loginSuccess]);

  // ── Kirim config ke Service Worker untuk notifikasi background ──────────
  const sendConfigToSW = React.useCallback(
    (a: number, b: number) => {
      if (navigator.serviceWorker?.controller && userProfile && SCRIPT_URL) {
        navigator.serviceWorker.controller.postMessage({
          type: 'NOTIF_CONFIG',
          config: { scriptUrl: SCRIPT_URL, email: userProfile.email, lastA: a, lastB: b },
        });
      }
    },
    [userProfile],
  );

  // Minta izin notifikasi & daftar Periodic Background Sync
  const requestNotifPermission = async () => {
    if (!('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
    if (perm === 'granted') {
      try {
        const reg = await navigator.serviceWorker.ready;
        await (reg as any).periodicSync?.register('check-ngengat-update', {
          minInterval: 30 * 60 * 1000,
        });
      } catch (_) { /* browser tidak support Periodic Sync */ }
      sendConfigToSW(nodeA.uv365, nodeB.uv395);
    }
  };

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhotoUrl, setEditPhotoUrl] = useState("");
  const [editCoverUrl, setEditCoverUrl] = useState("");
  const [editNotificationsEnabled, setEditNotificationsEnabled] =
    useState(true);
  const [editTemperatureUnit, setEditTemperatureUnit] = useState<"C" | "F">(
    "C",
  );
  const [editVoltageUnit, setEditVoltageUnit] = useState<"V" | "mV">("V");

  const handleSaveProfile = async () => {
    if (!userProfile) return;
    const updatedProfile = {
      ...userProfile,
      displayName: editName,
      photoURL: editPhotoUrl,
      coverUrl: editCoverUrl,
      notificationsEnabled: editNotificationsEnabled,
      temperatureUnit: editTemperatureUnit,
      voltageUnit: editVoltageUnit,
    };
    setUserProfile(updatedProfile);
    localStorage.setItem("userProfile", JSON.stringify(updatedProfile));
    setIsEditingProfile(false);

    if (SCRIPT_URL) {
      try {
        await fetch(SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "updateProfile",
            email: userProfile.email,
            displayName: editName,
            photoURL: editPhotoUrl,
            coverUrl: editCoverUrl,
          }),
        });
      } catch (e) {
        console.error("Gagal update profile server", e);
      }
    }
  };

  const handleOpenEditProfile = () => {
    if (!userProfile) return;
    setEditName(userProfile.displayName || "");
    setEditPhotoUrl(userProfile.photoURL || "");
    setEditCoverUrl(userProfile.coverUrl || "");
    setEditNotificationsEnabled(userProfile.notificationsEnabled ?? true);
    setEditTemperatureUnit(userProfile.temperatureUnit || "C");
    setEditVoltageUnit(userProfile.voltageUnit || "V");
    setIsEditingProfile(true);
  };

  // Data States
  const [nodeA, setNodeA] = useState(() =>
    isDemoMode
      ? { uv365: 142, online: true, battery: 85, voltage: 13.6, led: true, ssid: "Kepo", rssi: -58 }
      : { uv365: 0, online: false, battery: 0, voltage: 0, led: false, ssid: "", rssi: 0 },
  );
  const [nodeB, setNodeB] = useState(() =>
    isDemoMode
      ? { uv395: 98, online: true, battery: 62, voltage: 13.1, led: true, ssid: "Kepo", rssi: -71 }
      : { uv395: 0, online: false, battery: 0, voltage: 0, led: false, ssid: "", rssi: 0 },
  );
  // Self-test hardware status (dikirim dari firmware saat boot via MQTT)
  const [selfTestA, setSelfTestA] = useState<{ir_ok:boolean;dht_ok:boolean;rtc_ok:boolean;relay_ok:boolean;volt_ok:boolean;temp:number;hum:number;rtcTime:string} | null>(null);
  const [selfTestB, setSelfTestB] = useState<{ir_ok:boolean;dht_ok:boolean;rtc_ok:boolean;relay_ok:boolean;volt_ok:boolean;temp:number;hum:number;rtcTime:string} | null>(null);

  const [logs, setLogs] = useState<any[]>([]);
  const [logCurrentPage, setLogCurrentPage] = useState(1);
  const logsPerPage = 10;

  // Logs Filter State
  const [filterSource, setFilterSource] = useState("all");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  const filteredLogs = React.useMemo(() => {
    return logs.filter((log) => {
      // Source filter
      if (filterSource !== "all" && log.source !== filterSource) return false;

      // Date range filter
      const logDate = safeParseDate(log.timestamp || log.id);
      // Set to beginning of the day for accurate comparison
      logDate.setHours(0, 0, 0, 0);

      if (filterStartDate) {
        const startDate = new Date(filterStartDate);
        startDate.setHours(0, 0, 0, 0);
        if (logDate < startDate) return false;
      }

      if (filterEndDate) {
        const endDate = new Date(filterEndDate);
        endDate.setHours(0, 0, 0, 0);
        if (logDate > endDate) return false;
      }

      return true;
    });
  }, [logs, filterSource, filterStartDate, filterEndDate]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setLogCurrentPage(1);
  }, [filterSource, filterStartDate, filterEndDate]);

  const totalLogPages = Math.ceil(filteredLogs.length / logsPerPage);
  const paginatedLogs = filteredLogs.slice(
    (logCurrentPage - 1) * logsPerPage,
    logCurrentPage * logsPerPage,
  );

  // Chart Data
  const [chartData, setChartData] = useState<any[]>([]);

  const [espTargetNode, setEspTargetNode] = useState<"A" | "B">(() => {
    return (localStorage.getItem("espTargetNode") as "A" | "B") || "A";
  });
  const espTargetNodeRef = React.useRef(espTargetNode);
  const mqttClientRef = React.useRef<MqttClient | null>(null);
  const [relayMode, setRelayMode] = useState<{
    A: "auto" | "manual";
    B: "auto" | "manual";
  }>({ A: "auto", B: "auto" });
  useEffect(() => {
    espTargetNodeRef.current = espTargetNode;
  }, [espTargetNode]);
  const [chartIntervalAsli, setChartIntervalAsli] = useState<number>(60);

  // Manual Inputs
  const [manual365, setManual365] = useState("");
  const [manual395, setManual395] = useState("");
  const [evaluation, setEvaluation] = useState<{
    err365: number;
    err395: number;
  } | null>(null);

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const prevOnlineRef = React.useRef({
    A: isDemoMode ? true : false,
    B: isDemoMode ? true : false,
  });
  // Track jumlah tangkapan sebelumnya untuk deteksi perubahan → notifikasi
  const prevCatchRef = React.useRef({ A: 0, B: 0 });
  const showCatchNotif = React.useCallback(
    (node: string, newCount: number, prevCount: number) => {
      if (Notification.permission !== 'granted' || isDemoMode) return;
      const diff = newCount - prevCount;
      if (diff <= 0) return;
      navigator.serviceWorker?.ready.then(reg => {
        reg.showNotification('Ngengat Baru Terdeteksi!', {
          body: `Node ${node}: +${diff} ngengat (total ${newCount})`,
          icon: './192x192.png',
          badge: './192x192.png',
          tag: `ngengat-catch-${node}`,
          renotify: true,
        } as NotificationOptions);
      }).catch(() => {
        // Fallback: Notification API langsung
        new Notification('Ngengat Baru!', {
          body: `Node ${node}: +${diff} ngengat`,
          icon: './192x192.png',
        });
      });
    },
    [isDemoMode],
  );

  // Jejak waktu data terakhir per node (informasi; status online kini dari LWT)
  const heartbeatRef = React.useRef<{ A: number; B: number }>({
    A: Date.now(),
    B: Date.now(),
  });
  // Eksekusi alarm yang dilaporkan node (untuk cek alarm terlewat)
  const alarmExecRef = React.useRef<{ node: string; action: string; ts: number }[]>([]);
  // Kunci alarm yang sudah diproses (hindari log ganda) — "tanggal|node|aksi|HH:MM"
  const handledAlarmsRef = React.useRef<Set<string>>(new Set());

  // 2. Listener Real-Time MQTT dari NodeMCU ESP8266
  useEffect(() => {
    if (isDemoMode) return;
    let cancelled = false;

    import("mqtt").then(({ default: mqttLib }) => {
      if (cancelled) return;
      const client = mqttLib.connect(
        MQTT_URL,
        MQTT_USER ? { username: MQTT_USER, password: MQTT_PASS } : undefined,
      );
      mqttClientRef.current = client;

    client.on("connect", () => {
      console.log("✅ Terhubung ke MQTT Broker HiveMQ");
      client.subscribe("dashboard/ngengat/deteksi");
      client.subscribe("dashboard/ngengat/baterai");
      client.subscribe("dashboard/ngengat/lingkungan");
      client.subscribe("dashboard/ngengat/selftest");
      client.subscribe("dashboard/ngengat/status/+"); // retained — status online/offline node (LWT)
      client.subscribe("dashboard/ngengat/alarmexec"); // event eksekusi alarm relay terjadwal
      client.subscribe("dashboard/ngengat/settings"); // retained — sinkron pengaturan antar device
      client.subscribe("dashboard/ngengat/schedule"); // retained — jadwal alarm DS3231
      // Pastikan firmware punya jam aktif Telegram terbaru (retained)
      try {
        const w = JSON.parse(localStorage.getItem("tgWindow") || '{"start":6,"end":18}');
        client.publish("dashboard/ngengat/tgwindow", JSON.stringify(w), { retain: true, qos: 1 });
      } catch {}
    });

    client.on("message", (topic, message) => {
      try {
        const payloadStr = message.toString();
        const payload = JSON.parse(payloadStr);

        if (topic === "dashboard/ngengat/deteksi") {
          const nodeFromPayload =
            payload.node === "A" || payload.node === "B"
              ? payload.node
              : espTargetNodeRef.current;

          heartbeatRef.current[nodeFromPayload === "A" ? "A" : "B"] =
            Date.now();

          // Deteksi data dari buffer offline (payload.buffered === true)
          if (payload.buffered === true) {
            const ref = bufferFlushRef.current;
            if (nodeFromPayload === "A") ref.countA++;
            else ref.countB++;
            if (ref.timer) clearTimeout(ref.timer);
            ref.timer = setTimeout(() => {
              const totalA = ref.countA;
              const totalB = ref.countB;
              const parts: string[] = [];
              if (totalA > 0) parts.push(`${totalA} data Node A`);
              if (totalB > 0) parts.push(`${totalB} data Node B`);
              if (parts.length > 0) {
                setBufferToast({
                  id: Date.now(),
                  count: totalA + totalB,
                  node: parts.join(" + "),
                });
                setTimeout(() => setBufferToast(null), 5000);
              }
              ref.countA = 0;
              ref.countB = 0;
              ref.timer = null;
              // Picu auto-sync agar data buffer langsung tersimpan ke Google Sheet
              setBufferFlushSignal((s) => s + 1);
            }, 400);
          }

          if (nodeFromPayload === "A") {
            setNodeA((prev) => {
              const newCount = prev.uv365 + 1;
              showCatchNotif("A", newCount, prevCatchRef.current.A);
              prevCatchRef.current.A = newCount;
              return { ...prev, uv365: newCount, online: true };
            });
            setLogs((prevLogs) =>
              [
                {
                  // ID stabil dari firmware (did) → deteksi sama dari banyak device
                  // pakai ID yang sama → dedup di DB bekerja, cegah hitungan ganda.
                  id:
                    payload.did ||
                    Date.now() + Math.random().toString(36).substr(2, 9),
                  timestamp:
                    payload.buffered === true && payload.ts
                      ? payload.ts * 1000
                      : Date.now(),
                  source: "Node A (UV 365 nm)",
                  action: payload.buffered
                    ? `IR Terpicu (+1) [Buffer • WiFi ${payload.wifi ? "aktif" : "mati"}]`
                    : "IR Terpicu (+1)",
                },
                ...prevLogs,
              ].slice(0, 100),
            );
          } else {
            setNodeB((prev) => {
              const newCount = prev.uv395 + 1;
              showCatchNotif("B", newCount, prevCatchRef.current.B);
              prevCatchRef.current.B = newCount;
              return { ...prev, uv395: newCount, online: true };
            });
            setLogs((prevLogs) =>
              [
                {
                  // ID stabil dari firmware (did) → deteksi sama dari banyak device
                  // pakai ID yang sama → dedup di DB bekerja, cegah hitungan ganda.
                  id:
                    payload.did ||
                    Date.now() + Math.random().toString(36).substr(2, 9),
                  timestamp:
                    payload.buffered === true && payload.ts
                      ? payload.ts * 1000
                      : Date.now(),
                  source: "Node B (UV 395 nm)",
                  action: payload.buffered
                    ? `IR Terpicu (+1) [Buffer • WiFi ${payload.wifi ? "aktif" : "mati"}]`
                    : "IR Terpicu (+1)",
                },
                ...prevLogs,
              ].slice(0, 100),
            );
          }
          // Deteksi real-time → picu sync seketika ke database (debounce 6 dtk)
          if (payload.buffered !== true) setLiveSyncSignal((s) => s + 1);
        } else if (topic === "dashboard/ngengat/baterai") {
          // Jika data baterai berasal dari buffer dan fitur buffer baterai dinonaktifkan, abaikan
          if (payload.buffered === true && !bufferBatteryEnabledRef.current)
            return;

          const nodeKey = payload.node === "B" ? "B" : "A";
          heartbeatRef.current[nodeKey] = Date.now();

          const batteryData = {
            battery: Math.round(payload.percentage),
            voltage: Number(parseFloat(payload.voltage).toFixed(2)),
            online: true,
            ...(payload.relay !== undefined && { led: payload.relay }),
            ...(payload.ssid !== undefined && { ssid: String(payload.ssid) }),
            ...(payload.rssi !== undefined && { rssi: Number(payload.rssi) }),
          };
          if (payload.node === "B") {
            setNodeB((prev) => ({ ...prev, ...batteryData }));
          } else {
            setNodeA((prev) => ({ ...prev, ...batteryData }));
          }
          // Jaga indikator "Voltage" tetap live dari pesan baterai (boot-test bisa basi)
          if (payload.volt_ok !== undefined) {
            const setSelf = payload.node === "B" ? setSelfTestB : setSelfTestA;
            setSelf((prev) => (prev ? { ...prev, volt_ok: !!payload.volt_ok } : prev));
          }
        } else if (topic === "dashboard/ngengat/lingkungan") {
          // DHT22 — Suhu & Kelembaban
          const nodeKey = payload.node === "B" ? "B" : "A";
          heartbeatRef.current[nodeKey] = Date.now();

          // Data DHT (tiap 30 dtk) ikut menandai node ONLINE agar status tidak
          // berkedip offline di antara publish baterai (tiap 60 dtk).
          if (nodeKey === "B") setNodeB((prev) => (prev.online ? prev : { ...prev, online: true }));
          else setNodeA((prev) => (prev.online ? prev : { ...prev, online: true }));

          const temp = Number(parseFloat(payload.temp).toFixed(1));
          const humidity = Number(parseFloat(payload.humidity).toFixed(1));
          const now = Date.now();

          setDhtData((prev) => ({
            ...prev,
            [nodeKey]: { temp, humidity, timestamp: now },
          }));

          // Simpan ke riwayat untuk sinkronisasi ke Google Sheet
          setDhtHistory((prev) =>
            [...prev, { timestamp: now, node: nodeKey, temp, humidity }].slice(
              -200,
            ),
          );

          setDhtHistoryAll((prev) => [
            ...prev,
            { timestamp: now, node: nodeKey, temp, humidity },
          ]);
          // Lingkungan baru → picu sync seketika ke database (debounce 6 dtk)
          setLiveSyncSignal((s) => s + 1);
        }
        if (topic === "dashboard/ngengat/selftest") {
          const st = {
            ir_ok:    !!payload.ir_ok,
            dht_ok:   !!payload.dht_ok,
            rtc_ok:   !!payload.rtc_ok,
            relay_ok: !!payload.relay_ok,
            volt_ok:  !!payload.volt_ok,
            temp:     Number(payload.temp) || 0,
            hum:      Number(payload.hum)  || 0,
            rtcTime:  String(payload.rtcTime || "--"),
          };
          if (payload.node === "B") {
            heartbeatRef.current.B = Date.now();
            setSelfTestB(st);
            setNodeB((prev) => (prev.online ? prev : { ...prev, online: true }));
          } else {
            heartbeatRef.current.A = Date.now();
            setSelfTestA(st);
            setNodeA((prev) => (prev.online ? prev : { ...prev, online: true }));
          }
        }
        if (topic === "dashboard/ngengat/alarmexec") {
          // Node melaporkan relay terjadwal SUKSES dieksekusi → catat Berhasil
          const node = payload.node === "B" ? "B" : "A";
          const act = payload.action === "OFF" ? "OFF" : "ON";
          const tms = payload.ts ? payload.ts * 1000 : Date.now();
          alarmExecRef.current.push({ node, action: act, ts: tms });
          if (alarmExecRef.current.length > 50) alarmExecRef.current.shift();
          if (userProfile && SCRIPT_URL && !isDemoMode) {
            postWithRetry({
              action: "logAlarm",
              node,
              alarmAction: act,
              status: "Berhasil",
              ts: tms,
              email: userProfile.email,
              name: userProfile.displayName,
              isDemoMode: false,
            }).catch(() => {});
          }
        }
        if (topic.startsWith("dashboard/ngengat/status/")) {
          // Status node = koneksi MQTT asli (LWT). Sumber kebenaran online/offline.
          const node = topic.endsWith("/B") || payload.node === "B" ? "B" : "A";
          const isOnline = payload.online === true;
          if (node === "B") setNodeB((prev) => (prev.online === isOnline ? prev : { ...prev, online: isOnline }));
          else setNodeA((prev) => (prev.online === isOnline ? prev : { ...prev, online: isOnline }));
        }
        if (topic === "dashboard/ngengat/schedule") {
          if (Array.isArray(payload.schedules)) {
            setSchedules(payload.schedules);
            try { localStorage.setItem("ngengat_schedules", JSON.stringify(payload.schedules)); } catch {}
          }
        }
        if (topic === "dashboard/ngengat/settings") {
          if (typeof payload.bufferBattery === "boolean") {
            setBufferBatteryEnabled((prev) => {
              if (prev !== payload.bufferBattery) {
                localStorage.setItem(
                  "bufferBatteryEnabled",
                  String(payload.bufferBattery),
                );
              }
              return payload.bufferBattery;
            });
          }
        }
      } catch (err) {
        console.error("Gagal parsing MQTT:", err);
      }
    });

      client.on("offline", () => {
        console.log("❌ Terputus dari MQTT Broker (WebSocket)");
        setNodeA((prev) => ({ ...prev, online: false }));
        setNodeB((prev) => ({ ...prev, online: false }));
      });
    });

    return () => {
      cancelled = true;
      if (mqttClientRef.current) {
        mqttClientRef.current.end();
        mqttClientRef.current = null;
      }
    };
  }, [isDemoMode]);

  // Catatan: status online/offline TIDAK lagi ditebak dari kedatangan data
  // (heartbeat) yang dulu bikin berkedip. Kini bersumber dari:
  //   (1) topik retained "dashboard/ngengat/status/{A,B}" — LWT koneksi MQTT node,
  //   (2) event "offline" MQTT browser (semua node offline jika browser putus).
  // Data deteksi/baterai/DHT/selftest hanya boleh MENGUATKAN online (tak pernah set offline).

  // Auto-sync ke Google Sheets setiap 5 menit
  useEffect(() => {
    if (!userProfile || !SCRIPT_URL) return;

    const syncInterval = setInterval(
      async () => {
        // Jangan sync sebelum data awal termuat (cegah menimpa total DB dengan 0)
        if (!initialLoadDoneRef.current) return;
        try {
          await fetch(SCRIPT_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
              action: "syncData",
              logs: dataRef.current.logs,
              nodeA: dataRef.current.nodeA,
              nodeB: dataRef.current.nodeB,
              chartData: dataRef.current.chartData,
              effectChartData: dataRef.current.effectChartData,
              dailyEffect: computeDailyEffect(dataRef.current.logs),
              lingkunganData: dataRef.current.dhtHistory,
              email: userProfile.email,
              name: userProfile.displayName,
              isDemoMode: isDemoMode,
            }),
          });
          setDbStatus("connected");
          console.log("Auto-sync success");
        } catch (e) {
          setDbStatus("error");
          console.error("Auto-sync failed:", e);
        }
      },
      5 * 60 * 1000,
    ); // 5 menit

    return () => clearInterval(syncInterval);
  }, [userProfile, isDemoMode]);

  useEffect(() => {
    prevOnlineRef.current = { A: nodeA.online, B: nodeB.online };
  }, [nodeA.online, nodeB.online]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Load jadwal dari database saat pertama buka
  useEffect(() => {
    loadSchedulesFromDB();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const applyTheme = () => {
      if (
        theme === "dark" ||
        (theme === "system" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches)
      ) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    };
    applyTheme();
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", applyTheme);
    return () =>
      window
        .matchMedia("(prefers-color-scheme: dark)")
        .removeEventListener("change", applyTheme);
  }, [theme]);

  // Chart Time Range State
  const [timeRange, setTimeRange] = useState<
    "hari" | "minggu" | "bulan" | "tahun" | "kustom"
  >("hari");
  const [timeDuration, setTimeDuration] = useState<string>("hari_ini");
  const [catchCustomStart, setCatchCustomStart] = useState<string>("");
  const [catchCustomEnd, setCatchCustomEnd] = useState<string>("");

  // Effect Chart Time Range State
  const [effectTimeRange, setEffectTimeRange] = useState<
    "hari" | "minggu" | "bulan" | "tahun" | "kustom"
  >("hari");
  const [effectTimeDuration, setEffectTimeDuration] =
    useState<string>("hari_ini");
  const [effectCustomStart, setEffectCustomStart] = useState<string>("");
  const [effectCustomEnd, setEffectCustomEnd] = useState<string>("");
  const [effectViewMode, setEffectViewMode] = useState<"total" | "rata-rata">(
    "total",
  );
  const [effectChartData, setEffectChartData] = useState<{
    NodeA: number;
    NodeB: number;
  }>({ NodeA: 0, NodeB: 0 });

  // Data ref untuk menyimpan state terbaru untuk sync
  const dataRef = React.useRef({
    logs,
    nodeA,
    nodeB,
    chartData,
    effectChartData,
    dhtHistory,
  });
  useEffect(() => {
    dataRef.current = {
      logs,
      nodeA,
      nodeB,
      chartData,
      effectChartData,
      dhtHistory,
    };
  }, [logs, nodeA, nodeB, chartData, effectChartData, dhtHistory]);

  // Auto-sync setelah data buffer IR tiba — pastikan semua data masuk ke Sheet
  useEffect(() => {
    if (bufferFlushSignal === 0) return;
    if (!userProfile || !SCRIPT_URL || isDemoMode) return;
    if (!initialLoadDoneRef.current) return; // tunggu data awal termuat

    const timer = setTimeout(() => {
      fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "syncData",
          logs: dataRef.current.logs,
          nodeA: dataRef.current.nodeA,
          nodeB: dataRef.current.nodeB,
          chartData: dataRef.current.chartData,
          effectChartData: dataRef.current.effectChartData,
          dailyEffect: computeDailyEffect(dataRef.current.logs),
          lingkunganData: dataRef.current.dhtHistory,
          email: userProfile.email,
          name: userProfile.displayName,
          isDemoMode: false,
        }),
      })
        .then(() => setDbStatus("connected"))
        .catch((e) => {
          setDbStatus("error");
          console.error("Buffer auto-sync failed:", e);
        });
    }, 3000);

    return () => clearTimeout(timer);
  }, [bufferFlushSignal, userProfile, isDemoMode]);

  // Sync SEKETIKA ke database tiap data MQTT real-time tiba.
  // Debounce 6 dtk: deteksi beruntun digabung jadi 1 kiriman (hemat kuota GAS),
  // tapi data tetap masuk DB & grafik jauh lebih cepat dari interval 5 menit.
  useEffect(() => {
    if (liveSyncSignal === 0) return;
    if (!userProfile || !SCRIPT_URL || isDemoMode) return;
    if (!initialLoadDoneRef.current) return; // tunggu data awal termuat

    const timer = setTimeout(() => {
      postWithRetry({
        action: "syncData",
        logs: dataRef.current.logs,
        nodeA: dataRef.current.nodeA,
        nodeB: dataRef.current.nodeB,
        chartData: dataRef.current.chartData,
        effectChartData: dataRef.current.effectChartData,
        dailyEffect: computeDailyEffect(dataRef.current.logs),
        lingkunganData: dataRef.current.dhtHistory,
        email: userProfile.email,
        name: userProfile.displayName,
        isDemoMode: false,
      })
        .then(() => setDbStatus("connected"))
        .catch((e) => {
          setDbStatus("error");
          console.error("Live auto-sync failed:", e);
        });
    }, 6000);

    return () => clearTimeout(timer);
  }, [liveSyncSignal, userProfile, isDemoMode]);

  // Publish TOTAL NGENGAT HARI INI per node ke MQTT retained.
  // Firmware memakainya untuk Telegram "Total hari ini" (+ tambahan deteksi lokalnya).
  useEffect(() => {
    if (isDemoMode) return;
    const client = mqttClientRef.current;
    if (!client) return;
    const t = setTimeout(() => {
      const todayKey = localDateKey(Date.now());
      let a = 0,
        b = 0;
      for (const log of logs) {
        const ts =
          typeof log.timestamp === "number"
            ? log.timestamp
            : new Date(log.timestamp).getTime();
        if (!ts || localDateKey(ts) !== todayKey) continue;
        const key = logNodeKey(log.source || "");
        if (key === "NodeA") a++;
        else if (key === "NodeB") b++;
      }
      try {
        client.publish(
          "dashboard/ngengat/today/A",
          JSON.stringify({ date: todayKey, total: a }),
          { retain: true, qos: 0 },
        );
        client.publish(
          "dashboard/ngengat/today/B",
          JSON.stringify({ date: todayKey, total: b }),
          { retain: true, qos: 0 },
        );
      } catch {}
    }, 1500);
    return () => clearTimeout(t);
  }, [logs, isDemoMode]);

  // DETEKSI ALARM TERLEWAT — bila pada jam terjadwal node tak melapor eksekusi,
  // catat "Gagal (Terlewat)" ke Log_Alarm. Yang berhasil dicatat via topik alarmexec.
  useEffect(() => {
    if (isDemoMode || !userProfile || !SCRIPT_URL) return;
    const check = () => {
      const now = Date.now();
      const d = new Date();
      const dayIdx = d.getDay(); // 0=Min … 6=Sab (selaras bitmask firmware)
      const todayKey = localDateKey(now);
      const GRACE = 3 * 60 * 1000;
      for (const s of schedules) {
        if (!s.enabled) continue;
        if (((s.days >> dayIdx) & 1) === 0) continue;
        const events = [
          { action: "ON", h: s.onHour, m: s.onMin },
          { action: "OFF", h: s.offHour, m: s.offMin },
        ];
        for (const ev of events) {
          const sched = new Date(
            d.getFullYear(),
            d.getMonth(),
            d.getDate(),
            ev.h,
            ev.m,
            0,
          ).getTime();
          if (now < sched + GRACE) continue;
          for (const node of ["A", "B"] as const) {
            const key = `${todayKey}|${node}|${ev.action}|${ev.h}:${ev.m}`;
            if (handledAlarmsRef.current.has(key)) continue;
            handledAlarmsRef.current.add(key);
            const matched = alarmExecRef.current.some(
              (e) =>
                e.node === node &&
                e.action === ev.action &&
                Math.abs(e.ts - sched) < 6 * 60 * 1000,
            );
            if (!matched) {
              postWithRetry({
                action: "logAlarm",
                node,
                alarmAction: ev.action,
                status: "Gagal (Terlewat)",
                ts: sched,
                email: userProfile.email,
                name: userProfile.displayName,
                isDemoMode: false,
              }).catch(() => {});
            }
          }
        }
      }
    };
    const iv = setInterval(check, 60000);
    check();
    return () => clearInterval(iv);
  }, [isDemoMode, userProfile, schedules]);

  // Update config SW saat jumlah tangkapan berubah (untuk notif background)
  useEffect(() => {
    if (!isDemoMode && notifPermission === 'granted') {
      sendConfigToSW(nodeA.uv365, nodeB.uv395);
    }
  }, [nodeA.uv365, nodeB.uv395, notifPermission, isDemoMode, sendConfigToSW]);

  // 1. TAMBAHKAN INI: Fungsi Fetch Data awal dari Google Sheet
  useEffect(() => {
    // Jika mode demo atau belum login, hentikan
    if (isDemoMode || !userProfile || !SCRIPT_URL) return;

    const fetchInitialData = async () => {
      setIsDataLoading(true);
      try {
        const response = await fetch(SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "fetchData",
            email: userProfile.email,
            name: userProfile.displayName,
            isDemoMode: false,
          }),
        });
        const result = await response.json();
        if (result.status === "success" && result.data) {
          if (result.data.nodeA) setNodeA(result.data.nodeA);
          if (result.data.nodeB) setNodeB(result.data.nodeB);
          if (result.data.logs) setLogs(result.data.logs);
          if (result.data.chartData && result.data.chartData.length > 0) setChartData(result.data.chartData);
          if (result.data.effectChartData) setEffectChartData(result.data.effectChartData);
          // Selalu set lingkunganHistory (termasuk array kosong) agar counter akurat
          if (Array.isArray(result.data.lingkunganHistory)) {
            setDhtHistoryAll(result.data.lingkunganHistory);
          }
          setDbStatus("connected");
          // Buka gerbang sync HANYA setelah data awal benar-benar termuat
          initialLoadDoneRef.current = true;
        } else {
          setDbStatus("error");
        }
      } catch (e) {
        console.error("Gagal menarik data dari server:", e);
        setDbStatus("error");
      } finally {
        setIsDataLoading(false);
      }
    };

    fetchInitialData();
  }, [userProfile, isDemoMode]);

  // Offline Simulation Initial Data
  useEffect(() => {
    if (!isDemoMode || !userProfile) {
      setLogs([]);
      setNodeA({ uv365: 0, online: false, battery: 0, voltage: 0, led: false, ssid: "", rssi: 0 });
      setNodeB({ uv395: 0, online: false, battery: 0, voltage: 0, led: false, ssid: "", rssi: 0 });
      setDhtData({ A: null, B: null });
      setDhtHistoryAll([]);
      return;
    }

    // Demo DHT22 — data historis 30 hari agar semua rentang waktu tersedia
    const demoDhtHistory: {
      timestamp: number;
      node: string;
      temp: number;
      humidity: number;
    }[] = [];
    const demoBaseTime = Date.now();
    for (let d = 29; d >= 0; d--) {
      for (let h = 0; h < 24; h++) {
        const ts = demoBaseTime - d * 86400000 - (23 - h) * 3600000;
        const wave = Math.sin((h * Math.PI) / 12) * 2.5;
        demoDhtHistory.push({
          timestamp: ts,
          node: "A",
          temp: +(27.5 + wave + (Math.random() - 0.5)).toFixed(1),
          humidity: +(72 - wave * 2 + (Math.random() - 0.5) * 3).toFixed(0),
        });
        demoDhtHistory.push({
          timestamp: ts + 60000,
          node: "B",
          temp: +(28.3 + wave + (Math.random() - 0.5)).toFixed(1),
          humidity: +(69 - wave * 2 + (Math.random() - 0.5) * 3).toFixed(0),
        });
      }
    }
    setDhtHistoryAll(demoDhtHistory);
    const demoLastA = demoDhtHistory[demoDhtHistory.length - 2];
    const demoLastB = demoDhtHistory[demoDhtHistory.length - 1];
    setDhtData({
      A: {
        temp: demoLastA.temp,
        humidity: demoLastA.humidity,
        timestamp: Date.now(),
      },
      B: {
        temp: demoLastB.temp,
        humidity: demoLastB.humidity,
        timestamp: Date.now(),
      },
    });

    let now = Date.now();
    const mockNodeAStatus = {
      online: true,
      battery: 85,
      voltage: 13.6,
      led: true,
    };
    const mockNodeBStatus = {
      online: true,
      battery: 62,
      voltage: 13.1,
      led: true,
    };

    const initialLogs = [
      {
        id: 1,
        timestamp: now - 30000,
        source: "Node A (UV 365 nm)",
        action: "IR Terpicu (+1)",
        nodeAStatus: mockNodeAStatus,
        nodeBStatus: mockNodeBStatus,
      },
      {
        id: 2,
        timestamp: now - 150000,
        source: "Node B (UV 395 nm)",
        action: "IR Terpicu (+1)",
        nodeAStatus: mockNodeAStatus,
        nodeBStatus: mockNodeBStatus,
      },
      {
        id: 3,
        timestamp: now - 450000,
        source: "Node A (UV 365 nm)",
        action: "IR Terpicu (+1)",
        nodeAStatus: mockNodeAStatus,
        nodeBStatus: mockNodeBStatus,
      },
      {
        id: 4,
        timestamp: now - 900000,
        source: "Node A (UV 365 nm)",
        action: "IR Terpicu (+1)",
        nodeAStatus: mockNodeAStatus,
        nodeBStatus: mockNodeBStatus,
      },
      {
        id: 5,
        timestamp: now - 1200000,
        source: "Node B (UV 395 nm)",
        action: "IR Terpicu (+1)",
        nodeAStatus: mockNodeAStatus,
        nodeBStatus: mockNodeBStatus,
      },
    ];
    setLogs(initialLogs);
    setNodeA({
      uv365: 142,
      online: true,
      battery: 85,
      voltage: 13.6,
      led: true,
      ssid: "Kepo",
      rssi: -58,
    });
    setNodeB({
      uv395: 98,
      online: true,
      battery: 62,
      voltage: 13.1,
      led: true,
      ssid: "Kepo",
      rssi: -71,
    });
  }, [isDemoMode, userProfile]);

  useEffect(() => {
    if (!isDemoMode) return; // Mode Asli ditangani efek terpisah (dari logs nyata)
    if (!userProfile) {
      setChartData([]);
      return;
    }
    let labels: string[] = [];
    let dataA: number[] = [];
    let dataB: number[] = [];

    if (timeRange === "hari") {
      const count =
        timeDuration === "hari_ini" ? 1 : timeDuration === "3_hari" ? 3 : 7;
      if (timeDuration === "hari_ini") {
        labels = [
          "18:00",
          "19:00",
          "20:00",
          "21:00",
          "22:00",
          "23:00",
          "00:00",
          "01:00",
          "02:00",
          "03:00",
          "04:00",
          "05:00",
          "06:00",
        ];
        dataA = [2, 15, 30, 45, 25, 10, 5, 3, 2, 1, 2, 1, 1];
        dataB = [1, 10, 20, 32, 18, 8, 4, 2, 1, 1, 0, 1, 0];
      } else {
        labels = Array.from({ length: count }, (_, i) => `H-${count - 1 - i}`);
        dataA = Array.from(
          { length: labels.length },
          () => Math.floor(Math.random() * 80) + 20,
        );
        dataB = Array.from(
          { length: labels.length },
          () => Math.floor(Math.random() * 50) + 10,
        );
      }
    } else if (timeRange === "minggu") {
      const count =
        timeDuration === "minggu_ini" ? 1 : timeDuration === "4_minggu" ? 4 : 7;
      if (timeDuration === "minggu_ini") {
        labels = [
          "Senin",
          "Selasa",
          "Rabu",
          "Kamis",
          "Jumat",
          "Sabtu",
          "Minggu",
        ];
        dataA = [120, 150, 100, 180, 142, 130, 160];
        dataB = [80, 95, 70, 110, 98, 85, 105];
      } else {
        labels = Array.from(
          { length: count },
          (_, i) => `Minggu ke-${count - i}`,
        );
        dataA = Array.from(
          { length: labels.length },
          () => Math.floor(Math.random() * 800) + 100,
        );
        dataB = Array.from(
          { length: labels.length },
          () => Math.floor(Math.random() * 500) + 80,
        );
      }
    } else if (timeRange === "bulan") {
      const count =
        timeDuration === "bulan_ini" ? 1 : timeDuration === "3_bulan" ? 3 : 6;
      if (timeDuration === "bulan_ini") {
        labels = ["Minggu 1", "Minggu 2", "Minggu 3", "Minggu 4"];
        dataA = [500, 600, 550, 620];
        dataB = [350, 400, 380, 450];
      } else {
        labels = Array.from(
          { length: count },
          (_, i) => `Bulan ke-${count - i}`,
        );
        dataA = Array.from(
          { length: labels.length },
          () => Math.floor(Math.random() * 2500) + 500,
        );
        dataB = Array.from(
          { length: labels.length },
          () => Math.floor(Math.random() * 1800) + 300,
        );
      }
    } else if (timeRange === "tahun") {
      const count =
        timeDuration === "tahun_ini" ? 1 : timeDuration === "2_tahun" ? 2 : 5;
      if (timeDuration === "tahun_ini") {
        labels = [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "Mei",
          "Jun",
          "Jul",
          "Ags",
          "Sep",
          "Okt",
          "Nov",
          "Des",
        ];
        dataA = [
          1000, 1200, 1500, 2000, 2500, 3000, 2800, 2000, 1800, 1500, 1200,
          1100,
        ];
        dataB = [
          800, 900, 1100, 1400, 1800, 2200, 2000, 1500, 1300, 1100, 900, 850,
        ];
      } else {
        const currentYear = new Date().getFullYear();
        labels = Array.from(
          { length: count },
          (_, i) => `${currentYear - (count - 1 - i)}`,
        );
        dataA = Array.from(
          { length: labels.length },
          () => Math.floor(Math.random() * 25000) + 5000,
        );
        dataB = Array.from(
          { length: labels.length },
          () => Math.floor(Math.random() * 18000) + 3000,
        );
      }
    }

    const initialChartData = labels.map((time, i) => ({
      time,
      NodeA: dataA[i],
      NodeB: dataB[i],
    }));
    setChartData(initialChartData);
  }, [isDemoMode, userProfile, timeRange, timeDuration]);

  // MODE ASLI: bangun grafik "Fluktuasi Waktu Kedatangan" dari logs nyata
  useEffect(() => {
    if (isDemoMode) return;
    if (!userProfile) { setChartData([]); return; }
    if (timeRange === "kustom") {
      if (!catchCustomStart || !catchCustomEnd) { setChartData([]); return; }
      const start = new Date(catchCustomStart + "T00:00:00").getTime();
      const end = new Date(catchCustomEnd + "T23:59:59").getTime();
      if (start > end) { setChartData([]); return; }
      setChartData(buildChartFromLogs(logs, "kustom", "kustom", { start, end }));
    } else {
      setChartData(buildChartFromLogs(logs, timeRange, timeDuration));
    }
  }, [isDemoMode, userProfile, timeRange, timeDuration, logs, catchCustomStart, catchCustomEnd]);

  useEffect(() => {
    if (!isDemoMode) return; // Mode Asli ditangani efek terpisah (dari logs nyata)
    if (!userProfile) {
      setEffectChartData({ NodeA: 0, NodeB: 0 });
      return;
    }

    let sumA = 0;
    let sumB = 0;
    let countData = 1;

    if (effectTimeRange === "hari") {
      const count =
        effectTimeDuration === "hari_ini"
          ? 1
          : effectTimeDuration === "3_hari"
            ? 3
            : 7;
      countData = count;
      if (effectTimeDuration === "hari_ini") {
        sumA = 142; // Fallbacks
        sumB = 98;
      } else {
        sumA = Array.from(
          { length: count },
          () => Math.floor(Math.random() * 80) + 20,
        ).reduce((a, b) => a + b, 0);
        sumB = Array.from(
          { length: count },
          () => Math.floor(Math.random() * 50) + 10,
        ).reduce((a, b) => a + b, 0);
      }
    } else if (effectTimeRange === "minggu") {
      const count =
        effectTimeDuration === "minggu_ini"
          ? 1
          : effectTimeDuration === "4_minggu"
            ? 4
            : 7;
      countData = count;
      if (effectTimeDuration === "minggu_ini") {
        sumA = [120, 150, 100, 180, 142, 130, 160].reduce((a, b) => a + b, 0);
        sumB = [80, 95, 70, 110, 98, 85, 105].reduce((a, b) => a + b, 0);
      } else {
        sumA = Array.from(
          { length: count },
          () => Math.floor(Math.random() * 800) + 100,
        ).reduce((a, b) => a + b, 0);
        sumB = Array.from(
          { length: count },
          () => Math.floor(Math.random() * 500) + 80,
        ).reduce((a, b) => a + b, 0);
      }
    } else if (effectTimeRange === "bulan") {
      const count =
        effectTimeDuration === "bulan_ini"
          ? 1
          : effectTimeDuration === "3_bulan"
            ? 3
            : 6;
      countData = count;
      if (effectTimeDuration === "bulan_ini") {
        sumA = [500, 600, 550, 620].reduce((a, b) => a + b, 0);
        sumB = [350, 400, 380, 450].reduce((a, b) => a + b, 0);
      } else {
        sumA = Array.from(
          { length: count },
          () => Math.floor(Math.random() * 2500) + 500,
        ).reduce((a, b) => a + b, 0);
        sumB = Array.from(
          { length: count },
          () => Math.floor(Math.random() * 1800) + 300,
        ).reduce((a, b) => a + b, 0);
      }
    } else if (effectTimeRange === "tahun") {
      const count =
        effectTimeDuration === "tahun_ini"
          ? 1
          : effectTimeDuration === "2_tahun"
            ? 2
            : 5;
      countData = count;
      if (effectTimeDuration === "tahun_ini") {
        sumA = [
          1000, 1200, 1500, 2000, 2500, 3000, 2800, 2000, 1800, 1500, 1200,
          1100,
        ].reduce((a, b) => a + b, 0);
        sumB = [
          800, 900, 1100, 1400, 1800, 2200, 2000, 1500, 1300, 1100, 900, 850,
        ].reduce((a, b) => a + b, 0);
      } else {
        sumA = Array.from(
          { length: count },
          () => Math.floor(Math.random() * 25000) + 5000,
        ).reduce((a, b) => a + b, 0);
        sumB = Array.from(
          { length: count },
          () => Math.floor(Math.random() * 18000) + 3000,
        ).reduce((a, b) => a + b, 0);
      }
    }

    if (effectViewMode === "rata-rata") {
      sumA = Math.round(sumA / countData);
      sumB = Math.round(sumB / countData);
    }

    setEffectChartData({ NodeA: sumA, NodeB: sumB });
  }, [
    isDemoMode,
    userProfile,
    effectTimeRange,
    effectTimeDuration,
    effectViewMode,
  ]);

  // MODE ASLI: bangun "Perbandingan Efektivitas" dari logs nyata
  useEffect(() => {
    if (isDemoMode) return;
    if (!userProfile) { setEffectChartData({ NodeA: 0, NodeB: 0 }); return; }
    let b;
    if (effectTimeRange === "kustom") {
      if (!effectCustomStart || !effectCustomEnd) { setEffectChartData({ NodeA: 0, NodeB: 0 }); return; }
      const start = new Date(effectCustomStart + "T00:00:00").getTime();
      const end = new Date(effectCustomEnd + "T23:59:59").getTime();
      if (start > end) { setEffectChartData({ NodeA: 0, NodeB: 0 }); return; }
      b = buildChartFromLogs(logs, "kustom", "kustom", { start, end });
    } else {
      b = buildChartFromLogs(logs, effectTimeRange, effectTimeDuration);
    }
    let sumA = b.reduce((acc, c) => acc + c.NodeA, 0);
    let sumB = b.reduce((acc, c) => acc + c.NodeB, 0);
    if (effectViewMode === "rata-rata") {
      const n = b.length || 1;
      sumA = Math.round(sumA / n);
      sumB = Math.round(sumB / n);
    }
    setEffectChartData({ NodeA: sumA, NodeB: sumB });
  }, [isDemoMode, userProfile, effectTimeRange, effectTimeDuration, effectViewMode, logs, effectCustomStart, effectCustomEnd]);

  const generateLogsSync = () => {
    const sources = ["Node A (UV 365 nm)", "Node B (UV 395 nm)"];
    const source = sources[Math.floor(Math.random() * sources.length)];
    const isNodeA = source.includes("365");

    const newLog = {
      id: Date.now() + Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      source: source,
      action: "IR Terpicu (+1)",
      nodeAStatus: {
        online: nodeA.online,
        battery: nodeA.battery,
        voltage: nodeA.voltage,
        led: nodeA.led,
      },
      nodeBStatus: {
        online: nodeB.online,
        battery: nodeB.battery,
        voltage: nodeB.voltage,
        led: nodeB.led,
      },
    };

    setLogs((prev) => [newLog, ...prev].slice(0, 15));

    if (isNodeA) {
      setNodeA((prev) => ({ ...prev, uv365: prev.uv365 + 1 }));
    } else {
      setNodeB((prev) => ({ ...prev, uv395: prev.uv395 + 1 }));
    }
  };

  const syncToGoogleSheet = async () => {
    setIsSyncingSheet(true);
    try {
      const dataPayload = {
        action: "syncData",
        logs: dataRef.current.logs,
        nodeA: dataRef.current.nodeA,
        nodeB: dataRef.current.nodeB,
        chartData: dataRef.current.chartData,
        effectChartData: dataRef.current.effectChartData,
        dailyEffect: computeDailyEffect(dataRef.current.logs),
        lingkunganData: dataRef.current.dhtHistory,
        isDemoMode: isDemoMode,
        email: userProfile?.email,
        name: userProfile?.displayName,
      };

      const response = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify(dataPayload),
      });

      const result = await response.json();
      if (result.status === "success") {
        // Berhasil sinkronisasi
      } else {
        throw new Error(result.message || "Unknown error");
      }
    } catch (e: any) {
      console.error("Sync error:", e);
    } finally {
      setIsSyncingSheet(false);
    }
  };

  const handleScanSheets = async () => {
    setIsScanning(true);
    setSheetScanResult(null);
    try {
      const response = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "scanSheets" }),
      });
      const result = await response.json();
      if (result.status === "success") {
        setSheetScanResult(result.data);
        setSelectedSheetsToDelete(result.data.unused.map((s: any) => s.name));
      }
    } catch (e) {
      console.error("Gagal scan sheets:", e);
    } finally {
      setIsScanning(false);
    }
  };

  const handleDeleteSelectedSheets = async () => {
    if (selectedSheetsToDelete.length === 0) return;
    setIsDeletingSheets(true);
    try {
      const response = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "deleteSheets",
          sheetNames: selectedSheetsToDelete,
        }),
      });
      const result = await response.json();
      if (result.status === "success") {
        await handleScanSheets();
      }
    } catch (e) {
      console.error("Gagal hapus sheets:", e);
    } finally {
      setIsDeletingSheets(false);
    }
  };

  const executeReset = async () => {
    setIsResetting(true);
    const newNodeAData =
      resetTarget === "A" || resetTarget === "both"
        ? { ...nodeA, uv365: 0 }
        : nodeA;
    const newNodeBData =
      resetTarget === "B" || resetTarget === "both"
        ? { ...nodeB, uv395: 0 }
        : nodeB;
    const newLogs =
      resetTarget === "both"
        ? []
        : logs.filter(
            (log) =>
              logNodeKey(log.source || "") !==
              (resetTarget === "A" ? "NodeA" : "NodeB"),
          );

    if (resetTarget === "A" || resetTarget === "both")
      setNodeA((prev) => ({ ...prev, uv365: 0 }));
    if (resetTarget === "B" || resetTarget === "both")
      setNodeB((prev) => ({ ...prev, uv395: 0 }));
    setLogs(newLogs);

    if (resetScope === "both" && SCRIPT_URL && userProfile) {
      try {
        await fetch(SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "syncData",
            isReset: true, // izinkan total turun/ke-0 (reset sah dari user)
            resetTarget: resetTarget, // "A" | "B" | "both"
            fullWipe: resetAllData, // bersihkan SEMUA sheet data user (kecuali Users)
            logs: newLogs,
            nodeA: newNodeAData,
            nodeB: newNodeBData,
            chartData: [],
            effectChartData: { NodeA: 0, NodeB: 0 },
            email: userProfile.email,
            name: userProfile.displayName,
            isDemoMode: false,
          }),
        });
      } catch (e) {
        console.error("Gagal sync reset ke database:", e);
      }
    }
    setIsResetting(false);
    setIsResetConfirmOpen(false);
    setIsResetModalOpen(false);
  };

  const executeLogReset = async () => {
    setIsLogResetting(true);
    setLogs([]);
    if (logResetScope === "both" && !isDemoMode && SCRIPT_URL && userProfile) {
      try {
        await fetch(SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "syncData",
            logs: [],
            nodeA,
            nodeB,
            chartData: [],
            effectChartData,
            email: userProfile.email,
            name: userProfile.displayName,
            isDemoMode: false,
          }),
        });
      } catch (e) {
        console.error("Gagal reset log ke database:", e);
      }
    }
    setIsLogResetting(false);
    setIsLogResetConfirmOpen(false);
    setIsLogResetModalOpen(false);
  };

  const validateEmail = (email: string) => {
    return String(email)
      .toLowerCase()
      .match(
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
      );
  };

  // Domain email sementara/disposable yang sering dipakai bot/akun palsu
  const DISPOSABLE_EMAIL_DOMAINS = [
    "mailinator.com", "tempmail.com", "temp-mail.org", "10minutemail.com",
    "guerrillamail.com", "guerrillamail.info", "guerrillamail.net",
    "sharklasers.com", "yopmail.com", "throwawaymail.com", "getnada.com",
    "trashmail.com", "maildrop.cc", "dispostable.com", "fakeinbox.com",
    "mailnesia.com", "tempinbox.com", "mohmal.com", "emailondeck.com",
    "spam4.me", "mintemail.com", "mytemp.email", "tempr.email", "moakt.com",
    "1secmail.com", "33mail.com", "burnermail.io", "temp-mail.io",
  ];
  const isDisposableEmail = (email: string) => {
    const domain = String(email).toLowerCase().trim().split("@")[1] || "";
    return DISPOSABLE_EMAIL_DOMAINS.some(
      (d) => domain === d || domain.endsWith("." + d),
    );
  };

  const validatePassword = (password: string) => {
    // Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character
    const re =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return re.test(password);
  };

  const getPasswordStrength = (password: string) => {
    let score = 0;
    if (!password) return 0;
    if (password.length >= 8) score += 1;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[@$!%*?&]/.test(password)) score += 1;
    return score;
  };

  const getStrengthColor = (score: number) => {
    if (score === 0) return "bg-gray-200 dark:bg-gray-800";
    if (score === 1) return "bg-red-500";
    if (score === 2) return "bg-orange-500";
    if (score === 3) return "bg-yellow-500";
    return "bg-emerald-500";
  };

  const getStrengthLabel = (score: number) => {
    if (score === 0) return "Sangat Lemah";
    if (score === 1) return "Lemah";
    if (score === 2) return "Sedang";
    if (score === 3) return "Kuat";
    return "Sangat Kuat";
  };

  const saveSchedulesToDB = async (list: typeof schedules) => {
    if (!SCRIPT_URL || isDemoMode) return;
    try {
      await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "saveSchedule",
          email: userProfile?.email || "-",
          schedules: list,
        }),
      });
    } catch {}
  };

  const loadSchedulesFromDB = async () => {
    if (!SCRIPT_URL) return;
    try {
      const res = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "loadSchedule" }),
      });
      const data = await res.json();
      if (data.status === "success" && Array.isArray(data.schedules) && data.schedules.length > 0) {
        setSchedules(data.schedules);
        try { localStorage.setItem("ngengat_schedules", JSON.stringify(data.schedules)); } catch {}
      }
    } catch {}
  };

  const logLoginActivity = async (
    email: string,
    demoMode: boolean,
    sessionId: string,
  ) => {
    if (!SCRIPT_URL) return;
    let ip = "-",
      city = "-",
      country = "-";
    try {
      const ipRes = await fetch("https://ipapi.co/json/");
      const ipData = await ipRes.json();
      ip = ipData.ip || "-";
      city = ipData.city || "-";
      country = ipData.country_name || "-";
    } catch {
      // IP gagal diambil — tetap simpan log dengan "-"
    }
    try {
      await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "saveLoginLog",
          email,
          ip,
          city,
          country,
          userAgent: navigator.userAgent,
          isDemoMode: demoMode,
          status: "success",
          sessionId, // token sesi device — untuk validasi sesi
        }),
      });
    } catch {
      // Log gagal tidak perlu ditampilkan ke user
    }
  };

  const submitAuth = async (force = false) => {
    setLoginError("");
    setNameExistsPrompt(null);
    if (!loginEmail || !loginPassword) {
      setLoginError("Mohon lengkapi email dan password!");
      return;
    }
    if (!validateEmail(loginEmail)) {
      setLoginError("Format email tidak valid atau bukan email asli!");
      return;
    }
    if (loginMode === "register" && isDisposableEmail(loginEmail)) {
      setLoginError(
        "Email sementara/disposable tidak diizinkan. Gunakan email asli (mis. Gmail).",
      );
      return;
    }

    if (loginMode === "register" && !validatePassword(loginPassword)) {
      setLoginError(
        "Password lemah! Minimal 8 karakter, mencakup huruf besar, huruf kecil, angka, dan simbol khusus (seperti @$!%*?&).",
      );
      return;
    }

    setIsAuthLoading(true);
    try {
      if (loginMode === "register") {
        // Daftar: kirim OTP dulu ke email (verifikasi email benar-benar ada)
        const result = await postWithRetry({
          action: "sendOtp",
          email: loginEmail.trim().toLowerCase(),
          name: loginName,
          forceRegister: force,
          isDemoMode: pendingRealMode ? false : isDemoMode,
        });
        if (result.status === "otp_sent") {
          setOtpForce(force);
          setOtpCode("");
          setOtpError("");
          setOtpInfo(result.message || "Kode OTP telah dikirim ke email Anda.");
          setOtpStep(true);
        } else if (result.status === "name_exists") {
          setNameExistsPrompt(
            result.message || "Nama tersebut sudah dipakai. Mungkin Anda ingin login?",
          );
        } else {
          setLoginError(result.message || "Gagal mengirim kode OTP.");
        }
      } else {
        // Login
        const result = await postWithRetry({
          action: "login",
          email: loginEmail.trim().toLowerCase(),
          password: loginPassword,
          isDemoMode: pendingRealMode ? false : isDemoMode,
        });
        if (result.status === "success") {
          finishAuthSuccess(result);
        } else {
          setLoginError(result.message || "Email atau password salah.");
        }
      }
    } catch (e: any) {
      setLoginError(
        "Gagal menghubungi server setelah beberapa percobaan. Periksa koneksi internet, lalu coba lagi.",
      );
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Terapkan hasil auth sukses (dipakai login & daftar setelah OTP terverifikasi)
  const finishAuthSuccess = (result: any) => {
    const normalizedEmail = loginEmail.trim().toLowerCase();
    const profile = {
      displayName: result.data
        ? result.data.name || normalizedEmail.split("@")[0]
        : loginName || normalizedEmail.split("@")[0],
      email: normalizedEmail,
      photoURL: result.data ? result.data.photoURL || "" : "",
      coverUrl: result.data ? result.data.coverUrl || "" : "",
    };
    setUserProfile(profile);
    try {
      localStorage.setItem("userProfile", JSON.stringify(profile));
    } catch {
      // localStorage bisa diblokir di mode privat
    }
    if (pendingRealMode) {
      setIsDemoMode(false);
      localStorage.setItem("isDemoMode", "false");
      setPendingRealMode(false);
    }
    // Token sesi unik per login → disimpan di device & baris Log_Login (kolom SessionID).
    // Hapus baris itu di database → device wajib login ulang.
    const sessionToken =
      (typeof crypto !== "undefined" && (crypto as any).randomUUID
        ? (crypto as any).randomUUID()
        : Date.now() + "-" + Math.random().toString(36).slice(2));
    try { localStorage.setItem("sessionToken", sessionToken); } catch {}

    setOtpStep(false);
    setLoginSuccess(true);
    logLoginActivity(loginEmail, pendingRealMode ? false : isDemoMode, sessionToken);
  };

  // Verifikasi OTP lalu buat akun
  const submitOtp = async () => {
    if (!otpCode || otpCode.trim().length < 6) {
      setOtpError("Masukkan 6 digit kode OTP yang dikirim ke email Anda.");
      return;
    }
    setOtpError("");
    setIsAuthLoading(true);
    try {
      const response = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "register",
          email: loginEmail.trim().toLowerCase(),
          password: loginPassword,
          name: loginName,
          photoURL: loginPhoto,
          coverUrl: loginCover,
          otp: otpCode.trim(),
          forceRegister: otpForce,
          isDemoMode: pendingRealMode ? false : isDemoMode,
        }),
      });
      const result = await response.json();
      if (result.status === "success") {
        finishAuthSuccess(result);
      } else if (result.status === "otp_invalid") {
        setOtpError(result.message || "Kode OTP salah atau sudah kadaluarsa.");
      } else {
        setOtpError(result.message || "Gagal mendaftar. Coba lagi.");
      }
    } catch {
      setOtpError("Gagal menghubungi server. Periksa koneksi internet Anda.");
    } finally {
      setIsAuthLoading(false);
    }
  };

  // Kirim ulang kode OTP
  const resendOtp = async () => {
    setOtpError("");
    setIsAuthLoading(true);
    try {
      const response = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "sendOtp",
          email: loginEmail.trim().toLowerCase(),
          name: loginName,
          forceRegister: otpForce,
          isDemoMode: pendingRealMode ? false : isDemoMode,
        }),
      });
      const result = await response.json();
      if (result.status === "otp_sent") {
        setOtpInfo(result.message || "Kode OTP dikirim ulang.");
      } else {
        setOtpError(result.message || "Gagal mengirim ulang OTP.");
      }
    } catch {
      setOtpError("Gagal menghubungi server.");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const calculateAccuracy = () => {
    const m365 = parseFloat(manual365);
    const m395 = parseFloat(manual395);
    if (!isNaN(m365) && !isNaN(m395)) {
      const err365 =
        m365 > 0
          ? (Math.abs(nodeA.uv365 - m365) / m365) * 100
          : nodeA.uv365 > 0
            ? 100
            : 0;
      const err395 =
        m395 > 0
          ? (Math.abs(nodeB.uv395 - m395) / m395) * 100
          : nodeB.uv395 > 0
            ? 100
            : 0;
      setEvaluation({ err365, err395 });
    }
  };

  const handleDownloadExcel = () => {
    // Dynamically import xlsx to keep the initial bundle small
    import("xlsx").then((XLSX) => {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Logs
      const vUnit = userProfile?.voltageUnit === "mV" ? "mV" : "V";
      const logData = logs.map((log) => ({
        "ID Log": log.id,
        "Waktu (Lengkap)": new Date(log.timestamp).toLocaleString("id-ID", {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        "Waktu UNIX": log.timestamp,
        "Sumber Node": log.source,
        "Aksi Deteksi": log.action || "IR Terpicu (+1)",
        "Node A Online": log.nodeAStatus?.online ? "Ya" : "Tidak",
        "Node A Baterai (%)": log.nodeAStatus?.battery || 0,
        [`Node A Tegangan (${vUnit})`]: log.nodeAStatus
          ? userProfile?.voltageUnit === "mV"
            ? log.nodeAStatus.voltage * 1000
            : log.nodeAStatus.voltage
          : 0,
        "Node A LED": log.nodeAStatus?.led ? "Nyala" : "Mati",
        "Node B Online": log.nodeBStatus?.online ? "Ya" : "Tidak",
        "Node B Baterai (%)": log.nodeBStatus?.battery || 0,
        [`Node B Tegangan (${vUnit})`]: log.nodeBStatus
          ? userProfile?.voltageUnit === "mV"
            ? log.nodeBStatus.voltage * 1000
            : log.nodeBStatus.voltage
          : 0,
        "Node B LED": log.nodeBStatus?.led ? "Nyala" : "Mati",
      }));
      const wsLogs = XLSX.utils.json_to_sheet(logData);
      XLSX.utils.book_append_sheet(wb, wsLogs, "Log Deteksi");

      // Sheet 2: Chart Data
      const chartDataFormatted = chartData.map((c) => ({
        Waktu: c.time,
        "Tangkapan Node A (365nm)": c.NodeA,
        "Tangkapan Node B (395nm)": c.NodeB,
      }));
      const wsChart = XLSX.utils.json_to_sheet(chartDataFormatted);
      XLSX.utils.book_append_sheet(wb, wsChart, "Grafik Tangkapan");

      // Sheet 3: Sensor Status
      const nodesData = [
        {
          "Nama Node": "Node A (UV 365nm)",
          "Total Tangkapan": nodeA.uv365,
          Status: nodeA.online ? "Online" : "Offline",
          "Baterai (%)": nodeA.battery,
          [`Tegangan (${vUnit})`]:
            userProfile?.voltageUnit === "mV"
              ? nodeA.voltage * 1000
              : nodeA.voltage,
          LED: nodeA.led ? "Nyala" : "Mati",
        },
        {
          "Nama Node": "Node B (UV 395nm)",
          "Total Tangkapan": nodeB.uv395,
          Status: nodeB.online ? "Online" : "Offline",
          "Baterai (%)": nodeB.battery,
          [`Tegangan (${vUnit})`]:
            userProfile?.voltageUnit === "mV"
              ? nodeB.voltage * 1000
              : nodeB.voltage,
          LED: nodeB.led ? "Nyala" : "Mati",
        },
      ];
      const wsNodes = XLSX.utils.json_to_sheet(nodesData);
      XLSX.utils.book_append_sheet(wb, wsNodes, "Status Sensor");

      if (userProfile) {
        const userData = [
          {
            Nama: userProfile.displayName || "Anonim",
            Email: userProfile.email || "Tidak ada",
            "Status Pengguna": "Mode Terhubung Offline",
          },
        ];
        const wsUser = XLSX.utils.json_to_sheet(userData);
        XLSX.utils.book_append_sheet(wb, wsUser, "Data Pengguna");
      }

      // Save the file
      XLSX.writeFile(
        wb,
        `Database_Lengkap_${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    });
  };

  return (
    <div className="relative flex h-screen overflow-hidden text-gray-800 bg-gray-50 dark:bg-gray-950 dark:text-gray-200 transition-colors duration-500 font-sans">
      {/* Banner update Service Worker — muncul ketika versi baru tersedia di cache */}
      {needRefresh && (
        <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between gap-3 bg-emerald-600 text-white text-sm px-4 py-2.5 shadow-lg anim-slide-down">
          <span className="font-medium">Versi baru tersedia!</span>
          <button
            onClick={() => updateServiceWorker(true)}
            className="flex-shrink-0 bg-white text-emerald-700 font-semibold text-xs px-3 py-1 rounded-full hover:bg-emerald-50 transition-colors"
          >
            Perbarui sekarang
          </button>
        </div>
      )}
      {/* Banner install PWA — muncul saat browser mendukung dan belum terinstall */}
      {installPrompt && !installDismissed && !needRefresh && (
        <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between gap-2 bg-teal-700 text-white text-sm px-4 py-2.5 shadow-lg anim-slide-down">
          <div className="flex items-center gap-2 min-w-0">
            <Bug className="w-4 h-4 shrink-0" />
            <span className="font-medium truncate">Pasang sebagai aplikasi</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleInstall}
              className="bg-white text-teal-700 font-semibold text-xs px-3 py-1 rounded-full hover:bg-teal-50 transition-colors"
            >
              Pasang
            </button>
            <button
              onClick={() => setInstallDismissed(true)}
              className="text-white/70 hover:text-white text-lg leading-none"
              aria-label="Tutup"
            >
              ×
            </button>
          </div>
        </div>
      )}
      {/* Popup konfirmasi keluar — muncul saat tombol back ditekan di PWA Android */}
      {showExitConfirm && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm anim-fade-in"
          onClick={() => setShowExitConfirm(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-xs shadow-2xl anim-scale-in"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <Bug className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <p className="font-semibold text-gray-800 dark:text-gray-100">Keluar dari aplikasi?</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Monitoring real-time akan berhenti saat aplikasi ditutup.
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowExitConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  setShowExitConfirm(false);
                  // Tandai sedang keluar agar guard popstate tidak menahan lagi
                  exitingRef.current = true;
                  // Mundur melewati 2 state penjaga (saat mount + saat popup) →
                  // back sistem Android yang menutup PWA (web app tak boleh self-close)
                  window.history.go(-2);
                  // Best-effort: sebagian konteks PWA masih mengizinkan close
                  setTimeout(() => {
                    try { window.close(); } catch (e) {}
                  }, 120);
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors"
              >
                Keluar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Decorative Blur Backgrounds */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] dark:opacity-[0.02]">
          <Bug className="w-[80vw] h-[80vw] text-emerald-900 dark:text-emerald-100 -rotate-12" />
        </div>
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-emerald-400/10 dark:bg-emerald-900/20 blur-[120px] mix-blend-multiply dark:mix-blend-lighten" />
        <div className="absolute top-[40%] -right-[10%] w-[40%] h-[60%] rounded-full bg-teal-400/10 dark:bg-teal-900/20 blur-[100px] mix-blend-multiply dark:mix-blend-lighten" />
        <div className="absolute -bottom-[20%] left-[20%] w-[60%] h-[50%] rounded-full bg-blue-400/10 dark:bg-blue-900/20 blur-[120px] mix-blend-multiply dark:mix-blend-lighten" />
      </div>

      {/* Main Container Wrapper */}
      <div className="flex h-screen w-full relative z-10">
        {/* Sidebar Overlay */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden"
            onClick={() => setSidebarOpen(false)}
          ></div>
        )}

        {/* Sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 w-64 bg-emerald-900 text-white flex flex-col z-30 transform transition-transform duration-300 shadow-xl md:shadow-none md:relative md:translate-x-0",
            !isSidebarOpen && "-translate-x-full",
          )}
        >
          <div className="p-6 flex items-center justify-between border-b border-emerald-800">
            <div className="flex items-center gap-3">
              <Leaf className="text-emerald-400 w-6 h-6" />
              <div>
                <h1 className="text-lg font-bold leading-tight">
                  Light Trap IoT
                </h1>
                <p className="text-xs text-emerald-300">Monitoring UPDKS</p>
              </div>
            </div>
            <button
              aria-label="Tutup sidebar"
              className="md:hidden text-emerald-300 hover:text-white"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            <div
              className={cn(
                "mb-4 flex items-center justify-between px-3 py-2 rounded-lg border",
                isDemoMode
                  ? "bg-amber-900/40 border-amber-500/30 text-amber-300"
                  : "bg-emerald-800/60 border-emerald-500/30 text-emerald-300",
              )}
            >
              <span className="text-xs font-semibold uppercase tracking-wider">
                Status Mode
              </span>
              <span
                className={cn(
                  "text-xs font-bold px-2 py-0.5 rounded-full border",
                  isDemoMode
                    ? "bg-amber-400 text-amber-900 border-amber-400"
                    : "bg-emerald-400 text-emerald-900 border-emerald-400",
                )}
              >
                {isDemoMode ? "DEMO" : "ASLI"}
              </span>
            </div>

            <button
              onClick={() => {
                document
                  .getElementById("dashboard-top")
                  ?.scrollIntoView({ behavior: "smooth" });
                setSidebarOpen(false);
              }}
              className="w-full flex items-center gap-3 bg-emerald-800 text-white p-3 rounded-lg font-medium transition text-left"
            >
              <PieChart className="w-5 h-5" /> Dashboard
            </button>
          </nav>
          <div className="p-4 border-t border-emerald-800 w-full block">
            {userProfile ? (
              <div className="flex items-center justify-between gap-3 w-full">
                <div
                  className="flex items-center gap-3 w-full cursor-pointer hover:bg-emerald-800 p-2 rounded-lg transition-colors"
                  onClick={() => {
                    setProfileOpen(true);
                    setSidebarOpen(false);
                  }}
                >
                  <img
                    src={
                      userProfile.photoURL ||
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(userProfile.displayName || "User")}`
                    }
                    alt="avatar"
                    className="w-10 h-10 rounded-full shrink-0"
                  />
                  <div className="overflow-hidden flex-1">
                    <p className="text-sm font-semibold truncate w-full">
                      {userProfile.displayName || "User"}
                    </p>
                    <p className="text-xs text-emerald-300 truncate w-full">
                      {userProfile.email || "user@example.com"}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  setLoginModalOpen(true);
                  setSidebarOpen(false);
                }}
                className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-600 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2 shadow-sm border border-emerald-600"
              >
                <div className="bg-white p-1 rounded-full">
                  <LogIn className="w-4 h-4 text-emerald-600" />
                </div>
                Login Akun
              </button>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className={cn("flex-1 flex flex-col h-screen overflow-hidden", !userProfile && "blur-sm pointer-events-none select-none")}>
          <header className="bg-white dark:bg-gray-800 h-auto min-h-[4rem] py-3 lg:py-0 lg:h-16 flex flex-col lg:flex-row lg:items-center justify-between px-4 lg:px-8 border-b border-gray-200 dark:border-gray-700 shrink-0 z-10 shadow-sm transition-colors duration-300 gap-3 lg:gap-0">
            <div className="flex items-center justify-between w-full lg:w-auto">
              <div className="flex items-center gap-3 sm:gap-4">
                <button
                  aria-label="Buka menu navigasi"
                  className="lg:hidden text-gray-500 hover:text-gray-700 dark:hover:text-white focus:outline-none"
                  onClick={() => setSidebarOpen(true)}
                >
                  <Menu className="w-6 h-6" />
                </button>
                <h2 className="text-base sm:text-lg md:text-xl font-semibold text-gray-800 dark:text-white truncate flex items-center gap-2">
                  Ringkasan Pengamatan
                  <span
                    className={cn(
                      "text-[10px] sm:text-xs px-2 py-0.5 rounded-full border inline-block",
                      isDemoMode
                        ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800"
                        : "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
                    )}
                  >
                    {isDemoMode ? "Mode Demo" : "Mode Asli"}
                  </span>
                </h2>
              </div>
              <button
                aria-label="Buka pengaturan"
                onClick={() => setSettingsOpen(true)}
                className="lg:hidden w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors flex items-center justify-center shadow-sm border border-gray-200 dark:border-gray-700 focus:outline-none shrink-0"
              >
                <SettingsIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center justify-between lg:justify-end gap-2 md:gap-4 w-full lg:w-auto">
              {!isOnline && (
                <div className="text-[10px] sm:text-sm font-semibold px-2 sm:px-3 py-1 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800 flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>{" "}
                  Offline Mode
                </div>
              )}
              {!isDemoMode && dbStatus !== "unknown" && (
                <div
                  title={dbStatus === "connected" ? "Terhubung ke database" : "Gagal terhubung ke database"}
                  className={cn(
                    "text-[10px] sm:text-xs font-semibold px-2 sm:px-2.5 py-1 rounded-full border flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0",
                    dbStatus === "connected"
                      ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800"
                      : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800",
                  )}
                >
                  <Database className="w-3 h-3 shrink-0" />
                  <span className="hidden sm:inline">
                    {dbStatus === "connected" ? "DB Terhubung" : "DB Gagal"}
                  </span>
                </div>
              )}
              <div className="flex bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm rounded-lg items-center px-2.5 sm:px-3.5 py-1.5 gap-1.5 sm:gap-2 transition-colors w-full lg:w-auto justify-center lg:justify-start">
                <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 animate-[spin_4s_linear_infinite] shrink-0" />
                <div className="flex flex-row items-center justify-center gap-1.5 sm:gap-2 text-gray-700 dark:text-gray-300 font-mono tabular-nums tracking-tight leading-tight truncate">
                  <span className="text-[10px] sm:text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                    {dateStr || "--/--/----"}
                  </span>
                  <span className="inline text-gray-300 dark:text-gray-600">
                    •
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white shrink-0">
                    {timeStr || "--:--:--"}
                  </span>
                </div>
              </div>
              <button
                aria-label="Buka pengaturan"
                onClick={() => setSettingsOpen(true)}
                className="hidden lg:flex w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors items-center justify-center shadow-sm border border-gray-200 dark:border-gray-700 focus:outline-none shrink-0"
              >
                <SettingsIcon className="w-5 h-5" />
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-4 lg:p-8" id="dashboard-top">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6 mb-6">
              {/* Node A */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border-l-4 border-l-purple-500 shadow-sm relative overflow-hidden group">
                <Bug className="absolute -bottom-4 -right-2 w-24 h-24 text-purple-200 dark:text-purple-900/20 rotate-12 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-12 z-0" />
                <div className="relative z-10 flex justify-between items-start">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1">
                      Total Tangkapan Sensor
                    </p>
                    <h3 className="text-2xl font-bold text-gray-800 dark:text-white">
                      Node A{" "}
                      <span className="text-purple-600 dark:text-purple-400 text-sm">
                        (365 nm)
                      </span>
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {isDemoMode ? (
                      <div className="flex items-center rounded-lg border border-purple-200 dark:border-purple-800 overflow-hidden shadow-sm">
                        <button
                          onClick={() =>
                            setNodeA((prev) => ({
                              ...prev,
                              uv365: Math.max(0, prev.uv365 - 1),
                            }))
                          }
                          className="px-2.5 py-2 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors text-base font-bold leading-none border-r border-purple-200 dark:border-purple-800"
                          title="Kurangi tangkapan (-1)"
                          aria-label="Kurangi tangkapan Node A"
                        >
                          −
                        </button>
                        <button
                          onClick={() =>
                            setNodeA((prev) => ({
                              ...prev,
                              uv365: prev.uv365 + 1,
                            }))
                          }
                          className="px-2.5 py-2 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors text-base font-bold leading-none"
                          title="Tambah tangkapan (+1)"
                          aria-label="Tambah tangkapan Node A"
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setResetOriginNode("A");
                          setResetTarget("A");
                          setResetScope("dashboard");
                          setIsResetModalOpen(true);
                        }}
                        className="w-12 h-12 rounded-full flex items-center justify-center text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/40 hover:bg-purple-200 dark:hover:bg-purple-900/60 transition-transform shadow-sm cursor-pointer hover:scale-110 active:scale-95"
                        title="Reset tangkapan Node A"
                        aria-label="Reset tangkapan Node A"
                      >
                        <Bug className="w-6 h-6" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="relative z-10 mt-4 flex items-end gap-2">
                  <span className="text-4xl font-bold text-gray-900 dark:text-white transition-all duration-300">
                    {nodeA.uv365}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                    ngengat
                  </span>
                </div>
              </div>

              {/* Node B */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border-l-4 border-l-blue-500 shadow-sm relative overflow-hidden group">
                <Bug className="absolute -bottom-4 -right-2 w-24 h-24 text-blue-200 dark:text-blue-900/20 rotate-12 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-12 z-0" />
                <div className="relative z-10 flex justify-between items-start">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1">
                      Total Tangkapan Sensor
                    </p>
                    <h3 className="text-2xl font-bold text-gray-800 dark:text-white">
                      Node B{" "}
                      <span className="text-blue-600 dark:text-blue-400 text-sm">
                        (395 nm)
                      </span>
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {isDemoMode ? (
                      <div className="flex items-center rounded-lg border border-blue-200 dark:border-blue-800 overflow-hidden shadow-sm">
                        <button
                          onClick={() =>
                            setNodeB((prev) => ({
                              ...prev,
                              uv395: Math.max(0, prev.uv395 - 1),
                            }))
                          }
                          className="px-2.5 py-2 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors text-base font-bold leading-none border-r border-blue-200 dark:border-blue-800"
                          title="Kurangi tangkapan (-1)"
                          aria-label="Kurangi tangkapan Node B"
                        >
                          −
                        </button>
                        <button
                          onClick={() =>
                            setNodeB((prev) => ({
                              ...prev,
                              uv395: prev.uv395 + 1,
                            }))
                          }
                          className="px-2.5 py-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors text-base font-bold leading-none"
                          title="Tambah tangkapan (+1)"
                          aria-label="Tambah tangkapan Node B"
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setResetOriginNode("B");
                          setResetTarget("B");
                          setResetScope("dashboard");
                          setIsResetModalOpen(true);
                        }}
                        className="w-12 h-12 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-transform shadow-sm cursor-pointer hover:scale-110 active:scale-95"
                        title="Reset tangkapan Node B"
                        aria-label="Reset tangkapan Node B"
                      >
                        <Bug className="w-6 h-6" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="relative z-10 mt-4 flex items-end gap-2">
                  <span className="text-4xl font-bold text-gray-900 dark:text-white transition-all duration-300">
                    {nodeB.uv395}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                    ngengat
                  </span>
                </div>
              </div>

              {/* Node A Status */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
                <SatelliteDish className="absolute -bottom-4 right-0 w-24 h-24 text-gray-200 dark:text-gray-700/30 rotate-[-15deg] transition-transform duration-500 group-hover:scale-110 group-hover:-translate-x-2 z-0" />
                <div className="relative z-10 flex justify-between items-center mb-4">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Status Node A (365nm)
                  </h3>
                  <span
                    className={cn(
                      "px-2 py-1 text-xs font-bold rounded-full border flex items-center gap-1",
                      nodeA.online
                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
                        : "bg-gray-100 text-gray-500",
                    )}
                  >
                    <Wifi className="w-3 h-3" />{" "}
                    {nodeA.online ? "Online" : "Offline"}
                  </span>
                </div>
                <div className="relative z-10 space-y-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <Battery className="w-3 h-3" /> Baterai
                      </span>
                      <span className="font-bold text-gray-700 dark:text-gray-300">
                        {nodeA.battery < 0 ? (
                          <span className="text-gray-400 dark:text-gray-500">N/A · sensor —</span>
                        ) : (
                          <>
                            {nodeA.battery}% (
                            {userProfile?.voltageUnit === "mV"
                              ? nodeA.voltage * 1000 + "mV"
                              : nodeA.voltage + "V"}
                            )
                          </>
                        )}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all duration-700"
                        style={{ width: `${Math.max(0, nodeA.battery)}%`, backgroundColor: demoBatteryColorA }}
                      ></div>
                    </div>
                    {isDemoMode && (
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          type="range" min={0} max={100} value={nodeA.battery}
                          onChange={(e) => setNodeA((p) => ({ ...p, battery: Number(e.target.value) }))}
                          className="flex-1 h-1.5 cursor-pointer" style={{ accentColor: demoBatteryColorA }}
                          aria-label="Atur persen baterai Node A"
                        />
                        <input
                          type="number" min={0} max={100} value={nodeA.battery}
                          onChange={(e) => setNodeA((p) => ({ ...p, battery: Math.max(0, Math.min(100, Number(e.target.value))) }))}
                          className="w-12 text-xs text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 p-0.5 outline-none"
                          aria-label="Persen baterai Node A"
                        />
                        <input
                          type="color" value={demoBatteryColorA}
                          onChange={(e) => setDemoBatteryColorA(e.target.value)}
                          className="w-7 h-7 rounded cursor-pointer bg-transparent border border-gray-300 dark:border-gray-600"
                          aria-label="Warna bar baterai Node A"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500 dark:text-gray-400">
                      Relay Lampu
                    </span>
                    <span
                      className={cn(
                        "font-bold flex items-center gap-1",
                        !nodeA.online
                          ? "text-gray-400 dark:text-gray-500"
                          : nodeA.led
                            ? "text-yellow-600 dark:text-yellow-400"
                            : "text-gray-400",
                      )}
                    >
                      <Lightbulb className="w-4 h-4" />{" "}
                      {!nodeA.online ? "Tidak diketahui" : nodeA.led ? "Menyala" : "Mati"}
                    </span>
                  </div>
                  {nodeA.online && (
                    <WifiSignal ssid={nodeA.ssid} rssi={nodeA.rssi} />
                  )}
                  <p className="text-[10px] text-gray-400 dark:text-gray-600 text-right">
                    Jadwal: 18:00 ON — 06:00 OFF (DS3231)
                  </p>
                  {!isDemoMode && selfTestA && nodeA.online && (
                    <div className="border-t border-gray-100 dark:border-gray-700 pt-2 mt-1">
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1.5 font-medium">Status Hardware (boot test)</p>
                      <div className="flex flex-wrap gap-1">
                        {(["ir_ok","dht_ok","rtc_ok","relay_ok","volt_ok"] as const).map((k) => {
                          const labels: Record<string, string> = {ir_ok:"IR",dht_ok:"DHT22",rtc_ok:"RTC",relay_ok:"Relay",volt_ok:"Voltage"};
                          const ok = selfTestA[k];
                          return (
                            <span key={k} className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded font-semibold border",
                              ok ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
                                 : "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800"
                            )}>
                              {ok ? "✓" : "✗"} {labels[k]}
                            </span>
                          );
                        })}
                      </div>
                      {selfTestA.rtcTime !== "--" && (
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">RTC: {selfTestA.rtcTime}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Node B Status */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm relative overflow-hidden group">
                <SatelliteDish className="absolute -bottom-4 right-0 w-24 h-24 text-gray-200 dark:text-gray-700/30 rotate-[-15deg] transition-transform duration-500 group-hover:scale-110 group-hover:-translate-x-2 z-0" />
                <div className="relative z-10 flex justify-between items-center mb-4">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Status Node B (395nm)
                  </h3>
                  <span
                    className={cn(
                      "px-2 py-1 text-xs font-bold rounded-full border flex items-center gap-1",
                      nodeB.online
                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
                        : "bg-gray-100 text-gray-500",
                    )}
                  >
                    <Wifi className="w-3 h-3" />{" "}
                    {nodeB.online ? "Online" : "Offline"}
                  </span>
                </div>
                <div className="relative z-10 space-y-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <BatteryMedium className="w-3 h-3" /> Baterai
                      </span>
                      <span className="font-bold text-gray-700 dark:text-gray-300">
                        {nodeB.battery < 0 ? (
                          <span className="text-gray-400 dark:text-gray-500">N/A · sensor —</span>
                        ) : (
                          <>
                            {nodeB.battery}% (
                            {userProfile?.voltageUnit === "mV"
                              ? nodeB.voltage * 1000 + "mV"
                              : nodeB.voltage + "V"}
                            )
                          </>
                        )}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all duration-700"
                        style={{ width: `${Math.max(0, nodeB.battery)}%`, backgroundColor: demoBatteryColorB }}
                      ></div>
                    </div>
                    {isDemoMode && (
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          type="range" min={0} max={100} value={nodeB.battery}
                          onChange={(e) => setNodeB((p) => ({ ...p, battery: Number(e.target.value) }))}
                          className="flex-1 h-1.5 cursor-pointer" style={{ accentColor: demoBatteryColorB }}
                          aria-label="Atur persen baterai Node B"
                        />
                        <input
                          type="number" min={0} max={100} value={nodeB.battery}
                          onChange={(e) => setNodeB((p) => ({ ...p, battery: Math.max(0, Math.min(100, Number(e.target.value))) }))}
                          className="w-12 text-xs text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 p-0.5 outline-none"
                          aria-label="Persen baterai Node B"
                        />
                        <input
                          type="color" value={demoBatteryColorB}
                          onChange={(e) => setDemoBatteryColorB(e.target.value)}
                          className="w-7 h-7 rounded cursor-pointer bg-transparent border border-gray-300 dark:border-gray-600"
                          aria-label="Warna bar baterai Node B"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500 dark:text-gray-400">
                      Relay Lampu
                    </span>
                    <span
                      className={cn(
                        "font-bold flex items-center gap-1",
                        !nodeB.online
                          ? "text-gray-400 dark:text-gray-500"
                          : nodeB.led
                            ? "text-yellow-600 dark:text-yellow-400"
                            : "text-gray-400",
                      )}
                    >
                      <Lightbulb className="w-4 h-4" />{" "}
                      {!nodeB.online ? "Tidak diketahui" : nodeB.led ? "Menyala" : "Mati"}
                    </span>
                  </div>
                  {nodeB.online && (
                    <WifiSignal ssid={nodeB.ssid} rssi={nodeB.rssi} />
                  )}
                  <p className="text-[10px] text-gray-400 dark:text-gray-600 text-right">
                    Jadwal: 18:00 ON — 06:00 OFF (DS3231)
                  </p>
                  {!isDemoMode && selfTestB && nodeB.online && (
                    <div className="border-t border-gray-100 dark:border-gray-700 pt-2 mt-1">
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-1.5 font-medium">Status Hardware (boot test)</p>
                      <div className="flex flex-wrap gap-1">
                        {(["ir_ok","dht_ok","rtc_ok","relay_ok","volt_ok"] as const).map((k) => {
                          const labels: Record<string, string> = {ir_ok:"IR",dht_ok:"DHT22",rtc_ok:"RTC",relay_ok:"Relay",volt_ok:"Voltage"};
                          const ok = selfTestB[k];
                          return (
                            <span key={k} className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded font-semibold border",
                              ok ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
                                 : "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800"
                            )}>
                              {ok ? "✓" : "✗"} {labels[k]}
                            </span>
                          );
                        })}
                      </div>
                      {selfTestB.rtcTime !== "--" && (
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">RTC: {selfTestB.rtcTime}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* DHT22 — Suhu & Kelembaban */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 mb-6">
              {/* DHT Node A */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border-l-4 border-l-orange-400 shadow-sm relative overflow-hidden group">
                <Thermometer className="absolute -bottom-3 -right-2 w-24 h-24 text-orange-100 dark:text-orange-900/20 rotate-6 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6 z-0" />
                <div className="relative z-10 flex justify-between items-start mb-4">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-0.5">
                      Lingkungan Node A
                    </p>
                    <h3 className="text-base font-bold text-gray-800 dark:text-white flex items-center gap-1.5">
                      <Wind className="w-4 h-4 text-orange-400" /> Suhu &
                      Kelembaban
                    </h3>
                  </div>
                  <span
                    className={cn(
                      "px-2 py-0.5 text-xs font-semibold rounded-full",
                      dhtData.A
                        ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                        : "bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500",
                    )}
                  >
                    {dhtData.A ? "Aktif" : "Menunggu"}
                  </span>
                </div>
                <div className="relative z-10 flex gap-6">
                  <div className="flex flex-col">
                    <span className="text-3xl font-bold text-gray-900 dark:text-white">
                      {dhtData.A
                        ? userProfile?.temperatureUnit === "F"
                          ? `${((dhtData.A.temp * 9) / 5 + 32).toFixed(1)}°F`
                          : `${dhtData.A.temp.toFixed(1)}°C`
                        : "--°C"}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
                      <Thermometer className="w-3 h-3 text-red-400" /> Suhu
                    </span>
                  </div>
                  <div className="w-px bg-gray-200 dark:bg-gray-700" />
                  <div className="flex flex-col">
                    <span className="text-3xl font-bold text-gray-900 dark:text-white">
                      {dhtData.A ? `${dhtData.A.humidity.toFixed(0)}%` : "--%"}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
                      <Droplets className="w-3 h-3 text-blue-400" /> Kelembaban
                    </span>
                  </div>
                </div>
                {isDemoMode && (
                  <div className="relative z-10 flex items-center gap-2 mt-3 flex-wrap">
                    <label className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                      <Thermometer className="w-3 h-3 text-red-400" />
                      <input
                        type="number" step="0.1" value={dhtData.A ? dhtData.A.temp : 0}
                        onChange={(e) => setDhtData((prev) => ({ ...prev, A: { temp: Number(e.target.value), humidity: prev.A?.humidity ?? 0, timestamp: Date.now() } }))}
                        className="w-16 text-xs text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 p-0.5 outline-none"
                        aria-label="Suhu Node A (demo)"
                      />°C
                    </label>
                    <label className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                      <Droplets className="w-3 h-3 text-blue-400" />
                      <input
                        type="number" min={0} max={100} value={dhtData.A ? dhtData.A.humidity : 0}
                        onChange={(e) => setDhtData((prev) => ({ ...prev, A: { temp: prev.A?.temp ?? 0, humidity: Math.max(0, Math.min(100, Number(e.target.value))), timestamp: Date.now() } }))}
                        className="w-16 text-xs text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 p-0.5 outline-none"
                        aria-label="Kelembaban Node A (demo)"
                      />%
                    </label>
                  </div>
                )}
                {dhtData.A && (
                  <p className="relative z-10 text-[10px] text-gray-400 dark:text-gray-600 mt-3">
                    Update:{" "}
                    {new Date(dhtData.A.timestamp).toLocaleTimeString("id-ID")}
                  </p>
                )}
              </div>

              {/* DHT Node B */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border-l-4 border-l-cyan-400 shadow-sm relative overflow-hidden group">
                <Thermometer className="absolute -bottom-3 -right-2 w-24 h-24 text-cyan-100 dark:text-cyan-900/20 rotate-6 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6 z-0" />
                <div className="relative z-10 flex justify-between items-start mb-4">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-0.5">
                      Lingkungan Node B
                    </p>
                    <h3 className="text-base font-bold text-gray-800 dark:text-white flex items-center gap-1.5">
                      <Wind className="w-4 h-4 text-cyan-400" /> Suhu &
                      Kelembaban
                    </h3>
                  </div>
                  <span
                    className={cn(
                      "px-2 py-0.5 text-xs font-semibold rounded-full",
                      dhtData.B
                        ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400"
                        : "bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500",
                    )}
                  >
                    {dhtData.B ? "Aktif" : "Menunggu"}
                  </span>
                </div>
                <div className="relative z-10 flex gap-6">
                  <div className="flex flex-col">
                    <span className="text-3xl font-bold text-gray-900 dark:text-white">
                      {dhtData.B
                        ? userProfile?.temperatureUnit === "F"
                          ? `${((dhtData.B.temp * 9) / 5 + 32).toFixed(1)}°F`
                          : `${dhtData.B.temp.toFixed(1)}°C`
                        : "--°C"}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
                      <Thermometer className="w-3 h-3 text-red-400" /> Suhu
                    </span>
                  </div>
                  <div className="w-px bg-gray-200 dark:bg-gray-700" />
                  <div className="flex flex-col">
                    <span className="text-3xl font-bold text-gray-900 dark:text-white">
                      {dhtData.B ? `${dhtData.B.humidity.toFixed(0)}%` : "--%"}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
                      <Droplets className="w-3 h-3 text-blue-400" /> Kelembaban
                    </span>
                  </div>
                </div>
                {isDemoMode && (
                  <div className="relative z-10 flex items-center gap-2 mt-3 flex-wrap">
                    <label className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                      <Thermometer className="w-3 h-3 text-red-400" />
                      <input
                        type="number" step="0.1" value={dhtData.B ? dhtData.B.temp : 0}
                        onChange={(e) => setDhtData((prev) => ({ ...prev, B: { temp: Number(e.target.value), humidity: prev.B?.humidity ?? 0, timestamp: Date.now() } }))}
                        className="w-16 text-xs text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 p-0.5 outline-none"
                        aria-label="Suhu Node B (demo)"
                      />°C
                    </label>
                    <label className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                      <Droplets className="w-3 h-3 text-blue-400" />
                      <input
                        type="number" min={0} max={100} value={dhtData.B ? dhtData.B.humidity : 0}
                        onChange={(e) => setDhtData((prev) => ({ ...prev, B: { temp: prev.B?.temp ?? 0, humidity: Math.max(0, Math.min(100, Number(e.target.value))), timestamp: Date.now() } }))}
                        className="w-16 text-xs text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 p-0.5 outline-none"
                        aria-label="Kelembaban Node B (demo)"
                      />%
                    </label>
                  </div>
                )}
                {dhtData.B && (
                  <p className="relative z-10 text-[10px] text-gray-400 dark:text-gray-600 mt-3">
                    Update:{" "}
                    {new Date(dhtData.B.timestamp).toLocaleTimeString("id-ID")}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-4 lg:gap-6 mb-6">
              {/* Arrival Chart */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 md:p-5 shadow-sm relative overflow-hidden group">
                <Bug className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 text-gray-200/70 dark:text-gray-900/10 rotate-12 transition-transform duration-[2s] group-hover:scale-110 group-hover:-rotate-12 z-0 pointer-events-none" />
                <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
                  <h3 className="text-base md:text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <PieChart className="w-5 h-5 text-emerald-500" />
                    Fluktuasi Waktu Kedatangan
                  </h3>
                  <div className="flex flex-col gap-1.5 items-stretch w-full sm:w-fit">
                    {timeRange === "kustom" ? (
                      <div className="flex gap-1.5 items-center w-full">
                        <input type="date" value={catchCustomStart} onChange={e => setCatchCustomStart(e.target.value)}
                          className="flex-1 min-w-0 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-xs rounded-lg p-1.5 outline-none focus:ring-emerald-500 focus:border-emerald-500" />
                        <span className="text-gray-400 text-xs flex-shrink-0">–</span>
                        <input type="date" value={catchCustomEnd} onChange={e => setCatchCustomEnd(e.target.value)}
                          className="flex-1 min-w-0 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-xs rounded-lg p-1.5 outline-none focus:ring-emerald-500 focus:border-emerald-500" />
                      </div>
                    ) : (
                      <select
                        aria-label="Pilih rentang waktu grafik"
                        value={timeDuration}
                        onChange={(e) => setTimeDuration(e.target.value)}
                        className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-xs rounded-lg focus:ring-emerald-500 focus:border-emerald-500 p-1.5 outline-none"
                      >
                        {timeRange === "hari" && (
                          <>
                            <option value="hari_ini">Hari Ini</option>
                            <option value="3_hari">3 Hari Terakhir</option>
                            <option value="7_hari">7 Hari Terakhir</option>
                          </>
                        )}
                        {timeRange === "minggu" && (
                          <>
                            <option value="minggu_ini">Minggu Ini</option>
                            <option value="4_minggu">4 Minggu Terakhir</option>
                            <option value="7_minggu">7 Minggu Terakhir</option>
                          </>
                        )}
                        {timeRange === "bulan" && (
                          <>
                            <option value="bulan_ini">Bulan Ini</option>
                            <option value="3_bulan">3 Bulan Terakhir</option>
                            <option value="6_bulan">6 Bulan Terakhir</option>
                          </>
                        )}
                        {timeRange === "tahun" && (
                          <>
                            <option value="tahun_ini">Tahun Ini</option>
                            <option value="2_tahun">1-2 Tahun Terakhir</option>
                            <option value="5_tahun">5 Tahun Terakhir</option>
                          </>
                        )}
                      </select>
                    )}
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <div className="flex items-center w-full sm:w-auto bg-gray-100 dark:bg-gray-800 rounded-lg p-1 border border-gray-200 dark:border-gray-700">
                        {(["hari", "minggu", "bulan", "tahun", "kustom"] as const).map(
                          (t) => (
                            <button
                              key={t}
                              onClick={() => {
                                setTimeRange(t);
                                setTimeDuration(t === "kustom" ? "kustom" : t + "_ini");
                              }}
                              className={cn(
                                "px-2 py-1.5 rounded-md text-xs font-medium capitalize transition-colors flex-1 text-center",
                                timeRange === t
                                  ? "bg-white dark:bg-gray-600 text-emerald-600 dark:text-emerald-400 shadow-sm"
                                  : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200",
                              )}
                            >
                              {t === "kustom" ? "tanggal" : t}
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="relative w-full h-64 md:h-72 min-h-[200px]">
                  {isDataLoading ? (
                    <div className="w-full h-full flex flex-col gap-4">
                      <div className="h-full w-full bg-gray-100 dark:bg-gray-700/50 rounded-lg animate-pulse backdrop-blur-sm relative overflow-hidden">
                        <div className="absolute top-1/2 left-0 w-full border-t-2 border-dashed border-gray-300 dark:border-gray-600 top-1/2 -mt-4 opacity-50"></div>
                        <div className="absolute top-0 bottom-0 left-[20%] w-px bg-gray-300 dark:bg-gray-600 opacity-50"></div>
                        <div className="absolute top-0 bottom-0 left-[50%] w-px bg-gray-300 dark:bg-gray-600 opacity-50"></div>
                        <div className="absolute top-0 bottom-0 left-[80%] w-px bg-gray-300 dark:bg-gray-600 opacity-50"></div>
                      </div>
                    </div>
                  ) : chartData.length === 0 ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                      <Leaf className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
                      <p className="text-gray-500 dark:text-gray-400 font-medium text-sm">
                        Belum ada data tangkapan ngengat
                      </p>
                      <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
                        Data akan muncul di sini setelah sensor mulai
                        mendeteksi.
                      </p>
                    </div>
                  ) : (
                    <ResponsiveContainer
                      width="100%"
                      height="100%"
                      minWidth={0}
                      minHeight={0}
                    >
                      <LineChart
                        data={chartData}
                        margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#374151"
                          vertical={false}
                        />
                        <XAxis dataKey="time" stroke="#6b7280" fontSize={10} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                        <YAxis stroke="#6b7280" fontSize={12} />
                        <Tooltip content={<ChartTooltip />} cursor={false} />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="NodeA"
                          name="Node A (365nm)"
                          stroke="#8b5cf6"
                          strokeWidth={3}
                          dot={{ r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="NodeB"
                          name="Node B (395nm)"
                          stroke="#3b82f6"
                          strokeWidth={3}
                          dot={{ r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Comparison Chart */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 md:p-5 shadow-sm relative overflow-hidden group">
                <Microscope className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 text-gray-200/70 dark:text-gray-900/10 rotate-[-15deg] transition-transform duration-[2s] group-hover:scale-110 group-hover:-translate-x-[40%] z-0 pointer-events-none" />
                <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
                  <div>
                    <h3 className="text-base md:text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                      <Bug className="w-5 h-5 text-emerald-500" />
                      Perbandingan Efektivitas
                    </h3>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 pl-7">
                      UV 365nm (Node A) vs UV 395nm (Node B)
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5 items-stretch w-full sm:w-fit">
                    {effectTimeRange === "kustom" ? (
                      <div className="flex gap-1.5 items-center w-full">
                        <input type="date" value={effectCustomStart} onChange={e => setEffectCustomStart(e.target.value)}
                          className="flex-1 min-w-0 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-xs rounded-lg p-1.5 outline-none focus:ring-emerald-500 focus:border-emerald-500" />
                        <span className="text-gray-400 text-xs flex-shrink-0">–</span>
                        <input type="date" value={effectCustomEnd} onChange={e => setEffectCustomEnd(e.target.value)}
                          className="flex-1 min-w-0 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-xs rounded-lg p-1.5 outline-none focus:ring-emerald-500 focus:border-emerald-500" />
                      </div>
                    ) : (
                      <select
                        aria-label="Pilih rentang waktu perbandingan"
                        value={effectTimeDuration}
                        onChange={(e) => setEffectTimeDuration(e.target.value)}
                        className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-xs rounded-lg focus:ring-emerald-500 focus:border-emerald-500 p-1.5 outline-none"
                      >
                        {effectTimeRange === "hari" && (
                          <>
                            <option value="hari_ini">Hari Ini</option>
                            <option value="3_hari">3 Hari Terakhir</option>
                            <option value="7_hari">7 Hari Terakhir</option>
                          </>
                        )}
                        {effectTimeRange === "minggu" && (
                          <>
                            <option value="minggu_ini">Minggu Ini</option>
                            <option value="4_minggu">4 Minggu Terakhir</option>
                            <option value="7_minggu">7 Minggu Terakhir</option>
                          </>
                        )}
                        {effectTimeRange === "bulan" && (
                          <>
                            <option value="bulan_ini">Bulan Ini</option>
                            <option value="3_bulan">3 Bulan Terakhir</option>
                            <option value="6_bulan">6 Bulan Terakhir</option>
                          </>
                        )}
                        {effectTimeRange === "tahun" && (
                          <>
                            <option value="tahun_ini">Tahun Ini</option>
                            <option value="2_tahun">1-2 Tahun Terakhir</option>
                            <option value="5_tahun">5 Tahun Terakhir</option>
                          </>
                        )}
                      </select>
                    )}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
                      <div className="flex items-center w-full sm:w-auto bg-gray-100 dark:bg-gray-800 rounded-lg p-1 border border-gray-200 dark:border-gray-700">
                        {(["total", "rata-rata"] as const).map((m) => (
                          <button
                            key={m}
                            onClick={() => setEffectViewMode(m)}
                            className={cn(
                              "px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors flex-1 text-center whitespace-nowrap",
                              effectViewMode === m
                                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 shadow-sm border border-emerald-200 dark:border-emerald-800"
                                : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200",
                            )}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center w-full sm:w-auto bg-gray-100 dark:bg-gray-800 rounded-lg p-1 border border-gray-200 dark:border-gray-700">
                        {(["hari", "minggu", "bulan", "tahun", "kustom"] as const).map(
                          (t) => (
                            <button
                              key={t}
                              onClick={() => {
                                setEffectTimeRange(t);
                                setEffectTimeDuration(t === "kustom" ? "kustom" : t + "_ini");
                              }}
                              className={cn(
                                "px-2 py-1.5 rounded-md text-xs font-medium capitalize transition-colors flex-1 text-center",
                                effectTimeRange === t
                                  ? "bg-white dark:bg-gray-600 text-emerald-600 dark:text-emerald-400 shadow-sm"
                                  : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200",
                              )}
                            >
                              {t === "kustom" ? "tanggal" : t}
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="relative w-full h-64 md:h-72 min-h-[200px]">
                  {isDataLoading ? (
                    <div className="w-full h-full flex items-end justify-center gap-8 pb-8 pt-4 relative overflow-hidden">
                      <div className="absolute top-1/2 left-0 w-full border-t-2 border-dashed border-gray-300 dark:border-gray-600 top-1/2 -mt-4 opacity-50 z-0"></div>
                      <div
                        className="w-16 md:w-20 bg-gray-100 dark:bg-gray-700/50 rounded-t-lg animate-pulse backdrop-blur-sm z-10"
                        style={{ height: "70%" }}
                      ></div>
                      <div
                        className="w-16 md:w-20 bg-gray-100 dark:bg-gray-700/50 rounded-t-lg animate-pulse backdrop-blur-sm z-10"
                        style={{ height: "45%" }}
                      ></div>
                    </div>
                  ) : effectChartData.NodeA === 0 &&
                    effectChartData.NodeB === 0 ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                      <Bug className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
                      <p className="text-gray-500 dark:text-gray-400 font-medium text-sm">
                        Tidak ada data untuk dibandingkan
                      </p>
                      <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
                        Data tangkapan masing-masing node akan dibandingkan di
                        sini.
                      </p>
                    </div>
                  ) : (
                    <ResponsiveContainer
                      width="100%"
                      height="100%"
                      minWidth={0}
                      minHeight={0}
                    >
                      <BarChart
                        data={[
                          {
                            name:
                              effectViewMode === "rata-rata"
                                ? "Rata-rata Tangkapan"
                                : "Total Tangkapan",
                            NodeA: effectChartData.NodeA,
                            NodeB: effectChartData.NodeB,
                            periodLabel:
                              effectTimeRange === "kustom"
                                ? effectCustomStart && effectCustomEnd
                                  ? `${fmtBucketTs(new Date(effectCustomStart + "T00:00:00").getTime())} – ${fmtBucketTs(new Date(effectCustomEnd + "T00:00:00").getTime())}`
                                  : "Rentang kustom"
                                : DURATION_LABELS[effectTimeDuration] ||
                                  effectTimeDuration,
                          },
                        ]}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#374151"
                          vertical={false}
                        />
                        <XAxis dataKey="name" stroke="#6b7280" fontSize={12} />
                        <YAxis stroke="#6b7280" fontSize={12} />
                        <Tooltip content={<ChartTooltip />} cursor={false} />
                        <Legend />
                        <Bar
                          dataKey="NodeA"
                          name="UV 365 nm"
                          fill="#8b5cf6"
                          radius={[6, 6, 0, 0]}
                          barSize={40}
                        />
                        <Bar
                          dataKey="NodeB"
                          name="UV 395 nm"
                          fill="#3b82f6"
                          radius={[6, 6, 0, 0]}
                          barSize={40}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>

            {/* DHT22 Chart — Grafik Suhu & Kelembaban */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 md:p-5 shadow-sm relative overflow-hidden group mb-6">
              <Wind className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 text-gray-200/70 dark:text-gray-900/10 rotate-12 transition-transform duration-[2s] group-hover:scale-110 group-hover:-rotate-12 z-0 pointer-events-none" />
              <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
                <h3 className="text-base md:text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                  <Wind className="w-5 h-5 text-cyan-500" />
                  Grafik Suhu &amp; Kelembaban
                </h3>
                <div className="flex flex-col gap-1.5 items-stretch w-full sm:w-fit">
                  {dhtTimeRange === "kustom" ? (
                    <div className="flex gap-1.5 items-center w-full sm:w-auto">
                      <input type="date" value={dhtCustomStart} onChange={e => setDhtCustomStart(e.target.value)}
                        className="flex-1 min-w-0 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-xs rounded-lg p-1.5 outline-none focus:ring-cyan-500 focus:border-cyan-500" />
                      <span className="text-gray-400 text-xs flex-shrink-0">–</span>
                      <input type="date" value={dhtCustomEnd} onChange={e => setDhtCustomEnd(e.target.value)}
                        className="flex-1 min-w-0 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-xs rounded-lg p-1.5 outline-none focus:ring-cyan-500 focus:border-cyan-500" />
                    </div>
                  ) : (
                    <select
                      aria-label="Pilih rentang waktu grafik suhu"
                      value={dhtTimeDuration}
                      onChange={(e) => setDhtTimeDuration(e.target.value)}
                      className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-xs rounded-lg focus:ring-cyan-500 focus:border-cyan-500 p-1.5 outline-none"
                    >
                      {dhtTimeRange === "hari" && (
                        <>
                          <option value="hari_ini">Hari Ini</option>
                          <option value="3_hari">3 Hari Terakhir</option>
                          <option value="7_hari">7 Hari Terakhir</option>
                        </>
                      )}
                      {dhtTimeRange === "minggu" && (
                        <>
                          <option value="minggu_ini">Minggu Ini</option>
                          <option value="4_minggu">4 Minggu Terakhir</option>
                          <option value="7_minggu">7 Minggu Terakhir</option>
                        </>
                      )}
                      {dhtTimeRange === "bulan" && (
                        <>
                          <option value="bulan_ini">Bulan Ini</option>
                          <option value="3_bulan">3 Bulan Terakhir</option>
                          <option value="6_bulan">6 Bulan Terakhir</option>
                        </>
                      )}
                      {dhtTimeRange === "tahun" && (
                        <>
                          <option value="tahun_ini">Tahun Ini</option>
                          <option value="2_tahun">1-2 Tahun Terakhir</option>
                          <option value="5_tahun">5 Tahun Terakhir</option>
                        </>
                      )}
                    </select>
                  )}
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="flex items-center w-full sm:w-auto bg-gray-100 dark:bg-gray-800 rounded-lg p-1 border border-gray-200 dark:border-gray-700">
                      {(["hari", "minggu", "bulan", "tahun", "kustom"] as const).map(
                        (t) => (
                          <button
                            key={t}
                            onClick={() => {
                              setDhtTimeRange(t);
                              setDhtTimeDuration(t === "kustom" ? "kustom" : t + "_ini");
                            }}
                            className={cn(
                              "px-2 py-1.5 rounded-md text-xs font-medium capitalize transition-colors flex-1 text-center",
                              dhtTimeRange === t
                                ? "bg-white dark:bg-gray-600 text-cyan-600 dark:text-cyan-400 shadow-sm"
                                : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200",
                            )}
                          >
                            {t === "kustom" ? "tanggal" : t}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {/* Rata-rata Suhu & Kelembaban */}
              {rataRataEnv && (
                <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                  <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-2.5 text-center">
                    <p className="text-[10px] text-orange-500 dark:text-orange-400 font-medium uppercase tracking-wide">Avg Suhu A</p>
                    <p className="text-xl font-bold text-orange-700 dark:text-orange-300 mt-0.5">
                      {rataRataEnv.A.temp ?? '–'}<span className="text-sm font-normal">°C</span>
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">{rataRataEnv.A.count} data</p>
                  </div>
                  <div className="bg-pink-50 dark:bg-pink-900/20 rounded-xl p-2.5 text-center">
                    <p className="text-[10px] text-pink-500 dark:text-pink-400 font-medium uppercase tracking-wide">Avg Suhu B</p>
                    <p className="text-xl font-bold text-pink-700 dark:text-pink-300 mt-0.5">
                      {rataRataEnv.B.temp ?? '–'}<span className="text-sm font-normal">°C</span>
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">{rataRataEnv.B.count} data</p>
                  </div>
                  <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-xl p-2.5 text-center">
                    <p className="text-[10px] text-cyan-500 dark:text-cyan-400 font-medium uppercase tracking-wide">Avg Hum A</p>
                    <p className="text-xl font-bold text-cyan-700 dark:text-cyan-300 mt-0.5">
                      {rataRataEnv.A.hum ?? '–'}<span className="text-sm font-normal">%</span>
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">{rataRataEnv.A.count} data</p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-2.5 text-center">
                    <p className="text-[10px] text-blue-500 dark:text-blue-400 font-medium uppercase tracking-wide">Avg Hum B</p>
                    <p className="text-xl font-bold text-blue-700 dark:text-blue-300 mt-0.5">
                      {rataRataEnv.B.hum ?? '–'}<span className="text-sm font-normal">%</span>
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">{rataRataEnv.B.count} data</p>
                  </div>
                </div>
              )}
              {dhtHistoryAll.length === 0 && dhtHistory.length === 0 ? (
                <div className="relative z-10 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                  <Droplets className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
                  <p className="text-gray-500 dark:text-gray-400 font-medium text-sm">
                    {isDemoMode ? "Menunggu data sensor DHT22" : "Belum ada data suhu/kelembaban tersimpan"}
                  </p>
                  <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
                    {isDemoMode
                      ? "Data akan muncul setelah NodeMCU terhubung."
                      : "Pastikan NodeMCU sudah pernah mengirim data dan kode.gs sudah di-redeploy."}
                  </p>
                </div>
              ) : (
                <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                  {/* Grafik Suhu */}
                  <div>
                    <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 mb-2 flex items-center gap-1">
                      <Thermometer className="w-3.5 h-3.5" /> Suhu (°C)
                      <span className="ml-auto flex gap-3 font-normal text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          <span className="w-4 h-1.5 bg-orange-500 rounded inline-block" />{" "}
                          A
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-4 h-1.5 bg-pink-400 rounded inline-block" />{" "}
                          B
                        </span>
                      </span>
                    </p>
                    <div className="h-44">
                      <ResponsiveContainer
                        width="100%"
                        height="100%"
                        minWidth={0}
                      >
                        <LineChart
                          data={dhtBuiltChartData}
                          margin={{ top: 5, right: 10, bottom: 5, left: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#374151"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="time"
                            stroke="#6b7280"
                            fontSize={10}
                            tick={{ fontSize: 10 }}
                            interval="preserveStartEnd"
                          />
                          <YAxis
                            stroke="#6b7280"
                            fontSize={11}
                            domain={["auto", "auto"]}
                            tickFormatter={(v) => `${v}°`}
                            width={44}
                          />
                          <Tooltip content={<ChartTooltip />} />
                          <Line
                            type="monotone"
                            dataKey="tempA"
                            stroke="#f97316"
                            strokeWidth={2}
                            dot={false}
                            connectNulls
                            name="Suhu A (°C)"
                            unit="°C"
                          >
                            <ErrorBar dataKey="tempA_sd" width={3} strokeWidth={1} stroke="#f97316" opacity={0.45} direction="y" />
                          </Line>
                          <Line
                            type="monotone"
                            dataKey="tempB"
                            stroke="#f9a8d4"
                            strokeWidth={2}
                            dot={false}
                            connectNulls
                            name="Suhu B (°C)"
                            unit="°C"
                          >
                            <ErrorBar dataKey="tempB_sd" width={3} strokeWidth={1} stroke="#f9a8d4" opacity={0.45} direction="y" />
                          </Line>
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Grafik Kelembaban */}
                  <div>
                    <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2 flex items-center gap-1">
                      <Droplets className="w-3.5 h-3.5" /> Kelembaban (%)
                      <span className="ml-auto flex gap-3 font-normal text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          <span className="w-4 h-1.5 bg-blue-500 rounded inline-block" />{" "}
                          A
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-4 h-1.5 bg-cyan-400 rounded inline-block" />{" "}
                          B
                        </span>
                      </span>
                    </p>
                    <div className="h-44">
                      <ResponsiveContainer
                        width="100%"
                        height="100%"
                        minWidth={0}
                      >
                        <LineChart
                          data={dhtBuiltChartData}
                          margin={{ top: 5, right: 10, bottom: 5, left: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#374151"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="time"
                            stroke="#6b7280"
                            fontSize={10}
                            tick={{ fontSize: 10 }}
                            interval="preserveStartEnd"
                          />
                          <YAxis
                            stroke="#6b7280"
                            fontSize={11}
                            domain={[0, 100]}
                            tickFormatter={(v) => `${v}%`}
                            width={44}
                          />
                          <Tooltip content={<ChartTooltip />} />
                          <Line
                            type="monotone"
                            dataKey="humA"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            dot={false}
                            connectNulls
                            name="Kelembaban A (%)"
                            unit="%"
                          >
                            <ErrorBar dataKey="humA_sd" width={3} strokeWidth={1} stroke="#3b82f6" opacity={0.45} direction="y" />
                          </Line>
                          <Line
                            type="monotone"
                            dataKey="humB"
                            stroke="#22d3ee"
                            strokeWidth={2}
                            dot={false}
                            connectNulls
                            name="Kelembaban B (%)"
                            unit="%"
                          >
                            <ErrorBar dataKey="humB_sd" width={3} strokeWidth={1} stroke="#22d3ee" opacity={0.45} direction="y" />
                          </Line>
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div
              className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6"
              id="log-section"
            >
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 md:p-5 lg:col-span-3 shadow-sm relative overflow-hidden">
                <List className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 text-gray-200/70 dark:text-gray-900/10 rotate-[5deg] z-0 pointer-events-none" />
                <div className="relative z-10 flex justify-between items-center mb-4">
                  <h3 className="text-base md:text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <Bug className="w-5 h-5 text-emerald-500" />
                    Log Deteksi Sensor (Real-time)
                  </h3>
                  <div className="flex gap-1.5 items-center">
                    <button
                      aria-label="Unduh database Excel"
                      onClick={handleDownloadExcel}
                      className="p-2 rounded-lg text-emerald-700 bg-emerald-100 hover:bg-emerald-200 dark:text-emerald-300 dark:bg-emerald-900/40 dark:hover:bg-emerald-900/60 transition-colors"
                      title="Unduh Database Lengkap (Excel)"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      aria-label="Reset semua log deteksi"
                      onClick={() => {
                        setLogResetScope("dashboard");
                        setIsLogResetModalOpen(true);
                      }}
                      className="p-2 rounded-lg text-orange-700 bg-orange-100 hover:bg-orange-200 dark:text-orange-300 dark:bg-orange-900/40 dark:hover:bg-orange-900/60 transition-colors"
                      title="Reset semua log deteksi"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button
                      aria-label="Simpan ke Google Sheet"
                      onClick={syncToGoogleSheet}
                      disabled={isSyncingSheet}
                      className="p-2 rounded-lg text-blue-700 bg-blue-100 hover:bg-blue-200 dark:text-blue-300 dark:bg-blue-900/40 dark:hover:bg-blue-900/60 transition-colors disabled:opacity-50"
                      title="Kirim ke Google Sheet"
                    >
                      {isSyncingSheet ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Database className="w-4 h-4" />
                      )}
                    </button>
                    {isDemoMode && (
                      <button
                        aria-label="Sinkronisasi log demo"
                        onClick={generateLogsSync}
                        className="p-2 rounded-lg text-purple-600 bg-purple-50 hover:bg-purple-100 dark:text-purple-400 dark:bg-purple-900/30 dark:hover:bg-purple-900/50 transition-colors"
                        title="Sinkronisasi Log Demo"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 mb-4 bg-gray-50 dark:bg-gray-800/50 p-2 sm:p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                  <select
                    aria-label="Filter sumber data log"
                    value={filterSource}
                    onChange={(e) => setFilterSource(e.target.value)}
                    className="flex-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 p-2 outline-none"
                  >
                    <option value="all">Semua Node (Sumber)</option>
                    <option value="Node A (UV 365 nm)">
                      Node A (UV 365 nm)
                    </option>
                    <option value="Node B (UV 395 nm)">
                      Node B (UV 395 nm)
                    </option>
                  </select>
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="date"
                      value={filterStartDate}
                      onChange={(e) => setFilterStartDate(e.target.value)}
                      className="flex-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 p-2 outline-none"
                      title="Tanggal Mulai"
                    />
                    <span className="text-gray-500 dark:text-gray-400 font-semibold px-1">
                      -
                    </span>
                    <input
                      type="date"
                      value={filterEndDate}
                      onChange={(e) => setFilterEndDate(e.target.value)}
                      className="flex-1 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 p-2 outline-none"
                      title="Tanggal Akhir"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 max-h-80 overflow-y-auto">
                  <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    <thead className="text-xs text-gray-700 dark:text-gray-300 uppercase bg-gray-50 dark:bg-gray-900 sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-3 text-center w-12">No.</th>
                        <th className="px-4 py-3">Waktu (Timestamp)</th>
                        <th className="px-4 py-3">Sumber Node</th>
                        <th className="px-4 py-3">Aksi Deteksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {isDataLoading ? (
                        Array.from({ length: 4 }).map((_, i) => (
                          <tr key={i} className="animate-pulse">
                            <td className="px-3 py-3">
                              <div className="h-4 bg-gray-200 dark:bg-gray-700/50 rounded w-6 mx-auto"></div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="h-4 bg-gray-200 dark:bg-gray-700/50 rounded w-24"></div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="h-4 bg-gray-200 dark:bg-gray-700/50 rounded w-32"></div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="h-4 bg-gray-200 dark:bg-gray-700/50 rounded w-20"></div>
                            </td>
                          </tr>
                        ))
                      ) : paginatedLogs.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-4 py-8 text-center text-gray-400 dark:text-gray-500"
                          >
                            <SatelliteDish className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                            {logs.length === 0
                              ? "Menunggu koneksi dan data masuk..."
                              : "Tidak ada log yang sesuai dengan filter."}
                          </td>
                        </tr>
                      ) : (
                        paginatedLogs.map((log, index) => (
                          <tr
                            key={log.id}
                            className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition cursor-help relative group"
                            title={`Detail Aktivitas:\nWaktu: ${new Date(log.timestamp).toLocaleString("id-ID")}\nSumber: ${log.source}\nAksi Lengkap: Hama terdeteksi memotong pancaran sensor inframerah (${log.action || "IR Terpicu (+1)"}). Data berhasil direkam sistem.`}
                          >
                            <td className="px-3 py-3 text-center text-xs font-mono font-semibold text-gray-400 dark:text-gray-500">
                              {(logCurrentPage - 1) * logsPerPage + index + 1}
                            </td>
                            <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-200">
                              {new Date(log.timestamp).toLocaleString("id-ID", {
                                dateStyle: "short",
                                timeStyle: "medium",
                              })}
                            </td>
                            <td className="px-4 py-3 dark:text-gray-300">
                              {log.source}
                            </td>
                            <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="w-4 h-4" />
                              <span className="underline decoration-emerald-300 dark:decoration-emerald-700 decoration-dashed underline-offset-4">
                                {log.action || "IR Terpicu (+1)"}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {totalLogPages > 1 && (
                  <div className="flex items-center justify-between mt-4 gap-2">
                    <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 min-w-0">
                      <span className="sm:hidden">
                        {(logCurrentPage - 1) * logsPerPage + 1}–
                        {Math.min(
                          logCurrentPage * logsPerPage,
                          filteredLogs.length,
                        )}{" "}
                        / {filteredLogs.length}
                      </span>
                      <span className="hidden sm:inline">
                        Menampilkan {(logCurrentPage - 1) * logsPerPage + 1} –{" "}
                        {Math.min(
                          logCurrentPage * logsPerPage,
                          filteredLogs.length,
                        )}{" "}
                        dari {filteredLogs.length} data
                      </span>
                    </span>
                    <div className="flex gap-1 shrink-0">
                      <button
                        aria-label="Halaman sebelumnya"
                        onClick={() =>
                          setLogCurrentPage((p) => Math.max(1, p - 1))
                        }
                        disabled={logCurrentPage === 1}
                        className="px-2 sm:px-3 py-1 text-xs sm:text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300 rounded disabled:opacity-50 transition-colors min-w-[2rem] text-center"
                      >
                        <span className="hidden sm:inline">Mundur</span>
                        <span className="sm:hidden">‹</span>
                      </button>
                      <div className="px-2 sm:px-3 py-1 text-xs sm:text-sm bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded font-semibold border border-emerald-100 dark:border-emerald-800 whitespace-nowrap">
                        {logCurrentPage} / {totalLogPages}
                      </div>
                      <button
                        aria-label="Halaman berikutnya"
                        onClick={() =>
                          setLogCurrentPage((p) =>
                            Math.min(totalLogPages, p + 1),
                          )
                        }
                        disabled={logCurrentPage === totalLogPages}
                        className="px-2 sm:px-3 py-1 text-xs sm:text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300 rounded disabled:opacity-50 transition-colors min-w-[2rem] text-center"
                      >
                        <span className="hidden sm:inline">Maju</span>
                        <span className="sm:hidden">›</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {isDemoMode && (
                <div className="lg:col-span-3 bg-emerald-50/50 dark:bg-emerald-900/20 rounded-2xl p-4 md:p-5 border border-emerald-100 dark:border-emerald-800/30">
                  <div className="flex items-center gap-2 mb-3">
                    <Microscope className="text-emerald-600 dark:text-emerald-400 w-5 h-5 shrink-0" />
                    <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-400">
                      Modul Evaluasi Akurasi Sensor
                    </h3>
                  </div>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300/70 mb-4 leading-relaxed">
                    Masukkan jumlah tangkapan fisik (manual) di toples pagi hari
                    untuk menghitung error rate pembacaan sensor IR.
                  </p>
                  {/* Input + button: 1 kolom mobile → 2 kolom sm → 3 kolom lg (sejajar) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
                    <div>
                      <label htmlFor="eval-365" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Tangkapan Fisik 365 nm (Node A)
                      </label>
                      <input
                        id="eval-365"
                        type="number"
                        value={manual365}
                        onChange={(e) => setManual365(e.target.value)}
                        placeholder="Contoh: 140"
                        className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5 transition-colors"
                      />
                    </div>
                    <div>
                      <label htmlFor="eval-395" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Tangkapan Fisik 395 nm (Node B)
                      </label>
                      <input
                        id="eval-395"
                        type="number"
                        value={manual395}
                        onChange={(e) => setManual395(e.target.value)}
                        placeholder="Contoh: 95"
                        className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5 transition-colors"
                      />
                    </div>
                    <button
                      onClick={calculateAccuracy}
                      className="sm:col-span-2 lg:col-span-1 w-full text-white bg-emerald-600 hover:bg-emerald-700 focus:ring-4 focus:ring-emerald-300 font-medium rounded-lg text-sm px-4 py-2.5 transition text-center shadow-sm whitespace-nowrap"
                    >
                      Kalkulasi Akurasi
                    </button>
                  </div>

                  {evaluation && (
                    <div className="mt-4 grid grid-cols-2 gap-3 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                      <div className="text-center">
                        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">
                          Error Rate 365 nm
                        </p>
                        <p
                          className={cn(
                            "text-2xl font-bold",
                            evaluation.err365 <= 5
                              ? "text-green-500"
                              : evaluation.err365 <= 10
                                ? "text-yellow-500"
                                : "text-red-500",
                          )}
                        >
                          {evaluation.err365.toFixed(2)}%
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">
                          Error Rate 395 nm
                        </p>
                        <p
                          className={cn(
                            "text-2xl font-bold",
                            evaluation.err395 <= 5
                              ? "text-green-500"
                              : evaluation.err395 <= 10
                                ? "text-yellow-500"
                                : "text-red-500",
                          )}
                        >
                          {evaluation.err395.toFixed(2)}%
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <footer className="mt-8 text-center text-xs text-gray-400 dark:text-gray-500 pb-4">
              &copy; 2026 Riyan (2305125) - Politeknik LPP Yogyakarta. Sistem
              Monitoring Light Trap UPDKS.
              <span className="block mt-1 text-[10px] text-gray-400 dark:text-gray-600">
                Terakhir diperbarui: {LAST_UPDATED}
              </span>
            </footer>
          </div>
        </main>

        {/* Settings Modal */}
        {isSettingsOpen && (
          <div
            className="fixed inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center transition-opacity"
            onClick={(e) =>
              e.target === e.currentTarget && setSettingsOpen(false)
            }
          >
            <div className="bg-white dark:bg-gray-800 w-[90%] max-w-sm rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[90vh]">
              <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 shrink-0">
                <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
                  <SettingsIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />{" "}
                  Pengaturan Halaman
                </h3>
                <button
                  aria-label="Tutup pengaturan"
                  onClick={() => setSettingsOpen(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="px-5 py-2 bg-emerald-50/50 dark:bg-emerald-900/10 border-b border-gray-100 dark:border-gray-700/50 text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5 shrink-0">
                <RefreshCw className="w-3 h-3 text-emerald-500" />
                Terakhir diperbarui: <span className="font-semibold text-gray-700 dark:text-gray-300">{LAST_UPDATED}</span>
              </div>
              <div className="p-5 space-y-6 overflow-y-auto flex-1">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Sumber Data (Koneksi)
                  </label>
                  <div
                    className="flex items-center bg-emerald-50 dark:bg-emerald-900/30 rounded-lg p-1.5 border border-emerald-200 dark:border-emerald-800 cursor-pointer w-full"
                    onClick={() => {
                      // Kedua mode (Demo & Asli) kini wajib login akun tipe tsb.
                      // Beralih mode = logout & buka gate login untuk mode tujuan.
                      const target = !isDemoMode;
                      setIsDemoMode(target);
                      localStorage.setItem("isDemoMode", String(target));
                      setUserProfile(null);
                      localStorage.removeItem("userProfile");
                      setLoginMode("login");
                      setPendingRealMode(false);
                      setSettingsOpen(false);
                      setLoginModalOpen(true);
                    }}
                  >
                    <div
                      className={cn(
                        "flex-1 text-center py-2.5 text-xs sm:text-sm font-bold rounded-md transition-all",
                        isDemoMode
                          ? "bg-white dark:bg-emerald-700 shadow-sm text-emerald-700 dark:text-white"
                          : "text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      DATA DEMO
                    </div>
                    <div
                      className={cn(
                        "flex-1 text-center py-2.5 text-xs sm:text-sm font-bold rounded-md transition-all",
                        !isDemoMode
                          ? "bg-white dark:bg-emerald-700 shadow-sm text-emerald-700 dark:text-white"
                          : "text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      DATA ASLI
                    </div>
                  </div>
                </div>
                <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Tema Tampilan
                  </label>
                  <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1.5 border border-gray-200 dark:border-gray-700 w-full justify-between gap-1">
                    {["light", "system", "dark"].map((t) => (
                      <button
                        key={t}
                        onClick={() => {
                          setTheme(t as any);
                          localStorage.setItem("theme", t);
                          setSettingsOpen(false);
                        }}
                        className={cn(
                          "flex-1 py-2 rounded-md flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 transition-colors text-xs font-medium capitalize",
                          theme === t
                            ? "bg-white dark:bg-gray-600 shadow-sm text-emerald-600 dark:text-emerald-400"
                            : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-300",
                        )}
                      >
                        {t === "light"
                          ? "Terang"
                          : t === "dark"
                            ? "Gelap"
                            : "Sistem"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Buffer Data Baterai (Offline)
                  </label>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400 leading-tight max-w-[200px]">
                      Proses data baterai saat WiFi kembali online
                    </span>
                    <button
                      onClick={() => {
                        const newVal = !bufferBatteryEnabled;
                        setBufferBatteryEnabled(newVal);
                        localStorage.setItem(
                          "bufferBatteryEnabled",
                          String(newVal),
                        );
                        // Publish retained agar semua device sinkron
                        mqttClientRef.current?.publish(
                          "dashboard/ngengat/settings",
                          JSON.stringify({ bufferBattery: newVal }),
                          { retain: true, qos: 1 },
                        );
                      }}
                      aria-label={
                        bufferBatteryEnabled
                          ? "Nonaktifkan buffer baterai"
                          : "Aktifkan buffer baterai"
                      }
                      className={cn(
                        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none",
                        bufferBatteryEnabled
                          ? "bg-emerald-500"
                          : "bg-gray-300 dark:bg-gray-600",
                      )}
                      title={
                        bufferBatteryEnabled
                          ? "Buffer baterai aktif"
                          : "Buffer baterai nonaktif"
                      }
                    >
                      <span
                        className={cn(
                          "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                          bufferBatteryEnabled
                            ? "translate-x-6"
                            : "translate-x-1",
                        )}
                      />
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-1.5">
                    {bufferBatteryEnabled
                      ? "Aktif — data baterai dari buffer akan diproses"
                      : "Nonaktif — data baterai buffer diabaikan dashboard"}
                  </p>
                </div>
                {/* Jam Aktif Telegram */}
                <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Jam Aktif Perintah Telegram
                  </label>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-3">
                    Di luar jam ini sensor <strong>tidak merespons perintah</strong> Telegram
                    (hemat RAM &amp; prioritas deteksi). Notifikasi deteksi tetap jalan.
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Mulai</span>
                    <select
                      value={tgWindow.start}
                      onChange={(e) => {
                        const w = { ...tgWindow, start: Number(e.target.value) };
                        setTgWindow(w);
                        publishTgWindow(w);
                      }}
                      className="text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 outline-none"
                      aria-label="Jam mulai Telegram aktif"
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                      ))}
                    </select>
                    <span className="text-xs text-gray-500 dark:text-gray-400">Selesai</span>
                    <select
                      value={tgWindow.end}
                      onChange={(e) => {
                        const w = { ...tgWindow, end: Number(e.target.value) };
                        setTgWindow(w);
                        publishTgWindow(w);
                      }}
                      className="text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 outline-none"
                      aria-label="Jam selesai Telegram aktif"
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                      ))}
                    </select>
                  </div>
                  <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-1.5">
                    Perintah aktif {String(tgWindow.start).padStart(2, "0")}:00–
                    {String(tgWindow.end).padStart(2, "0")}:00 WIB
                    {tgWindow.start === tgWindow.end ? " (24 jam)" : ""}
                  </p>
                </div>
                {/* Kontrol Relay Lampu */}
                <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Kontrol Relay Lampu UV
                  </label>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-3">
                    Kontrol manual lampu UV tiap node. <strong>Auto</strong> =
                    ikuti jadwal DS3231 (ON 18:00 / OFF 06:00).
                  </p>
                  <div className="space-y-2.5">
                    {(["A", "B"] as const).map((node) => {
                      const isOn = node === "A" ? nodeA.led : nodeB.led;
                      const isOnline =
                        node === "A" ? nodeA.online : nodeB.online;
                      const mode = relayMode[node];
                      const label =
                        node === "A"
                          ? "Node A — UV 365nm"
                          : "Node B — UV 395nm";

                      const publishRelay = (state: boolean) => {
                        if (!mqttClientRef.current) return;
                        mqttClientRef.current.publish(
                          "dashboard/ngengat/relay",
                          JSON.stringify({ node, state }),
                        );
                        setRelayMode((prev) => ({ ...prev, [node]: "manual" }));
                        if (node === "A")
                          setNodeA((p) => ({ ...p, led: state }));
                        else setNodeB((p) => ({ ...p, led: state }));
                      };

                      const publishAuto = () => {
                        if (!mqttClientRef.current) return;
                        mqttClientRef.current.publish(
                          "dashboard/ngengat/relay",
                          JSON.stringify({ node, auto: true }),
                        );
                        setRelayMode((prev) => ({ ...prev, [node]: "auto" }));
                      };

                      const statusText = !isOnline
                        ? "Node Offline"
                        : mode === "auto"
                          ? `Otomatis — Lampu ${isOn ? "Menyala" : "Mati"}`
                          : `Manual — Lampu ${isOn ? "Menyala" : "Mati"}`;
                      const statusColor = !isOnline
                        ? "text-red-400"
                        : mode === "auto"
                          ? "text-emerald-500 dark:text-emerald-400"
                          : isOn
                            ? "text-yellow-500"
                            : "text-gray-400 dark:text-gray-500";

                      return (
                        <div
                          key={node}
                          className="bg-gray-50 dark:bg-gray-700/50 rounded-xl px-3 py-2.5 border border-gray-200 dark:border-gray-600"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                                {label}
                              </p>
                              <p
                                className={`text-[10px] font-medium mt-0.5 ${statusColor}`}
                              >
                                {statusText}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              disabled={
                                !isOnline ||
                                !mqttClientRef.current ||
                                isDemoMode
                              }
                              onClick={() => publishRelay(false)}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                mode === "manual" && !isOn && isOnline
                                  ? "bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 border-gray-400 dark:border-gray-400"
                                  : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                              }`}
                            >
                              OFF
                            </button>
                            <button
                              disabled={
                                !isOnline ||
                                !mqttClientRef.current ||
                                isDemoMode
                              }
                              onClick={publishAuto}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                mode === "auto" && isOnline
                                  ? "bg-emerald-500 text-white border-emerald-600"
                                  : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                              }`}
                            >
                              AUTO
                            </button>
                            <button
                              disabled={
                                !isOnline ||
                                !mqttClientRef.current ||
                                isDemoMode
                              }
                              onClick={() => publishRelay(true)}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                mode === "manual" && isOn && isOnline
                                  ? "bg-yellow-400 text-yellow-900 border-yellow-500"
                                  : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20"
                              }`}
                            >
                              ON
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {isDemoMode && (
                    <p className="text-[10px] text-amber-500 dark:text-amber-400 mt-2 text-center">
                      Mode Demo — kontrol relay tidak aktif
                    </p>
                  )}
                </div>
                <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Panduan Perakitan
                  </label>
                  <button
                    onClick={() => {
                      setIsWiringGuideOpen(true);
                      setSettingsOpen(false);
                    }}
                    className="w-full py-2.5 px-4 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-lg text-sm font-semibold flex items-center gap-2.5 transition-colors"
                  >
                    <Cable className="w-4 h-4 shrink-0" />
                    <span className="flex-1 text-left">Panduan Wiring Modul ke NodeMCU ESP8266</span>
                  </button>
                  <button
                    onClick={() => { setIsScheduleOpen(true); setSettingsOpen(false); }}
                    className="w-full mt-2 py-2.5 px-4 bg-violet-50 hover:bg-violet-100 dark:bg-violet-900/20 dark:hover:bg-violet-900/40 text-violet-700 dark:text-violet-400 border border-violet-200 dark:border-violet-800 rounded-lg text-sm font-semibold flex items-center gap-2.5 transition-colors"
                  >
                    <Clock className="w-4 h-4 shrink-0" />
                    <span className="flex-1 text-left">Jadwal Alarm DS3231</span>
                    <span className="bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300 text-xs px-2 py-0.5 rounded-full font-mono shrink-0">
                      {schedules.filter(s => s.enabled).length}/{schedules.length}
                    </span>
                  </button>
                </div>
                <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Manajemen Database Sheet
                  </label>
                  <button
                    onClick={() => {
                      setIsSheetManagerOpen(true);
                      setSettingsOpen(false);
                    }}
                    className="w-full py-2.5 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <Database className="w-4 h-4" />
                    Kelola Sheet Tidak Terpakai
                  </button>
                </div>
              </div>
              <div className="px-5 py-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 text-center shrink-0">
                <button
                  onClick={() => setSettingsOpen(false)}
                  className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  Tutup Pengaturan
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Wiring Guide Modal */}
        {isWiringGuideOpen && (
          <div
            className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) =>
              e.target === e.currentTarget && setIsWiringGuideOpen(false)
            }
          >
            <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 shrink-0 rounded-t-2xl">
                <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
                  <Cable className="w-5 h-5 text-blue-500" />
                  Panduan Wiring Modul ke NodeMCU ESP8266 v3
                </h3>
                <button
                  aria-label="Tutup panduan wiring"
                  onClick={() => setIsWiringGuideOpen(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable content */}
              <div className="overflow-y-auto p-5 space-y-4">
                {/* Info */}
                <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Berdasarkan kode{" "}
                    <code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded font-mono">
                      main.cpp
                    </code>
                    . Pin yang sama berlaku untuk Node A dan Node B.
                  </span>
                </div>

                {/* DHT22 */}
                <div className="border border-orange-200 dark:border-orange-800/50 rounded-xl overflow-hidden">
                  <div className="bg-orange-50 dark:bg-orange-900/20 px-4 py-2.5 flex items-center gap-2">
                    <Thermometer className="w-4 h-4 text-orange-500" />
                    <span className="font-semibold text-sm text-orange-700 dark:text-orange-300">
                      DHT22 — Suhu &amp; Kelembaban
                    </span>
                  </div>
                  <div className="p-4">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                          <th className="text-left pb-2 font-semibold">
                            Pin DHT22
                          </th>
                          <th className="text-left pb-2 font-semibold">
                            NodeMCU ESP8266 v3
                          </th>
                          <th className="text-left pb-2 font-semibold">
                            Keterangan
                          </th>
                        </tr>
                      </thead>
                      <tbody className="text-gray-700 dark:text-gray-300 space-y-1">
                        <tr className="border-b border-gray-50 dark:border-gray-700/50">
                          <td className="py-1.5 font-mono font-bold">VCC</td>
                          <td className="py-1.5 font-mono text-red-500">
                            3.3V
                          </td>
                          <td className="py-1.5">Tegangan input</td>
                        </tr>
                        <tr className="border-b border-gray-50 dark:border-gray-700/50">
                          <td className="py-1.5 font-mono font-bold">GND</td>
                          <td className="py-1.5 font-mono text-gray-500">
                            GND
                          </td>
                          <td className="py-1.5">Ground</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 font-mono font-bold">DATA</td>
                          <td className="py-1.5 font-mono text-blue-500 font-bold">
                            D2 (GPIO4)
                          </td>
                          <td className="py-1.5">Pin data sensor</td>
                        </tr>
                      </tbody>
                    </table>
                    <div className="mt-2.5 flex items-start gap-1.5 text-[11px] text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/10 rounded-lg p-2">
                      <Zap className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>
                        Tambahkan resistor <strong>10kΩ</strong> antara pin DATA
                        dan VCC (pull-up). Tanpa ini sensor sering gagal baca.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Sensor IR */}
                <div className="border border-purple-200 dark:border-purple-800/50 rounded-xl overflow-hidden">
                  <div className="bg-purple-50 dark:bg-purple-900/20 px-4 py-2.5 flex items-center gap-2">
                    <Bug className="w-4 h-4 text-purple-500" />
                    <span className="font-semibold text-sm text-purple-700 dark:text-purple-300">
                      Sensor IR KY-032 — Deteksi Ngengat
                    </span>
                  </div>
                  <div className="p-4">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                          <th className="text-left pb-2 font-semibold">
                            Pin Sensor IR
                          </th>
                          <th className="text-left pb-2 font-semibold">
                            NodeMCU ESP8266 v3
                          </th>
                          <th className="text-left pb-2 font-semibold">
                            Keterangan
                          </th>
                        </tr>
                      </thead>
                      <tbody className="text-gray-700 dark:text-gray-300">
                        <tr className="border-b border-gray-50 dark:border-gray-700/50">
                          <td className="py-1.5 font-mono font-bold">+&nbsp;(VCC)</td>
                          <td className="py-1.5 font-mono text-red-500">3.3V</td>
                          <td className="py-1.5">Tegangan sensor — pakai 3.3V agar aman untuk GPIO ESP8266</td>
                        </tr>
                        <tr className="border-b border-gray-50 dark:border-gray-700/50">
                          <td className="py-1.5 font-mono font-bold">GND</td>
                          <td className="py-1.5 font-mono text-gray-500">GND</td>
                          <td className="py-1.5">Ground</td>
                        </tr>
                        <tr className="border-b border-gray-50 dark:border-gray-700/50">
                          <td className="py-1.5 font-mono font-bold">OUT</td>
                          <td className="py-1.5 font-mono text-blue-500 font-bold">D1 (GPIO5)</td>
                          <td className="py-1.5">Sinyal deteksi — LOW saat objek terdeteksi</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 font-mono font-bold">EN</td>
                          <td className="py-1.5 font-mono text-orange-500 font-bold">3.3V / Jumper</td>
                          <td className="py-1.5">Enable sensor — biarkan jumper terpasang, atau sambung ke 3.3V. <strong>Jangan dibiarkan floating</strong></td>
                        </tr>
                      </tbody>
                    </table>
                    <div className="mt-2.5 flex items-start gap-1.5 text-[11px] text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/10 rounded-lg p-2">
                      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>
                        OUT bernilai <strong>LOW</strong> saat objek terdeteksi (active low) — sama seperti LM393.
                        Ada 2 trimpot: satu mengatur jarak deteksi, satu mengatur frekuensi IR.
                        LED indikator di modul akan menyala saat mendeteksi objek — pakai ini untuk uji coba awal.
                        Jika sensor tidak mendeteksi: (1) pastikan pin EN tidak floating, (2) putar trimpot jarak searah jarum jam perlahan.
                      </span>
                    </div>
                  </div>
                </div>

                {/* DS3231 RTC */}
                <div className="border border-cyan-200 dark:border-cyan-800/50 rounded-xl overflow-hidden">
                  <div className="bg-cyan-50 dark:bg-cyan-900/20 px-4 py-2.5 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-cyan-500" />
                    <span className="font-semibold text-sm text-cyan-700 dark:text-cyan-300">
                      DS3231 RTC — Waktu Akurat
                    </span>
                  </div>
                  <div className="p-4">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                          <th className="text-left pb-2 font-semibold">
                            Pin DS3231
                          </th>
                          <th className="text-left pb-2 font-semibold">
                            NodeMCU ESP8266 v3
                          </th>
                          <th className="text-left pb-2 font-semibold">
                            Keterangan
                          </th>
                        </tr>
                      </thead>
                      <tbody className="text-gray-700 dark:text-gray-300">
                        <tr className="border-b border-gray-50 dark:border-gray-700/50">
                          <td className="py-1.5 font-mono font-bold">VCC</td>
                          <td className="py-1.5 font-mono text-red-500">
                            3.3V
                          </td>
                          <td className="py-1.5">Tegangan input</td>
                        </tr>
                        <tr className="border-b border-gray-50 dark:border-gray-700/50">
                          <td className="py-1.5 font-mono font-bold">GND</td>
                          <td className="py-1.5 font-mono text-gray-500">
                            GND
                          </td>
                          <td className="py-1.5">Ground</td>
                        </tr>
                        <tr className="border-b border-gray-50 dark:border-gray-700/50">
                          <td className="py-1.5 font-mono font-bold">SDA</td>
                          <td className="py-1.5 font-mono text-blue-500 font-bold">
                            D5 (GPIO14)
                          </td>
                          <td className="py-1.5">I2C data (custom)</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 font-mono font-bold">SCL</td>
                          <td className="py-1.5 font-mono text-blue-500 font-bold">
                            D6 (GPIO12)
                          </td>
                          <td className="py-1.5">I2C clock (custom)</td>
                        </tr>
                      </tbody>
                    </table>
                    <div className="mt-2 flex items-start gap-1.5 text-[11px] text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/10 rounded-lg p-2">
                      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p>
                          I2C menggunakan pin <strong>custom</strong> (D5=SDA, D6=SCL) agar D1 &amp; D2 bebas untuk sensor IR dan DHT22. Pin SQW <strong>tidak digunakan</strong>.
                        </p>
                        <p>
                          Jika Serial Monitor menampilkan <strong>"RTC tidak ditemukan"</strong>: pasang resistor pull-up <strong>4.7kΩ</strong> dari pin <strong>SDA ke 3.3V</strong> dan <strong>SCL ke 3.3V</strong>. Modul DS3231 beberapa varian tidak punya pull-up internal.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Relay */}
                <div className="border border-yellow-200 dark:border-yellow-800/50 rounded-xl overflow-hidden">
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 px-4 py-2.5 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-yellow-500" />
                    <span className="font-semibold text-sm text-yellow-700 dark:text-yellow-300">
                      Relay 1 Channel — Kontrol Lampu UV
                    </span>
                  </div>
                  <div className="p-4">
                    <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1.5">
                      Sisi input (kontrol) — ke NodeMCU:
                    </p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                          <th className="text-left pb-2 font-semibold">
                            Pin Relay
                          </th>
                          <th className="text-left pb-2 font-semibold">
                            NodeMCU ESP8266 v3
                          </th>
                          <th className="text-left pb-2 font-semibold">
                            Keterangan
                          </th>
                        </tr>
                      </thead>
                      <tbody className="text-gray-700 dark:text-gray-300">
                        <tr className="border-b border-gray-50 dark:border-gray-700/50">
                          <td className="py-1.5 font-mono font-bold">VCC</td>
                          <td className="py-1.5 font-mono text-red-500">5V</td>
                          <td className="py-1.5">Dari pin VU (5V USB)</td>
                        </tr>
                        <tr className="border-b border-gray-50 dark:border-gray-700/50">
                          <td className="py-1.5 font-mono font-bold">GND</td>
                          <td className="py-1.5 font-mono text-gray-500">
                            GND
                          </td>
                          <td className="py-1.5">Ground</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 font-mono font-bold">IN</td>
                          <td className="py-1.5 font-mono text-blue-500 font-bold">
                            D7 (GPIO13)
                          </td>
                          <td className="py-1.5">Sinyal kontrol</td>
                        </tr>
                      </tbody>
                    </table>
                    <div className="mt-2.5 flex items-start gap-1.5 text-[11px] text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/10 rounded-lg p-2">
                      <Zap className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>
                        <strong>Active LOW</strong>: IN=LOW → relay ON (lampu
                        menyala), IN=HIGH → relay OFF. Jadwal otomatis:{" "}
                        <strong>18:00 ON</strong> — <strong>06:00 OFF</strong>{" "}
                        (dikontrol DS3231).
                      </span>
                    </div>

                    {/* Jumper Hi/Lo */}
                    <div className="mt-2 flex items-start gap-1.5 text-[11px] text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/10 rounded-lg p-2">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>
                        <strong>PENTING — Jumper Hi/Lo:</strong> modul ini punya
                        jumper pemilih trigger (High/Low) di dekat pin IN.
                        Punyamu sekarang ada di posisi <strong>High</strong> —{" "}
                        <strong>pindahkan ke posisi LOW (L)</strong>. Firmware
                        memakai <em>Active LOW</em>, jadi jika tetap di High relay
                        akan menyala terbalik (ON di luar jadwal).
                      </span>
                    </div>

                    {/* Wiring sisi output ke bohlam DC */}
                    <p className="mt-3 text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                      Sisi output (screw terminal) — ke Bohlam DC:
                    </p>
                    <table className="w-full text-xs mt-1.5">
                      <thead>
                        <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                          <th className="text-left pb-2 font-semibold">
                            Terminal Relay
                          </th>
                          <th className="text-left pb-2 font-semibold">
                            Disambung ke
                          </th>
                        </tr>
                      </thead>
                      <tbody className="text-gray-700 dark:text-gray-300">
                        <tr className="border-b border-gray-50 dark:border-gray-700/50">
                          <td className="py-1.5 font-mono font-bold">COM</td>
                          <td className="py-1.5">
                            Kutub <strong>+</strong> sumber DC (baterai/adaptor)
                          </td>
                        </tr>
                        <tr className="border-b border-gray-50 dark:border-gray-700/50">
                          <td className="py-1.5 font-mono font-bold text-emerald-600">
                            NO
                          </td>
                          <td className="py-1.5">
                            Kaki <strong>+</strong> bohlam DC
                          </td>
                        </tr>
                        <tr>
                          <td className="py-1.5 font-mono font-bold text-gray-400">
                            NC
                          </td>
                          <td className="py-1.5 text-gray-400">
                            Dikosongkan (tidak dipakai)
                          </td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Diagram jalur bohlam */}
                    <div className="mt-2 bg-yellow-100 dark:bg-yellow-900/20 rounded-lg p-3">
                      <div className="flex flex-col items-start gap-1 font-mono text-[10px]">
                        <span className="px-2 py-0.5 bg-red-500 text-white rounded font-bold w-fit">
                          Sumber DC (+)
                        </span>
                        <span className="text-yellow-500 pl-3 leading-tight">↓</span>
                        <span className="px-2 py-0.5 bg-gray-700 text-white rounded font-bold w-fit">
                          COM (relay)
                        </span>
                        <span className="text-yellow-500 pl-3 leading-tight">↓ saat relay ON</span>
                        <span className="px-2 py-0.5 bg-emerald-600 text-white rounded font-bold w-fit">
                          NO (relay)
                        </span>
                        <span className="text-yellow-500 pl-3 leading-tight">↓</span>
                        <span className="px-2 py-0.5 bg-amber-500 text-white rounded font-bold w-fit">
                          Bohlam (+) … Bohlam (−)
                        </span>
                        <span className="text-yellow-500 pl-3 leading-tight">↓</span>
                        <span className="px-2 py-0.5 bg-gray-600 text-white rounded font-bold w-fit">
                          Sumber DC (−)
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 flex items-start gap-1.5 text-[11px] text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/10 rounded-lg p-2">
                      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>
                        Bohlam DC <strong>tidak</strong> diberi daya dari pin
                        NodeMCU — relay hanya bertindak sebagai{" "}
                        <strong>saklar</strong> yang memutus/menyambung jalur{" "}
                        <strong>+</strong> dari sumber DC. Pakai sumber DC yang
                        sesuai tegangan bohlam (mis. 12V). Sisi NodeMCU (VCC/GND/IN)
                        terisolasi dari sisi bohlam lewat optocoupler, jadi aman.
                        Pakai terminal <strong>NO</strong> supaya bohlam{" "}
                        <strong>MATI</strong> saat relay OFF / NodeMCU mati.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Voltage Sensor Module 25V */}
                <div className="border border-green-200 dark:border-green-800/50 rounded-xl overflow-hidden">
                  <div className="bg-green-50 dark:bg-green-900/20 px-4 py-2.5 flex items-center gap-2">
                    <Battery className="w-4 h-4 text-green-500" />
                    <span className="font-semibold text-sm text-green-700 dark:text-green-300">
                      Voltage Sensor Module 25V — Monitor Baterai
                    </span>
                  </div>
                  <div className="p-4 space-y-3">
                    {/* Penjelasan pin + dan - */}
                    {/* Penjelasan 2 sisi modul */}
                    <div className="flex items-start gap-1.5 text-[11px] text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/10 rounded-lg p-2">
                      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p>Modul punya <strong>dua sisi berbeda</strong>:</p>
                        <p>
                          🔵 <strong>Kiri — Screw terminal biru</strong> (VCC &amp; GND):
                          untuk koneksi ke <strong>baterai</strong>.
                        </p>
                        <p>
                          🔌 <strong>Kanan — 3 pin header</strong> (S, +, −):
                          untuk koneksi ke <strong>NodeMCU</strong>. Pin{" "}
                          <strong>+</strong> di header adalah duplikat VCC
                          screw (tidak dipakai di sini).
                        </p>
                      </div>
                    </div>

                    {/* Tabel koneksi baterai */}
                    <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                      Sisi kiri — Screw terminal (ke Baterai):
                    </p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                          <th className="text-left pb-2 font-semibold">Screw Terminal</th>
                          <th className="text-left pb-2 font-semibold">Disambung ke</th>
                          <th className="text-left pb-2 font-semibold">Kabel</th>
                        </tr>
                      </thead>
                      <tbody className="text-gray-700 dark:text-gray-300">
                        <tr className="border-b border-gray-50 dark:border-gray-700/50">
                          <td className="py-1.5 font-mono font-bold text-red-500">VCC</td>
                          <td className="py-1.5 font-mono font-bold text-red-600">Terminal + Baterai</td>
                          <td className="py-1.5 text-red-500">Kabel merah baterai</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 font-mono font-bold text-gray-500">GND</td>
                          <td className="py-1.5 font-mono text-gray-600">Terminal − Baterai</td>
                          <td className="py-1.5 text-gray-500">Kabel hitam baterai</td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Tabel koneksi NodeMCU */}
                    <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                      Sisi kanan — 3 pin header (ke NodeMCU):
                    </p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                          <th className="text-left pb-2 font-semibold">Pin Header</th>
                          <th className="text-left pb-2 font-semibold">Disambung ke</th>
                          <th className="text-left pb-2 font-semibold">Keterangan</th>
                        </tr>
                      </thead>
                      <tbody className="text-gray-700 dark:text-gray-300">
                        <tr className="border-b border-gray-50 dark:border-gray-700/50">
                          <td className="py-1.5 font-mono font-bold text-blue-500">S</td>
                          <td className="py-1.5 font-mono text-blue-500 font-bold">A0 (NodeMCU)</td>
                          <td className="py-1.5">Output sinyal ADC</td>
                        </tr>
                        <tr className="border-b border-gray-50 dark:border-gray-700/50">
                          <td className="py-1.5 font-mono font-bold text-gray-400">+</td>
                          <td className="py-1.5 font-mono text-gray-400">— (tidak pakai)</td>
                          <td className="py-1.5 text-gray-400">Duplikat VCC screw</td>
                        </tr>
                        <tr>
                          <td className="py-1.5 font-mono font-bold text-gray-600">−</td>
                          <td className="py-1.5 font-mono text-gray-600 font-bold">GND (NodeMCU)</td>
                          <td className="py-1.5">Common ground wajib!</td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Catatan GND internal */}
                    <div className="flex items-start gap-1.5 text-[11px] text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/10 rounded-lg p-2">
                      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <div>
                        <strong>GND screw dan pin − header sudah terhubung di dalam PCB modul</strong>
                        {" "}(satu jalur tembaga). Tidak perlu menyolder kabel ekstra antara keduanya.
                        Cukup: GND screw → Baterai (−), pin − header → GND NodeMCU — otomatis common ground.
                      </div>
                    </div>

                    {/* Diagram wiring dasar */}
                    <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                      Diagram wiring lengkap:
                    </p>
                    <code className="block bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 font-mono text-[10px] leading-relaxed whitespace-pre overflow-x-auto text-gray-700 dark:text-gray-300">
{"── Sensor Modul ──────────────────\n"}
{"Baterai (+) ── VCC screw\n"}
{"Baterai (−) ── GND screw\n"}
{"               (= pin −, 1 jalur PCB)\n"}
{"   pin S ────────────► A0 NodeMCU\n"}
{"   pin − ────────────► GND NodeMCU\n"}
{"\n"}
{"── Daya NodeMCU (Buck Converter) ─\n"}
{"Baterai (+) ── Buck IN+\n"}
{"Baterai (−) ── Buck IN−\n"}
{"   OUT+ (5V) ──────► VIN NodeMCU\n"}
{"   OUT− ───────────► GND NodeMCU\n"}
                    </code>

                    {/* Info buck converter */}
                    <div className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 rounded-lg p-2">
                      <Zap className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-semibold">Memberi daya NodeMCU dari baterai 12V:</p>
                        <p>
                          NodeMCU butuh <strong>5V</strong> di pin VIN, sedangkan baterai LiFePO4 4S
                          outputnya 12–14.4V. Gunakan <strong>buck converter (step-down module)</strong>
                          {" "}seperti <code className="bg-amber-100 dark:bg-amber-900/30 px-0.5 rounded font-mono">LM2596</code>,{" "}
                          <code className="bg-amber-100 dark:bg-amber-900/30 px-0.5 rounded font-mono">XL4016</code>, atau{" "}
                          <code className="bg-amber-100 dark:bg-amber-900/30 px-0.5 rounded font-mono">MP1584</code>.
                        </p>
                        <ol className="list-decimal list-inside space-y-1 leading-relaxed">
                          <li>Sambung Baterai (+) → Buck <strong>IN+</strong>, Baterai (−) → Buck <strong>IN−</strong></li>
                          <li>Putar trimpot buck converter hingga <strong>OUT+ = 5V</strong> (ukur dengan multimeter sebelum sambung NodeMCU)</li>
                          <li>Buck <strong>OUT+</strong> → NodeMCU <strong>VIN</strong></li>
                          <li>Buck <strong>OUT−</strong> → NodeMCU <strong>GND</strong> (common ground dengan semua komponen)</li>
                        </ol>
                      </div>
                    </div>

                    {/* Cara kerja modul */}
                    <div className="flex items-start gap-1.5 text-[11px] text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/10 rounded-lg p-2">
                      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-semibold">Cara kerja modul:</p>
                        <p>
                          Di dalam modul ada dua resistor (R1=30kΩ, R2=7.5kΩ)
                          yang membentuk voltage divider. Tegangan baterai
                          dibagi 5× sebelum masuk ke pin A0 NodeMCU.
                          Contoh: baterai 14.4V → pin S = 14.4 × 0.2 = 2.88V
                          (aman untuk A0 yang maksimum 3.3V).
                        </p>
                        <p>
                          Formula kode: <code className="font-mono bg-green-100 dark:bg-green-900/30 px-1 rounded">
                            V = raw × (16.5 / 1023.0) × k
                          </code>{" "}
                          — kode sudah dikalibrasi untuk LiFePO4 4S (12.0V=0%, 14.4V=100%).
                        </p>
                      </div>
                    </div>

                    {/* Kalibrasi */}
                    <div className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 rounded-lg p-2">
                      <Zap className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <div className="space-y-1.5">
                        <p className="font-semibold">Kalibrasi fine-tuning (opsional, lakukan 1×):</p>
                        <p>
                          Serial Monitor menampilkan:{" "}
                          <code className="bg-amber-100 dark:bg-amber-900/30 px-0.5 rounded font-mono">
                            raw=745 → 12.01V (1%)
                          </code>{" "}
                          — "raw" adalah angka ADC mentah 0–1023 dari pin A0,
                          "12.01V" adalah hasil perhitungan kode.
                        </p>
                        <ol className="list-decimal list-inside space-y-1 leading-relaxed">
                          <li>Ukur tegangan baterai dengan multimeter → <strong>V_aktual</strong>.</li>
                          <li>Buka Serial Monitor (baud 115200), lihat nilai <strong>tegangan V</strong> yang tercetak.</li>
                          <li>Hitung:{" "}
                            <code className="bg-amber-100 dark:bg-amber-900/30 px-0.5 rounded font-mono">
                              k = V_aktual / V_serial
                            </code>
                          </li>
                          <li>Ubah nilai <code className="bg-amber-100 dark:bg-amber-900/30 px-0.5 rounded font-mono">k</code> di{" "}
                            <code className="bg-amber-100 dark:bg-amber-900/30 px-0.5 rounded">main.cpp</code>{" "}
                            (baris <code className="bg-amber-100 dark:bg-amber-900/30 px-0.5 rounded font-mono">const float k = 1.0f</code>).
                          </li>
                        </ol>
                        <p className="text-[10px] text-amber-600 dark:text-amber-500">
                          Contoh: multimeter=13.2V, Serial=12.94V →
                          k = 13.2/12.94 ≈ 1.020. Jika selisih &lt;0.2V, k=1.0 sudah cukup.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Ringkasan pin */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 dark:bg-gray-700/50 px-4 py-2.5 flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-gray-500" />
                    <span className="font-semibold text-sm text-gray-700 dark:text-gray-300">
                      Ringkasan Pin NodeMCU ESP8266 v3
                    </span>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {[
                        {
                          pin: "D1",
                          func: "KY-032 IR (OUT)",
                          color: "text-purple-600 dark:text-purple-400",
                        },
                        {
                          pin: "D2",
                          func: "DHT22 (DATA)",
                          color: "text-orange-600 dark:text-orange-400",
                        },
                        {
                          pin: "D5",
                          func: "DS3231 (SDA)",
                          color: "text-cyan-600 dark:text-cyan-400",
                        },
                        {
                          pin: "D6",
                          func: "DS3231 (SCL)",
                          color: "text-cyan-600 dark:text-cyan-400",
                        },
                        {
                          pin: "D7",
                          func: "Relay (IN)",
                          color: "text-yellow-600 dark:text-yellow-400",
                        },
                        {
                          pin: "A0",
                          func: "Volt.Sensor (S)",
                          color: "text-green-600 dark:text-green-400",
                        },
                      ].map((item) => (
                        <div
                          key={item.pin}
                          className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/30 rounded-lg px-3 py-2"
                        >
                          <span className="font-mono font-bold text-blue-600 dark:text-blue-400 w-7 shrink-0">
                            {item.pin}
                          </span>
                          <span className={item.color}>{item.func}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 text-center shrink-0 rounded-b-2xl">
                <button
                  onClick={() => setIsWiringGuideOpen(false)}
                  className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Tutup Panduan
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============ MODAL JADWAL ALARM DS3231 ============ */}
        {isScheduleOpen && (() => {
          const DAY_LABELS = ["Min","Sen","Sel","Rab","Kam","Jum","Sab"];
          const pad = (n: number) => String(n).padStart(2, "0");

          const startEdit = (s: ReturnType<typeof schedules[0] extends infer T ? () => T : never> extends never ? typeof schedules[0] : typeof schedules[0]) => {
            setEditingSched(s);
            setSchedLabel(s.label);
            setSchedDays(s.days);
            setSchedOnTime(`${pad(s.onHour)}:${pad(s.onMin)}`);
            setSchedOffTime(`${pad(s.offHour)}:${pad(s.offMin)}`);
          };

          const addNew = () => {
            const newS = {
              id: Date.now(), label: "Jadwal Baru", enabled: true, days: 127,
              onHour: 18, onMin: 0, offHour: 6, offMin: 0
            };
            setSchedules(prev => [...prev, newS]);
            startEdit(newS);
          };

          const saveEdit = () => {
            if (!editingSched) return;
            const [oh, om] = schedOnTime.split(":").map(Number);
            const [fh, fm] = schedOffTime.split(":").map(Number);
            setSchedules(prev => prev.map(s => s.id === editingSched.id
              ? { ...s, label: schedLabel, days: schedDays,
                  onHour: oh, onMin: om, offHour: fh, offMin: fm }
              : s
            ));
            setEditingSched(null);
          };

          const deleteS = (id: number) => setSchedules(prev => prev.filter(s => s.id !== id));
          const toggleS = (id: number) => setSchedules(prev => prev.map(s => s.id === id ? {...s, enabled: !s.enabled} : s));

          const publishSchedules = (list: typeof schedules) => {
            if (!mqttClientRef.current) return;
            const payload = JSON.stringify({ schedules: list });
            mqttClientRef.current.publish("dashboard/ngengat/schedule", payload, { retain: true, qos: 1 });
            try { localStorage.setItem("ngengat_schedules", payload); } catch {}
          };

          return (
            <div
              className="fixed inset-0 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
              onClick={e => e.target === e.currentTarget && !editingSched && setIsScheduleOpen(false)}
            >
              <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 shrink-0 rounded-t-2xl">
                  <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <Clock className="w-5 h-5 text-violet-500" />
                    {editingSched ? (editingSched.id === -1 ? "Tambah Jadwal" : "Edit Jadwal") : "Jadwal Alarm DS3231"}
                  </h3>
                  <button aria-label="Tutup jadwal alarm" onClick={() => { setEditingSched(null); setIsScheduleOpen(false); }}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Body */}
                <div className="overflow-y-auto flex-1 p-4 space-y-3">

                  {editingSched ? (
                    /* ---- FORM EDIT ---- */
                    <div className="space-y-4">
                      <div>
                        <label htmlFor="sched-name" className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 block">Nama Jadwal</label>
                        <input
                          id="sched-name"
                          value={schedLabel}
                          onChange={e => setSchedLabel(e.target.value)}
                          maxLength={21}
                          className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-400"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 block">Hari Aktif</label>
                        <div className="flex flex-wrap gap-2">
                          {DAY_LABELS.map((d, i) => {
                            const active = (schedDays >> i) & 1;
                            return (
                              <button key={i}
                                onClick={() => setSchedDays(prev => active ? prev & ~(1<<i) : prev | (1<<i))}
                                className={cn(
                                  "px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors",
                                  active
                                    ? "bg-violet-500 text-white"
                                    : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                                )}
                              >{d}</button>
                            );
                          })}
                        </div>
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => setSchedDays(62)}
                            className="text-[11px] text-violet-600 dark:text-violet-400 underline">Sen–Jum</button>
                          <button onClick={() => setSchedDays(65)}
                            className="text-[11px] text-violet-600 dark:text-violet-400 underline">Min+Sab</button>
                          <button onClick={() => setSchedDays(127)}
                            className="text-[11px] text-violet-600 dark:text-violet-400 underline">Setiap hari</button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="sched-on" className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1 block">Waktu ON (mulai)</label>
                          <input id="sched-on" type="time" value={schedOnTime}
                            onChange={e => setSchedOnTime(e.target.value)}
                            className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-emerald-200 dark:border-emerald-800 rounded-lg text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                          />
                        </div>
                        <div>
                          <label htmlFor="sched-off" className="text-xs font-semibold text-red-500 dark:text-red-400 mb-1 block">Waktu OFF (selesai)</label>
                          <input id="sched-off" type="time" value={schedOffTime}
                            onChange={e => setSchedOffTime(e.target.value)}
                            className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-red-200 dark:border-red-800 rounded-lg text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-400"
                          />
                        </div>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button onClick={() => setEditingSched(null)}
                          className="flex-1 py-2 text-sm font-semibold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                          Batal
                        </button>
                        <button onClick={saveEdit}
                          className="flex-1 py-2 text-sm font-semibold text-white bg-violet-500 hover:bg-violet-600 rounded-lg transition-colors">
                          Simpan
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ---- DAFTAR JADWAL ---- */
                    <>
                      <div className="flex items-start gap-2 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg p-3 text-xs text-violet-700 dark:text-violet-300">
                        <Info className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>Jadwal dikirim ke sensor via MQTT &amp; disimpan di EEPROM. Sensor <strong>selalu aktif</strong> (tanpa deep sleep) dan memakai jam <strong>DS3231</strong> untuk menyalakan/mematikan relay sesuai jadwal — tidak mengganggu deteksi sensor.</span>
                      </div>

                      {schedules.length === 0 && (
                        <p className="text-center text-sm text-gray-400 py-4">Belum ada jadwal. Tambahkan jadwal di bawah.</p>
                      )}

                      {schedules.map(s => (
                        <div key={s.id}
                          className={cn(
                            "border rounded-xl p-3 transition-colors",
                            s.enabled
                              ? "border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-900/10"
                              : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/20 opacity-60"
                          )}>
                          <div className="flex items-center justify-between mb-2">
                            <button onClick={() => toggleS(s.id)}
                              aria-label={s.enabled ? `Nonaktifkan jadwal ${s.label}` : `Aktifkan jadwal ${s.label}`}
                              className={cn(
                                "w-9 h-5 rounded-full relative transition-colors",
                                s.enabled ? "bg-violet-500" : "bg-gray-300 dark:bg-gray-600"
                              )}>
                              <span className={cn(
                                "absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all",
                                s.enabled ? "left-4" : "left-0.5"
                              )} />
                            </button>
                            <span className="flex-1 ml-2 text-sm font-semibold text-gray-800 dark:text-white">{s.label}</span>
                            <div className="flex gap-1">
                              <button onClick={() => startEdit(s)}
                                aria-label={`Edit jadwal ${s.label}`}
                                className="p-1.5 text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => deleteS(s.id)}
                                aria-label={`Hapus jadwal ${s.label}`}
                                className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1 mb-2">
                            {DAY_LABELS.map((d, i) => (
                              <span key={i}
                                className={cn(
                                  "text-[10px] px-1.5 py-0.5 rounded font-medium",
                                  (s.days >> i) & 1
                                    ? "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300"
                                    : "bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500"
                                )}>{d}</span>
                            ))}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-2">
                            <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                              ▶ {pad(s.onHour)}:{pad(s.onMin)}
                            </span>
                            <span className="text-gray-400">→</span>
                            <span className="text-red-500 dark:text-red-400 font-mono font-bold">
                              ■ {pad(s.offHour)}:{pad(s.offMin)}
                            </span>
                            {s.onHour > s.offHour && (
                              <span className="text-gray-400 text-[10px]">(lintas tengah malam)</span>
                            )}
                          </div>
                        </div>
                      ))}

                      {schedules.length < 6 && (
                        <button onClick={addNew}
                          className="w-full py-2.5 border-2 border-dashed border-violet-200 dark:border-violet-800 text-violet-500 dark:text-violet-400 rounded-xl text-sm font-semibold hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors flex items-center justify-center gap-2">
                          <span className="text-lg leading-none">+</span> Tambah Jadwal
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* Footer */}
                {!editingSched && (
                  <div className="px-5 py-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 shrink-0 rounded-b-2xl space-y-2">
                    <button
                      onClick={() => {
                        publishSchedules(schedules);
                        saveSchedulesToDB(schedules);
                        setIsScheduleOpen(false);
                      }}
                      disabled={isDemoMode}
                      className={cn(
                        "w-full py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors",
                        isDemoMode
                          ? "bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
                          : "bg-violet-500 hover:bg-violet-600 text-white"
                      )}
                    >
                      <SatelliteDish className="w-4 h-4" />
                      Simpan &amp; Kirim ke Sensor
                    </button>
                    {isDemoMode && (
                      <p className="text-center text-xs text-gray-400">Mode Demo — pengiriman MQTT tidak aktif</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Log Reset Modal */}
        {isLogResetModalOpen && (
          <div
            className="fixed inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
            onClick={(e) =>
              e.target === e.currentTarget && setIsLogResetModalOpen(false)
            }
          >
            <div className="bg-white dark:bg-gray-800 w-[90%] max-w-sm rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-orange-500" />
                  Reset Log Deteksi
                </h3>
                <button
                  onClick={() => setIsLogResetModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 space-y-5">
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  Semua entri pada tabel log deteksi sensor akan dihapus. Data
                  tangkapan (jumlah ngengat) pada masing-masing node{" "}
                  <span className="font-semibold text-gray-700 dark:text-gray-300">
                    tidak terpengaruh
                  </span>
                  .
                </p>
                <div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Jangkauan Reset
                  </p>
                  <div className="space-y-2">
                    {(
                      [
                        {
                          value: "dashboard" as const,
                          label: "Dashboard saja",
                          desc: "Tabel log dikosongkan, data di Google Sheets tidak berubah",
                          disabled: false,
                        },
                        {
                          value: "both" as const,
                          label: "Dashboard + Database",
                          desc:
                            !isDemoMode && userProfile
                              ? "Tabel log dikosongkan dan data log di Google Sheets juga dihapus"
                              : "Memerlukan akun login di Mode Asli",
                          disabled: isDemoMode || !userProfile,
                        },
                      ] as const
                    ).map((opt) => (
                      <label
                        key={opt.value}
                        onClick={() =>
                          !opt.disabled && setLogResetScope(opt.value)
                        }
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-xl border-2 transition-colors",
                          opt.disabled
                            ? "border-gray-100 dark:border-gray-700/50 opacity-50 cursor-not-allowed"
                            : "cursor-pointer",
                          !opt.disabled && logResetScope === opt.value
                            ? "border-orange-400 dark:border-orange-500 bg-orange-50 dark:bg-orange-900/20"
                            : !opt.disabled
                              ? "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                              : "",
                        )}
                      >
                        <input
                          type="radio"
                          name="logResetScope"
                          value={opt.value}
                          checked={logResetScope === opt.value}
                          onChange={() =>
                            !opt.disabled && setLogResetScope(opt.value)
                          }
                          disabled={opt.disabled}
                          className="accent-orange-500 mt-0.5"
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                            {opt.label}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {opt.desc}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => setIsLogResetConfirmOpen(true)}
                  className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Lanjutkan Reset Log
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Log Reset Confirm Modal */}
        {isLogResetConfirmOpen && (
          <div className="fixed inset-0 bg-gray-900/60 dark:bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center">
            <div className="bg-white dark:bg-gray-800 w-[85%] max-w-xs rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="p-6 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mx-auto">
                  <AlertCircle className="w-9 h-9 text-orange-500" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-800 dark:text-white text-lg mb-1">
                    Reset Semua Log?
                  </h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                    Seluruh entri log deteksi akan dihapus permanen
                    {logResetScope === "both" && !isDemoMode && userProfile
                      ? " dari dashboard dan Google Sheets"
                      : " dari dashboard"}
                    . Tindakan ini tidak dapat dibatalkan.
                  </p>
                </div>
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => setIsLogResetConfirmOpen(false)}
                    disabled={isLogResetting}
                    className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    Batal
                  </button>
                  <button
                    onClick={executeLogReset}
                    disabled={isLogResetting}
                    className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    {isLogResetting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RotateCcw className="w-4 h-4" />
                    )}
                    {isLogResetting ? "Mereset..." : "Ya, Reset!"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Reset Modal */}
        {isResetModalOpen && (
          <div
            className="fixed inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
            onClick={(e) =>
              e.target === e.currentTarget && setIsResetModalOpen(false)
            }
          >
            <div className="bg-white dark:bg-gray-800 w-[90%] max-w-sm rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden max-h-[90vh] flex flex-col">
              <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 shrink-0">
                <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-orange-500" />
                  Reset Tangkapan
                </h3>
                <button
                  onClick={() => setIsResetModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 space-y-5 overflow-y-auto">
                <div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Pilih Node yang Direset
                  </p>
                  <div className="space-y-2">
                    {(
                      [
                        {
                          value: "A" as const,
                          label: "Node A",
                          sub: "UV 365nm",
                          count: nodeA.uv365,
                          badge:
                            "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400",
                          showWhen: "A" as const,
                        },
                        {
                          value: "B" as const,
                          label: "Node B",
                          sub: "UV 395nm",
                          count: nodeB.uv395,
                          badge:
                            "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
                          showWhen: "B" as const,
                        },
                        {
                          value: "both" as const,
                          label: "Kedua Node",
                          sub: "A + B",
                          count: nodeA.uv365 + nodeB.uv395,
                          badge:
                            "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300",
                          showWhen: null,
                        },
                      ] as const
                    )
                      .filter(
                        (opt) =>
                          opt.showWhen === null ||
                          opt.showWhen === resetOriginNode,
                      )
                      .map((opt) => (
                        <label
                          key={opt.value}
                          onClick={() => setResetTarget(opt.value)}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors",
                            resetTarget === opt.value
                              ? "border-orange-400 dark:border-orange-500 bg-orange-50 dark:bg-orange-900/20"
                              : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600",
                          )}
                        >
                          <input
                            type="radio"
                            name="resetTarget"
                            value={opt.value}
                            checked={resetTarget === opt.value}
                            onChange={() => setResetTarget(opt.value)}
                            className="accent-orange-500"
                          />
                          <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200">
                            {opt.label}{" "}
                            <span className="text-gray-400 dark:text-gray-500 font-normal">
                              ({opt.sub})
                            </span>
                          </span>
                          <span
                            className={cn(
                              "text-xs font-bold px-2 py-1 rounded-full",
                              opt.badge,
                            )}
                          >
                            {opt.count}
                          </span>
                        </label>
                      ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Jangkauan Reset
                  </p>
                  <div className="space-y-2">
                    {(
                      [
                        {
                          value: "dashboard" as const,
                          label: "Dashboard saja",
                          desc: "Tampilan direset, data Google Sheets tidak berubah",
                        },
                        {
                          value: "both" as const,
                          label: "Dashboard + Database",
                          desc: "Tampilan direset dan data Google Sheets juga diperbarui",
                        },
                      ] as const
                    ).map((opt) => (
                      <label
                        key={opt.value}
                        onClick={() => setResetScope(opt.value)}
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors",
                          resetScope === opt.value
                            ? "border-orange-400 dark:border-orange-500 bg-orange-50 dark:bg-orange-900/20"
                            : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600",
                        )}
                      >
                        <input
                          type="radio"
                          name="resetScope"
                          value={opt.value}
                          checked={resetScope === opt.value}
                          onChange={() => setResetScope(opt.value)}
                          className="accent-orange-500 mt-0.5"
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                            {opt.label}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {opt.desc}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Opsi: hapus juga seluruh sheet data (hanya relevan jika DB ikut) */}
                {resetScope === "both" && (
                  <label className="flex items-start gap-2.5 p-3 rounded-xl border-2 border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/15 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={resetAllData}
                      onChange={(e) => setResetAllData(e.target.checked)}
                      className="accent-red-500 mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                        Hapus juga SEMUA data sheet
                      </p>
                      <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-0.5">
                        Membersihkan Logs, Grafik, Lingkungan, Rata-rata, Efektivitas
                        Harian, &amp; Log Alarm milik Anda. Akun &amp; pengaturan tetap
                        aman. Tidak dapat dibatalkan.
                      </p>
                    </div>
                  </label>
                )}

                <button
                  onClick={() => setIsResetConfirmOpen(true)}
                  className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Lanjutkan Reset
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reset Confirm Modal */}
        {isResetConfirmOpen && (
          <div className="fixed inset-0 bg-gray-900/60 dark:bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center">
            <div className="bg-white dark:bg-gray-800 w-[85%] max-w-xs rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="p-6 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mx-auto">
                  <AlertCircle className="w-9 h-9 text-orange-500" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-800 dark:text-white text-lg mb-1">
                    Yakin Mereset?
                  </h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                    Tangkapan{" "}
                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                      {resetTarget === "A"
                        ? "Node A (UV 365nm)"
                        : resetTarget === "B"
                          ? "Node B (UV 395nm)"
                          : "kedua node"}
                    </span>{" "}
                    akan direset ke{" "}
                    <span className="font-bold text-orange-600 dark:text-orange-400">
                      0
                    </span>
                    {resetScope === "both"
                      ? " dan data Google Sheets juga akan diperbarui"
                      : ""}
                    . Tindakan ini tidak dapat dibatalkan.
                  </p>
                </div>
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => setIsResetConfirmOpen(false)}
                    disabled={isResetting}
                    className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    Batal
                  </button>
                  <button
                    onClick={executeReset}
                    disabled={isResetting}
                    className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    {isResetting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RotateCcw className="w-4 h-4" />
                    )}
                    {isResetting ? "Mereset..." : "Ya, Reset!"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sheet Manager Modal */}
        {isSheetManagerOpen && (
          <div
            className="fixed inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center transition-opacity"
            onClick={(e) =>
              e.target === e.currentTarget && setIsSheetManagerOpen(false)
            }
          >
            <div className="bg-white dark:bg-gray-800 w-[90%] max-w-md rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden max-h-[85vh] flex flex-col">
              <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50 shrink-0">
                <h3 className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
                  <Database className="w-5 h-5 text-red-600 dark:text-red-400" />
                  Kelola Sheet Database
                </h3>
                <button
                  aria-label="Tutup pengelola sheet"
                  onClick={() => setIsSheetManagerOpen(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 overflow-y-auto flex-1 space-y-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Scan Google Spreadsheet untuk menemukan sheet yang tidak
                  dikenali sistem. Sheet sisa percobaan atau sync lama dapat
                  dihapus di sini.
                </p>
                <button
                  onClick={handleScanSheets}
                  disabled={isScanning}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  {isScanning ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RotateCcw className="w-4 h-4" />
                  )}
                  {isScanning ? "Memindai..." : "Scan Sheet Sekarang"}
                </button>

                {sheetScanResult && (
                  <div className="space-y-3">
                    <div>
                      <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        Sheet Aktif Sistem ({sheetScanResult.used.length})
                      </h4>
                      <div className="space-y-1 max-h-28 overflow-y-auto">
                        {sheetScanResult.used.map((name) => (
                          <div
                            key={name}
                            className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 rounded-lg font-mono"
                          >
                            {name}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                        Sheet Tidak Terpakai ({sheetScanResult.unused.length})
                      </h4>
                      {sheetScanResult.unused.length === 0 ? (
                        <p className="text-xs text-gray-400 dark:text-gray-500 italic px-3 py-2 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                          Tidak ada sheet yang perlu dihapus. Database sudah
                          bersih.
                        </p>
                      ) : (
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {sheetScanResult.unused.map((s) => (
                            <label
                              key={s.name}
                              className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={selectedSheetsToDelete.includes(
                                  s.name,
                                )}
                                onChange={(e) => {
                                  setSelectedSheetsToDelete((prev) =>
                                    e.target.checked
                                      ? [...prev, s.name]
                                      : prev.filter((n) => n !== s.name),
                                  );
                                }}
                                className="accent-red-600 w-3.5 h-3.5 shrink-0"
                              />
                              <span className="text-red-700 dark:text-red-400 font-mono flex-1 truncate">
                                {s.name}
                              </span>
                              <span className="text-gray-400 dark:text-gray-500 shrink-0">
                                {s.rows} baris
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    {sheetScanResult.unused.length > 0 && (
                      <button
                        onClick={handleDeleteSelectedSheets}
                        disabled={
                          isDeletingSheets ||
                          selectedSheetsToDelete.length === 0
                        }
                        className="w-full py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                      >
                        {isDeletingSheets ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <X className="w-4 h-4" />
                        )}
                        {isDeletingSheets
                          ? "Menghapus..."
                          : `Hapus ${selectedSheetsToDelete.length} Sheet Terpilih`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Login Modal */}
        {isLoginModalOpen && (
            <div
              className="fixed inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center anim-fade-in"
              onClick={(e) => {
                // Saat gate (belum login) modal TIDAK bisa ditutup
                if (userProfile && !loginSuccess && e.target === e.currentTarget) {
                  setLoginModalOpen(false);
                  setPendingRealMode(false);
                  setOtpStep(false);
                  setOtpCode("");
                  setOtpError("");
                  setNameExistsPrompt(null);
                }
              }}
            >
              <div
                className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl w-[95%] max-w-sm sm:max-w-md rounded-3xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden anim-scale-in flex flex-col max-h-[92vh]"
              >
                <div className="p-5 sm:p-7 overflow-y-auto flex-1 scrollbar-hide">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-extrabold text-2xl text-gray-900 dark:text-white tracking-tight">
                      {loginMode === "login" ? "Masuk" : "Daftar Akun"}
                    </h3>
                    {userProfile && (
                      <button
                        aria-label="Tutup"
                        onClick={() => { setLoginModalOpen(false); setPendingRealMode(false); setOtpStep(false); setOtpCode(""); setOtpError(""); setNameExistsPrompt(null); }}
                        className="text-gray-400 hover:text-gray-900 dark:hover:text-white bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 p-2 rounded-full transition-colors"
                        disabled={loginSuccess}
                      >
                        <X className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                  {!userProfile && !loginSuccess && (
                    <div className="mb-5">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        Pilih jenis akun untuk masuk:
                      </p>
                      <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-1 border border-gray-200 dark:border-gray-700">
                        {([true, false] as const).map((demo) => (
                          <button
                            key={String(demo)}
                            type="button"
                            onClick={() => {
                              setIsDemoMode(demo);
                              localStorage.setItem("isDemoMode", String(demo));
                              setOtpStep(false);
                              setOtpCode("");
                              setOtpError("");
                              setLoginError("");
                              setNameExistsPrompt(null);
                            }}
                            className={cn(
                              "flex-1 py-2 rounded-lg text-xs font-bold transition-all",
                              isDemoMode === demo
                                ? "bg-white dark:bg-emerald-700 shadow-sm text-emerald-700 dark:text-white"
                                : "text-gray-500 dark:text-gray-400",
                            )}
                          >
                            {demo ? "Akun Demo" : "Akun Asli"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {pendingRealMode && !loginSuccess && (
                    <div className="mb-5 px-3.5 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl flex items-center gap-2.5 text-xs text-amber-700 dark:text-amber-400">
                      <Lock className="w-4 h-4 shrink-0" />
                      <span>Login atau daftar akun diperlukan untuk menggunakan <strong>Data Asli</strong> dari sensor ESP8266.</span>
                    </div>
                  )}
                  {loginSuccess ? (
                    <div className="py-12 flex flex-col items-center justify-center anim-scale-in">
                      <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mb-4">
                        <CheckCircle2 className="w-10 h-10" />
                      </div>
                      <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                        Berhasil!
                      </h4>
                      <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                        Redirecting...
                      </p>
                    </div>
                  ) : (
                    <>
                      {loginError && (
                        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2 text-red-600 dark:text-red-400 text-sm">
                          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                          <span>{loginError}</span>
                        </div>
                      )}
                      {nameExistsPrompt && (
                        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-700 dark:text-amber-300 text-sm">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                            <span>{nameExistsPrompt}</span>
                          </div>
                          <div className="flex gap-2 mt-3">
                            <button
                              type="button"
                              onClick={() => {
                                setNameExistsPrompt(null);
                                setLoginError("");
                                setLoginMode("login");
                              }}
                              className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
                            >
                              Login saja
                            </button>
                            <button
                              type="button"
                              onClick={() => submitAuth(true)}
                              className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                            >
                              Tetap daftar
                            </button>
                          </div>
                        </div>
                      )}
                      {otpStep ? (
                        <div className="space-y-5">
                          <div className="text-center">
                            <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-3">
                              <Lock className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <h3 className="text-base font-bold text-gray-800 dark:text-white">
                              Verifikasi Email
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {otpInfo}
                            </p>
                          </div>
                          {otpError && (
                            <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2 text-red-600 dark:text-red-400 text-sm">
                              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                              <span>{otpError}</span>
                            </div>
                          )}
                          <div>
                            <label htmlFor="otp-code" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
                              Kode OTP (6 digit)
                            </label>
                            <input
                              id="otp-code"
                              type="text"
                              inputMode="numeric"
                              maxLength={6}
                              value={otpCode}
                              onChange={(e) => {
                                setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                                setOtpError("");
                              }}
                              className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white text-center text-2xl font-bold tracking-[0.4em] rounded-xl focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 block p-3.5 outline-none transition-all"
                              placeholder="••••••"
                              autoFocus
                            />
                          </div>
                          <button
                            type="button"
                            onClick={submitOtp}
                            disabled={isAuthLoading}
                            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-all hover:shadow-lg hover:shadow-emerald-600/20 active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70"
                          >
                            {isAuthLoading ? (
                              <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-5 h-5" />
                            )}
                            Verifikasi & Daftar
                          </button>
                          <div className="flex items-center justify-between text-xs">
                            <button
                              type="button"
                              onClick={resendOtp}
                              disabled={isAuthLoading}
                              className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline disabled:opacity-50"
                            >
                              Kirim ulang kode
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOtpStep(false);
                                setOtpCode("");
                                setOtpError("");
                              }}
                              className="text-gray-500 dark:text-gray-400 font-semibold hover:underline"
                            >
                              Ganti email
                            </button>
                          </div>
                        </div>
                      ) : (
                      <>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          submitAuth();
                        }}
                        className="space-y-5 px-1"
                      >
                        <div>
                          <label htmlFor="login-email" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
                            Email
                          </label>
                          <input
                            id="login-email"
                            type="email"
                            value={loginEmail}
                            onChange={(e) => {
                              setLoginEmail(e.target.value);
                              setLoginError("");
                            }}
                            className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white text-sm rounded-xl focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 block p-3.5 outline-none transition-all"
                            placeholder="nama@contoh.com"
                            required
                          />
                        </div>
                        <div>
                          <label htmlFor="login-password" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
                            Password
                          </label>
                          <div className="relative">
                            <input
                              id="login-password"
                              type={showPassword ? "text" : "password"}
                              value={loginPassword}
                              onChange={(e) => {
                                setLoginPassword(e.target.value);
                                setLoginError("");
                              }}
                              className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white text-sm rounded-xl focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 block p-3.5 pr-11 outline-none transition-all"
                              placeholder="••••••••"
                              required
                            />
                            <button
                              type="button"
                              aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute inset-y-0 right-2 flex items-center p-2 text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors rounded-lg"
                            >
                              {showPassword ? (
                                <EyeOff className="w-5 h-5" />
                              ) : (
                                <Eye className="w-5 h-5" />
                              )}
                            </button>
                          </div>
                          {loginMode === "register" && (
                            <div className="mt-4 space-y-2 animate-in fade-in duration-300">
                              <div className="flex gap-1 h-1.5 w-full">
                                {[1, 2, 3, 4].map((step) => (
                                  <div
                                    key={step}
                                    className={`h-full flex-1 rounded-full transition-colors duration-300 ${getPasswordStrength(loginPassword) >= step ? getStrengthColor(getPasswordStrength(loginPassword)) : "bg-gray-200 dark:bg-gray-800"}`}
                                  ></div>
                                ))}
                              </div>
                              <div className="flex items-center justify-between mt-1">
                                <span
                                  className={`text-[10px] sm:text-xs font-semibold ${getPasswordStrength(loginPassword) === 4 ? "text-emerald-600 dark:text-emerald-400" : "text-gray-500 dark:text-gray-400"}`}
                                >
                                  Kekuatan:{" "}
                                  {getStrengthLabel(
                                    getPasswordStrength(loginPassword),
                                  )}
                                </span>
                                <span className="text-[10px] text-gray-400 max-w-[200px] text-right">
                                  Huruf besar, kecil, angka & simbol.
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                        {loginMode === "register" && (
                          <div className="space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div>
                              <label htmlFor="login-name" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5 ml-1">
                                Nama Lengkap
                              </label>
                              <input
                                id="login-name"
                                type="text"
                                value={loginName}
                                onChange={(e) => setLoginName(e.target.value)}
                                className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white text-sm rounded-xl focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 block p-3.5 outline-none transition-all"
                                placeholder="Opsional"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <ImageUpload
                                label="Foto Profil"
                                icon={Camera}
                                value={loginPhoto}
                                onImageUploaded={setLoginPhoto}
                                type="photo"
                              />
                              <ImageUpload
                                label="Foto Sampul"
                                icon={ImageIcon}
                                value={loginCover}
                                onImageUploaded={setLoginCover}
                                type="cover"
                              />
                            </div>
                          </div>
                        )}
                        <button
                          type="submit"
                          disabled={isAuthLoading}
                          className="w-full mt-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-all hover:shadow-lg hover:shadow-emerald-600/20 active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70 disabled:hover:scale-100"
                        >
                          {isAuthLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <LogIn className="w-5 h-5" />
                          )}
                          {loginMode === "login" ? "Masuk" : "Daftar Sekarang"}
                        </button>
                      </form>
                      <div className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
                        {loginMode === "login"
                          ? "Belum punya akun?"
                          : "Sudah punya akun?"}{" "}
                        <button
                          type="button"
                          onClick={() => {
                            setLoginMode(
                              loginMode === "login" ? "register" : "login",
                            );
                            setLoginError("");
                            setNameExistsPrompt(null);
                            setOtpStep(false);
                          }}
                          className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-bold transition-colors underline decoration-2 underline-offset-4"
                          disabled={loginSuccess}
                        >
                          {loginMode === "login"
                            ? "Daftar di sini"
                            : "Masuk di sini"}
                        </button>
                      </div>
                      </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

        {/* Profile Modal */}
        {isProfileOpen && (
          <div
            className="fixed inset-0 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center transition-opacity"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setProfileOpen(false);
                setIsEditingProfile(false);
              }
            }}
          >
            <div className="bg-white dark:bg-gray-800 w-[90%] max-w-sm rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden transform scale-100 transition-transform">
              {isEditingProfile ? (
                <div className="flex flex-col max-h-[85vh]">
                  <div className="flex justify-between items-center p-5 sm:p-6 border-b border-gray-100 dark:border-gray-700/50 shrink-0">
                    <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                      Edit Profil
                    </h3>
                    <button
                      onClick={() => setIsEditingProfile(false)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="p-5 sm:p-6 space-y-4 overflow-y-auto custom-scrollbar">
                    <div>
                      <label htmlFor="edit-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Nama Lengkap
                      </label>
                      <input
                        id="edit-name"
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5 outline-none"
                      />
                    </div>
                    <ImageUpload
                      label="Foto Profil"
                      icon={Camera}
                      value={editPhotoUrl}
                      onImageUploaded={setEditPhotoUrl}
                      type="photo"
                    />
                    <ImageUpload
                      label="Foto Sampul"
                      icon={ImageIcon}
                      value={editCoverUrl}
                      onImageUploaded={setEditCoverUrl}
                      type="cover"
                    />

                    <hr className="border-gray-200 dark:border-gray-700 my-2" />

                    <div className="space-y-2">
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Notifikasi in-app
                        </span>
                        <div className="relative">
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={editNotificationsEnabled}
                            onChange={(e) =>
                              setEditNotificationsEnabled(e.target.checked)
                            }
                          />
                          <div
                            className={`block w-10 h-6 rounded-full transition-colors ${editNotificationsEnabled ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"}`}
                          ></div>
                          <div
                            className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${editNotificationsEnabled ? "transform translate-x-4" : ""}`}
                          ></div>
                        </div>
                      </label>
                      {/* Notifikasi background (push ke browser) */}
                      {'Notification' in window && (
                        <div className="flex items-center justify-between pt-1">
                          <div>
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              Notifikasi background
                            </p>
                            <p className="text-[11px] text-gray-400 dark:text-gray-500">
                              {notifPermission === 'granted'
                                ? 'Aktif — notifikasi dikirim saat app tertutup'
                                : notifPermission === 'denied'
                                ? 'Diblokir — aktifkan di pengaturan browser'
                                : 'Izinkan agar notif muncul saat app tertutup'}
                            </p>
                          </div>
                          {notifPermission === 'granted' ? (
                            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-full">
                              Aktif
                            </span>
                          ) : notifPermission === 'denied' ? (
                            <span className="text-xs text-red-500">Diblokir</span>
                          ) : (
                            <button
                              onClick={requestNotifPermission}
                              className="text-xs font-medium bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg transition-colors"
                            >
                              Izinkan
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div>
                      <label htmlFor="edit-temp-unit" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Satuan Suhu Default
                      </label>
                      <select
                        id="edit-temp-unit"
                        value={editTemperatureUnit}
                        onChange={(e) =>
                          setEditTemperatureUnit(e.target.value as "C" | "F")
                        }
                        className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5 outline-none"
                      >
                        <option value="C">Celsius (°C)</option>
                        <option value="F">Fahrenheit (°F)</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="edit-volt-unit" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Satuan Tegangan Default
                      </label>
                      <select
                        id="edit-volt-unit"
                        value={editVoltageUnit}
                        onChange={(e) =>
                          setEditVoltageUnit(e.target.value as "V" | "mV")
                        }
                        className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5 outline-none"
                      >
                        <option value="V">Volt (V)</option>
                        <option value="mV">Milivolt (mV)</option>
                      </select>
                    </div>

                    <button
                      onClick={handleSaveProfile}
                      className="w-full mt-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                    >
                      <Save className="w-4 h-4" /> Simpan Perubahan
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div
                    className="relative w-full aspect-[3/1] bg-gray-200 dark:bg-gray-700 flex justify-center bg-cover bg-center shrink-0"
                    style={
                      userProfile?.coverUrl
                        ? { backgroundImage: `url(${userProfile.coverUrl})` }
                        : {
                            backgroundImage:
                              "linear-gradient(to right, #10b981, #14b8a6)",
                          }
                    }
                  >
                    <button
                      onClick={() => setProfileOpen(false)}
                      className="absolute top-3 right-3 text-white hover:bg-black/20 p-1.5 rounded-full backdrop-blur-sm transition-colors z-10"
                    >
                      <X className="w-5 h-5 drop-shadow-md" />
                    </button>
                    <button
                      onClick={handleOpenEditProfile}
                      className="absolute top-3 left-3 text-white hover:bg-black/20 p-1.5 rounded-full backdrop-blur-sm transition-colors z-10"
                      title="Edit Profil"
                    >
                      <Edit2 className="w-4 h-4 drop-shadow-md" />
                    </button>
                    <div className="absolute -bottom-10 border-4 border-white dark:border-gray-800 rounded-full bg-white dark:bg-gray-800 shadow-md">
                      <img
                        src={
                          userProfile?.photoURL ||
                          `https://ui-avatars.com/api/?name=${encodeURIComponent(userProfile?.displayName || "User")}`
                        }
                        alt="avatar"
                        className="w-20 h-20 rounded-full object-cover bg-white dark:bg-gray-800"
                      />
                    </div>
                  </div>
                  <div className="pt-14 pb-6 px-6 text-center">
                    <h3 className="font-bold text-xl text-gray-900 dark:text-white">
                      {userProfile?.displayName || "User"}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                      {userProfile?.email}
                    </p>

                    <div className="space-y-3">
                      <button
                        onClick={() => {
                          setIsLogoutConfirmOpen(true);
                        }}
                        className="w-full py-2.5 bg-gray-50 text-red-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-red-400 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                      >
                        Logout / Keluar Akun
                      </button>
                      <button
                        onClick={() => {
                          setProfileOpen(false);
                        }}
                        className="w-full py-2.5 bg-gray-50 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200  border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                      >
                        Tutup
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Buffer Flush Toast — muncul saat data offline berhasil masuk */}
          {bufferToast && (
            <div
              key={bufferToast.id}
              className="fixed bottom-6 right-4 z-[200] flex items-start gap-3 bg-emerald-700 dark:bg-emerald-800 text-white rounded-2xl shadow-2xl px-5 py-4 max-w-xs border border-emerald-500/40 anim-slide-up"
            >
              <div className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-emerald-500/30 flex items-center justify-center">
                <Database className="w-4 h-4 text-emerald-200" />
              </div>
              <div>
                <p className="font-bold text-sm leading-tight">
                  Data Buffer Diterima!
                </p>
                <p className="text-emerald-200 text-xs mt-0.5 leading-snug">
                  {bufferToast.count} deteksi offline ({bufferToast.node})
                  berhasil masuk ke dashboard.
                </p>
              </div>
              <button
                onClick={() => setBufferToast(null)}
                className="ml-auto text-emerald-300 hover:text-white shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

        {/* Logout Confirm Dialog */}
        {isLogoutConfirmOpen && (
          <div
            className="fixed inset-0 bg-gray-900/60 dark:bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center transition-opacity"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsLogoutConfirmOpen(false);
            }}
          >
            <div className="bg-white dark:bg-gray-800 w-[90%] max-w-sm rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 text-center">
                <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-500 mx-auto flex items-center justify-center mb-4">
                  <RotateCcw className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                  Konfirmasi Logout
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                  Apakah Anda yakin ingin keluar dari akun ini? Sesi Anda akan
                  dihentikan.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setIsLogoutConfirmOpen(false)}
                    className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-semibold text-sm transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    onClick={() => {
                      setUserProfile(null);
                      localStorage.removeItem("userProfile");
                      // Kembali ke Mode Demo otomatis saat logout di Mode Asli
                      if (!isDemoMode) {
                        setIsDemoMode(true);
                        localStorage.setItem("isDemoMode", "true");
                      }
                      setIsLogoutConfirmOpen(false);
                      setProfileOpen(false);
                    }}
                    className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold text-sm transition-colors shadow-sm focus:ring-4 focus:ring-red-200 dark:focus:ring-red-900"
                  >
                    Ya, Keluar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
