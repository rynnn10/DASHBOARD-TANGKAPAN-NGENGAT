function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet();

  try {
    var data = JSON.parse(e.postData.contents);

    // TAB USER SENTRAL — satu sheet universal, tidak bergantung mode
    // Bug lama: Users_Demo vs Users_DataAsli menyebabkan login gagal saat pindah mode
    var sUsers = sheet.getSheetByName("Users") || sheet.insertSheet("Users");

    // IDENTITAS USER: Bersihkan email untuk nama sheet data
    var userIdentifier = "";
    if (data.email) {
      userIdentifier = "_" + data.email.replace(/[@.]/g, "_");
    }

    // TAB DATA (Logs, Status, Grafik): tetap dipisah per akun di Mode Asli
    var modeSuffix = data.isDemoMode ? "_Demo" : "_DataAsli" + userIdentifier;

    // Helper: normalisasi email (lowercase + trim) agar perbandingan tidak case-sensitive
    var emailNorm = String(data.email || "").toLowerCase().trim();

    // Helper: ambil semua baris dari sebuah sheet (skip header)
    function getSheetRows(s) {
      if (!s || s.getLastRow() < 2) return [];
      return s.getDataRange().getValues().slice(1);
    }

    // Sheet lama (backward compat) — cek juga saat login/register agar akun lama tetap bisa masuk
    var sUsersDemo  = sheet.getSheetByName("Users_Demo");
    var sUsersAsli  = sheet.getSheetByName("Users_DataAsli");
    var legacySheets = [sUsersDemo, sUsersAsli].filter(function(s) { return !!s; });

    // ============================================
    // 1. FITUR AKUN (Register & Login & Update)
    // ============================================
    if (sUsers.getLastRow() === 0) {
      sUsers.appendRow(["Email", "Password", "Name", "PhotoURL", "CoverURL", "Dibuat Sejak"]);
      sUsers.setFrozenRows(1);
      sUsers.getRange(1, 1, 1, 6).setFontWeight("bold");
    }

    if (data.action === "register") {
      // Cek duplikat di sheet utama DAN sheet lama
      var allSheetsToCheck = [sUsers].concat(legacySheets);
      for (var sc = 0; sc < allSheetsToCheck.length; sc++) {
        var rows = getSheetRows(allSheetsToCheck[sc]);
        for (var i = 0; i < rows.length; i++) {
          if (String(rows[i][0]).toLowerCase().trim() === emailNorm) {
            return ContentService.createTextOutput(
              JSON.stringify({ status: "error", message: "Email sudah terdaftar!" })
            ).setMimeType(ContentService.MimeType.JSON);
          }
        }
      }
      // Simpan ke sheet utama dengan email ternormalisasi
      sUsers.appendRow([
        emailNorm,
        data.password,
        data.name || "",
        data.photoURL || "",
        data.coverUrl || "",
        new Date().toISOString(),
      ]);
      return ContentService.createTextOutput(
        JSON.stringify({
          status: "success",
          message: "Pendaftaran berhasil!",
          data: { email: emailNorm, name: data.name, photoURL: data.photoURL, coverUrl: data.coverUrl },
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "login") {
      var pwd = String(data.password || "");
      // Cari di sheet utama dulu, lalu sheet lama (backward compat)
      var loginSheetsToCheck = [sUsers].concat(legacySheets);
      for (var sc = 0; sc < loginSheetsToCheck.length; sc++) {
        var rows = getSheetRows(loginSheetsToCheck[sc]);
        for (var i = 0; i < rows.length; i++) {
          if (
            String(rows[i][0]).toLowerCase().trim() === emailNorm &&
            String(rows[i][1]) === pwd
          ) {
            return ContentService.createTextOutput(
              JSON.stringify({
                status: "success",
                message: "Login berhasil!",
                data: { email: rows[i][0], name: rows[i][2], photoURL: rows[i][3], coverUrl: rows[i][4] },
              })
            ).setMimeType(ContentService.MimeType.JSON);
          }
        }
      }
      return ContentService.createTextOutput(
        JSON.stringify({ status: "error", message: "Email/password salah atau belum terdaftar!" })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "updateProfile") {
      // Cari user di sheet utama DAN sheet lama
      var updateSheetsToCheck = [sUsers].concat(legacySheets);
      for (var sc = 0; sc < updateSheetsToCheck.length; sc++) {
        var targetSheet = updateSheetsToCheck[sc];
        if (!targetSheet || targetSheet.getLastRow() < 2) continue;
        var updateRows = targetSheet.getDataRange().getValues();
        for (var i = 1; i < updateRows.length; i++) {
          if (String(updateRows[i][0]).toLowerCase().trim() === emailNorm) {
            targetSheet.getRange(i + 1, 3).setValue(data.displayName);
            targetSheet.getRange(i + 1, 4).setValue(data.photoURL);
            targetSheet.getRange(i + 1, 5).setValue(data.coverUrl);
            return ContentService.createTextOutput(
              JSON.stringify({ status: "success", message: "Profile updated!" })
            ).setMimeType(ContentService.MimeType.JSON);
          }
        }
      }
    }

    // ============================================
    // 2. LOG AKTIVITAS LOGIN
    // ============================================
    if (data.action === "saveLoginLog") {
      var sLog = sheet.getSheetByName("Log_Login") || sheet.insertSheet("Log_Login");
      if (sLog.getLastRow() === 0) {
        sLog.appendRow(["Waktu", "Email", "IP Publik", "Kota", "Negara", "Perangkat/Browser", "Mode", "Status"]);
        sLog.setFrozenRows(1);
        sLog.getRange(1, 1, 1, 8).setFontWeight("bold");
      }
      sLog.appendRow([
        new Date().toLocaleString("id-ID"),
        data.email || "-",
        data.ip || "-",
        data.city || "-",
        data.country || "-",
        data.userAgent || "-",
        data.isDemoMode ? "Demo" : "Asli",
        data.status || "success",
      ]);
      return ContentService.createTextOutput(
        JSON.stringify({ status: "success", message: "Login log tersimpan!" }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // ============================================
    // 3. JADWAL ALARM DS3231 (Global — semua device berbagi sensor yang sama)
    // ============================================
    if (data.action === "saveSchedule") {
      var sJadwal = sheet.getSheetByName("Jadwal_Alarm") || sheet.insertSheet("Jadwal_Alarm");
      if (sJadwal.getLastRow() === 0) {
        sJadwal.appendRow(["Diperbarui", "OlehEmail", "JadwalJSON"]);
        sJadwal.setFrozenRows(1);
        sJadwal.getRange(1, 1, 1, 3).setFontWeight("bold");
      }
      // Selalu overwrite baris data (baris 2) — hanya simpan versi terbaru
      if (sJadwal.getLastRow() < 2) {
        sJadwal.appendRow([new Date().toLocaleString("id-ID"), data.email || "-", JSON.stringify(data.schedules || [])]);
      } else {
        sJadwal.getRange(2, 1).setValue(new Date().toLocaleString("id-ID"));
        sJadwal.getRange(2, 2).setValue(data.email || "-");
        sJadwal.getRange(2, 3).setValue(JSON.stringify(data.schedules || []));
      }
      return ContentService.createTextOutput(
        JSON.stringify({ status: "success", message: "Jadwal tersimpan!" })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "loadSchedule") {
      var sJadwal = sheet.getSheetByName("Jadwal_Alarm");
      if (!sJadwal || sJadwal.getLastRow() < 2) {
        return ContentService.createTextOutput(
          JSON.stringify({ status: "success", schedules: null })
        ).setMimeType(ContentService.MimeType.JSON);
      }
      var raw = sJadwal.getRange(2, 3).getValue();
      var parsed = [];
      try { parsed = JSON.parse(raw); } catch(pe) { parsed = []; }
      return ContentService.createTextOutput(
        JSON.stringify({ status: "success", schedules: parsed })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // ============================================
    // 4. FITUR LOG, GRAFIK & NOTIFIKASI
    // ============================================
    if (data.action === "syncData" || data.action === "fetchData") {
      // JIKA INI SINKRONISASI DARI WEB -> SIMPAN KE SPREADSHEET (Terpisah per User)
      if (data.action === "syncData" && data.logs && data.logs.length > 0) {
        var sL =
          sheet.getSheetByName("Logs" + modeSuffix) ||
          sheet.insertSheet("Logs" + modeSuffix);
        sL.clear();
        sL.appendRow([
          "ID",
          "Waktu",
          "Sumber Node",
          "Aksi Deteksi",
          "TimestampISO",
        ]);

        var rL = data.logs.map((l) => [
          l.id,
          new Date(l.timestamp).toLocaleString("id-ID"),
          l.source,
          l.action,
          l.timestamp,
        ]);
        if (rL.length > 0) sL.getRange(2, 1, rL.length, 5).setValues(rL);
      }

      // Sinkronisasi status node (Terpisah per User)
      if (data.action === "syncData" && data.nodeA && data.nodeB) {
        // Sheet Status
        var sS =
          sheet.getSheetByName("Status" + modeSuffix) ||
          sheet.insertSheet("Status" + modeSuffix);
        sS.clear();
        sS.appendRow([
          "Nama Node",
          "Total",
          "Status",
          "Baterai",
          "Tegangan",
          "LED",
        ]);
        sS.getRange(2, 1, 2, 6).setValues([
          [
            "Node A (365nm)",
            data.nodeA.uv365,
            data.nodeA.online ? "Online" : "Offline",
            data.nodeA.battery,
            data.nodeA.voltage,
            data.nodeA.led ? "Y" : "N",
          ],
          [
            "Node B (395nm)",
            data.nodeB.uv395,
            data.nodeB.online ? "Online" : "Offline",
            data.nodeB.battery,
            data.nodeB.voltage,
            data.nodeB.led ? "Y" : "N",
          ],
        ]);

        // Sheet Ringkasan — selalu konsisten dengan Status (total keseluruhan)
        // Sebelumnya menggunakan effectChartData yang berubah sesuai filter waktu,
        // sehingga nilai berbeda setiap sync. Sekarang selalu pakai total dari nodeA/nodeB.
        var sRing =
          sheet.getSheetByName("Ringkasan" + modeSuffix) ||
          sheet.insertSheet("Ringkasan" + modeSuffix);
        sRing.clear();
        sRing.appendRow(["Parameter", "Nilai"]);
        sRing.getRange(2, 1, 2, 2).setValues([
          ["Node A (365nm)", data.nodeA.uv365],
          ["Node B (395nm)", data.nodeB.uv395],
        ]);
      }

      // Simpan data Grafik (Terpisah per User)
      if (
        data.action === "syncData" &&
        data.chartData &&
        data.chartData.length > 0
      ) {
        var sC =
          sheet.getSheetByName("Grafik" + modeSuffix) ||
          sheet.insertSheet("Grafik" + modeSuffix);
        sC.clear();
        sC.appendRow(["Waktu (Titik)", "Node A (365nm)", "Node B (395nm)"]);
        var rC = data.chartData.map((c) => [c.time, c.NodeA, c.NodeB]);
        if (rC.length > 0) sC.getRange(2, 1, rC.length, 3).setValues(rC);
      }

      // Simpan data Suhu & Kelembaban DHT22 — append dengan dedup berbasis Timestamp_ms
      if (data.action === "syncData" && data.lingkunganData && data.lingkunganData.length > 0) {
        var sLing =
          sheet.getSheetByName("Lingkungan" + modeSuffix) ||
          sheet.insertSheet("Lingkungan" + modeSuffix);
        if (sLing.getLastRow() === 0) {
          sLing.appendRow(["Waktu", "Node", "Suhu (°C)", "Kelembaban (%)", "Timestamp_ms"]);
        } else {
          // Perbaiki header kolom E jika sheet lama (sebelum Timestamp_ms ditambahkan)
          var headerE = sLing.getRange(1, 5).getValue();
          if (!headerE) sLing.getRange(1, 5).setValue("Timestamp_ms");
        }

        // Ambil timestamp yang sudah ada untuk menghindari baris duplikat
        var existingLingRows = sLing.getDataRange().getValues();
        var existingTs = {};
        for (var ei = 1; ei < existingLingRows.length; ei++) {
          if (existingLingRows[ei][4]) existingTs[String(existingLingRows[ei][4])] = true;
        }

        var rLing = data.lingkunganData.filter(function(d) {
          return !existingTs[String(d.timestamp)];
        }).map(function(d) {
          return [new Date(d.timestamp).toLocaleString("id-ID"), d.node, d.temp, d.humidity, d.timestamp];
        });

        if (rLing.length > 0) {
          sLing.getRange(sLing.getLastRow() + 1, 1, rLing.length, 5).setValues(rLing);
        }
      }

      // ============================================
      // JIKA INI AKSI FETCH, MAKA KEMBALIKAN DATA DARI SHEET USER TERSEBUT
      // ============================================
      if (data.action === "fetchData") {
        var dataA = {
          uv365: 0,
          online: false,
          battery: 0,
          voltage: 0,
          led: false,
        };
        var dataB = {
          uv395: 0,
          online: false,
          battery: 0,
          voltage: 0,
          led: false,
        };
        var ObjectLogs = [];

        var sL_f = sheet.getSheetByName("Logs" + modeSuffix);
        if (sL_f) {
          var rawLogs = sL_f.getDataRange().getValues();
          for (var i = 1; i < rawLogs.length; i++) {
            if (rawLogs[i][0]) {
              ObjectLogs.push({
                id: rawLogs[i][0],
                timestamp: rawLogs[i][4] ? rawLogs[i][4] : Date.now(),
                source: rawLogs[i][2],
                action: rawLogs[i][3],
              });
            }
          }
        }

        var sS_f = sheet.getSheetByName("Status" + modeSuffix);
        if (sS_f) {
          var rawStatus = sS_f.getDataRange().getValues();
          for (var i = 1; i < rawStatus.length; i++) {
            if (
              rawStatus[i][0] &&
              (rawStatus[i][0].indexOf("A") !== -1 ||
                rawStatus[i][0].indexOf("365") !== -1)
            ) {
              dataA.uv365 = rawStatus[i][1];
              dataA.online = rawStatus[i][2] === "Online";
              dataA.battery = rawStatus[i][3];
              dataA.voltage = rawStatus[i][4];
              dataA.led = rawStatus[i][5] === "Y";
            }
            if (
              rawStatus[i][0] &&
              (rawStatus[i][0].indexOf("B") !== -1 ||
                rawStatus[i][0].indexOf("395") !== -1)
            ) {
              dataB.uv395 = rawStatus[i][1];
              dataB.online = rawStatus[i][2] === "Online";
              dataB.battery = rawStatus[i][3];
              dataB.voltage = rawStatus[i][4];
              dataB.led = rawStatus[i][5] === "Y";
            }
          }
        }

        var ObjectChartData = [];
        var sC_f = sheet.getSheetByName("Grafik" + modeSuffix);
        if (sC_f) {
          var rawChart = sC_f.getDataRange().getValues();
          for (var i = 1; i < rawChart.length; i++) {
            if (rawChart[i][0]) {
              ObjectChartData.push({
                time: rawChart[i][0],
                NodeA: rawChart[i][1] ? rawChart[i][1] : 0,
                NodeB: rawChart[i][2] ? rawChart[i][2] : 0,
              });
            }
          }
        }

        var ObjectSummary = { NodeA: 0, NodeB: 0 };
        var sSummary_f = sheet.getSheetByName("Ringkasan" + modeSuffix);
        if (sSummary_f) {
          var rawSummary = sSummary_f.getDataRange().getValues();
          for (var i = 1; i < rawSummary.length; i++) {
            if (rawSummary[i][0]) {
              if (
                rawSummary[i][0].indexOf("A") !== -1 ||
                rawSummary[i][0].indexOf("365") !== -1
              ) {
                ObjectSummary.NodeA = rawSummary[i][1] ? rawSummary[i][1] : 0;
              }
              if (
                rawSummary[i][0].indexOf("B") !== -1 ||
                rawSummary[i][0].indexOf("395") !== -1
              ) {
                ObjectSummary.NodeB = rawSummary[i][1] ? rawSummary[i][1] : 0;
              }
            }
          }
        }

        // ── AUTO-CLEANUP: Perbaiki header & hapus baris tanpa Timestamp_ms ──────
        var sLing_f = sheet.getSheetByName("Lingkungan" + modeSuffix);
        if (sLing_f && sLing_f.getLastRow() > 0) {
          if (!sLing_f.getRange(1, 5).getValue()) {
            sLing_f.getRange(1, 5).setValue("Timestamp_ms");
          }
          var lRowLing = sLing_f.getLastRow();
          if (lRowLing > 1) {
            var allLingRaw = sLing_f.getRange(2, 1, lRowLing - 1, 5).getValues();
            var validLingRaw = allLingRaw.filter(function(r) { return !!r[4]; });
            if (validLingRaw.length < allLingRaw.length) {
              sLing_f.getRange(2, 1, lRowLing - 1, 5).clearContent();
              if (validLingRaw.length > 0) {
                sLing_f.getRange(2, 1, validLingRaw.length, 5).setValues(validLingRaw);
              }
            }
          }
        }

        var ObjectLingkungan = [];
        if (sLing_f && sLing_f.getLastRow() > 1) {
          var rawLing_f = sLing_f.getRange(2, 1, sLing_f.getLastRow() - 1, 5).getValues();
          for (var i = 0; i < rawLing_f.length; i++) {
            var ts_f = rawLing_f[i][4];
            if (ts_f) {
              ObjectLingkungan.push({
                timestamp: Number(ts_f),
                node: rawLing_f[i][1],
                temp: rawLing_f[i][2],
                humidity: rawLing_f[i][3],
              });
            }
          }
        }

        // ── Hitung rata-rata per node ─────────────────────────────────────────
        var aT = [], aH = [], bT = [], bH = [];
        for (var ri = 0; ri < ObjectLingkungan.length; ri++) {
          var rl = ObjectLingkungan[ri];
          if (rl.node === 'A') { aT.push(rl.temp); aH.push(rl.humidity); }
          else if (rl.node === 'B') { bT.push(rl.temp); bH.push(rl.humidity); }
        }
        function avgArr(arr) {
          if (!arr.length) return null;
          return Math.round(arr.reduce(function(a,b){return a+b;},0) / arr.length * 10) / 10;
        }
        var rataRata = {
          A: { temp: avgArr(aT), hum: avgArr(aH), count: aT.length },
          B: { temp: avgArr(bT), hum: avgArr(bH), count: bT.length }
        };

        // ── Simpan rata-rata ke sheet RataRata (baris 2 selalu diperbarui) ────
        var sRata = sheet.getSheetByName("RataRata" + modeSuffix);
        if (!sRata) sRata = sheet.insertSheet("RataRata" + modeSuffix);
        if (sRata.getLastRow() === 0) {
          sRata.appendRow(["Waktu Update","Avg Suhu A (°C)","Avg Hum A (%)","Avg Suhu B (°C)","Avg Hum B (%)","Total Data"]);
          sRata.getRange(1, 1, 1, 6).setFontWeight("bold");
        }
        var rataRow = [new Date().toLocaleString("id-ID"), rataRata.A.temp, rataRata.A.hum, rataRata.B.temp, rataRata.B.hum, ObjectLingkungan.length];
        if (sRata.getLastRow() <= 1) { sRata.appendRow(rataRow); }
        else { sRata.getRange(2, 1, 1, 6).setValues([rataRow]); }

        return ContentService.createTextOutput(
          JSON.stringify({
            status: "success",
            message: "Fetch OK",
            data: {
              nodeA: dataA,
              nodeB: dataB,
              logs: ObjectLogs,
              chartData: ObjectChartData,
              effectChartData: ObjectSummary,
              lingkunganHistory: ObjectLingkungan,
              rataRata: rataRata,
            },
          }),
        ).setMimeType(ContentService.MimeType.JSON);
      }

      return ContentService.createTextOutput(
        JSON.stringify({ status: "success", message: "OK" }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // ============================================
    // 3. SCAN & HAPUS SHEET TIDAK TERPAKAI
    // ============================================
    if (data.action === "scanSheets") {
      var allSheets = sheet.getSheets();
      var validPrefixes = [
        "Users_Demo", "Users_DataAsli",
        "Logs_Demo", "Logs_DataAsli_",
        "Status_Demo", "Status_DataAsli_",
        "Grafik_Demo", "Grafik_DataAsli_",
        "Ringkasan_Demo", "Ringkasan_DataAsli_",
        "Lingkungan_Demo", "Lingkungan_DataAsli_",
        "Jadwal_Alarm", "Log_Login"
      ];
      var usedSheets = [];
      var unusedSheets = [];
      allSheets.forEach(function(s) {
        var name = s.getName();
        var isUsed = validPrefixes.some(function(p) {
          return name === p || name.indexOf(p) === 0;
        });
        if (isUsed) {
          usedSheets.push(name);
        } else {
          unusedSheets.push({ name: name, rows: s.getLastRow() });
        }
      });
      return ContentService.createTextOutput(
        JSON.stringify({ status: "success", data: { used: usedSheets, unused: unusedSheets } })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "deleteSheets") {
      var toDelete = data.sheetNames || [];
      var validPrefixes = [
        "Users_Demo", "Users_DataAsli",
        "Logs_Demo", "Logs_DataAsli_",
        "Status_Demo", "Status_DataAsli_",
        "Grafik_Demo", "Grafik_DataAsli_",
        "Ringkasan_Demo", "Ringkasan_DataAsli_",
        "Lingkungan_Demo", "Lingkungan_DataAsli_",
        "Jadwal_Alarm", "Log_Login"
      ];
      var deleted = [];
      var failed = [];
      toDelete.forEach(function(name) {
        var isProtected = validPrefixes.some(function(p) {
          return name === p || name.indexOf(p) === 0;
        });
        if (isProtected) {
          failed.push(name + " (dilindungi sistem)");
          return;
        }
        var s = sheet.getSheetByName(name);
        if (s && sheet.getSheets().length > 1) {
          sheet.deleteSheet(s);
          deleted.push(name);
        } else if (!s) {
          failed.push(name + " (tidak ditemukan)");
        } else {
          failed.push(name + " (satu-satunya sheet)");
        }
      });
      return ContentService.createTextOutput(
        JSON.stringify({ status: "success", data: { deleted: deleted, failed: failed } })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(
      JSON.stringify({ status: "error", message: "No valid action provided" }),
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: "error", message: err.message }),
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================
// FUNGSI STANDALONE — Jalankan dari Apps Script Editor
// ============================================

// Scan sheet mana yang tidak dikenali sistem (bisa dijalankan manual dari editor)
function scanUnusedSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var allSheets = ss.getSheets();
  var validPrefixes = [
    "Users_Demo", "Users_DataAsli",
    "Logs_Demo", "Logs_DataAsli_",
    "Status_Demo", "Status_DataAsli_",
    "Grafik_Demo", "Grafik_DataAsli_",
    "Ringkasan_Demo", "Ringkasan_DataAsli_",
    "Lingkungan_Demo", "Lingkungan_DataAsli_",
    "Jadwal_Alarm", "Log_Login"
  ];
  var unusedSheets = [];
  var usedSheets = [];
  allSheets.forEach(function(s) {
    var name = s.getName();
    var isUsed = validPrefixes.some(function(p) {
      return name === p || name.indexOf(p) === 0;
    });
    if (isUsed) {
      usedSheets.push(name);
    } else {
      unusedSheets.push({ name: name, rows: s.getLastRow() });
    }
  });
  Logger.log("=== SHEET TERPAKAI (" + usedSheets.length + ") ===");
  usedSheets.forEach(function(n) { Logger.log("✅ " + n); });
  Logger.log("=== SHEET TIDAK TERPAKAI (" + unusedSheets.length + ") ===");
  if (unusedSheets.length === 0) {
    Logger.log("(Kosong — semua sheet sudah terpakai sistem)");
  } else {
    unusedSheets.forEach(function(s) { Logger.log("❌ " + s.name + " | baris: " + s.rows); });
  }
  return { used: usedSheets, unused: unusedSheets };
}

// Hapus semua sheet tidak terpakai (dengan konfirmasi dialog di editor)
function deleteUnusedSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = scanUnusedSheets();
  if (result.unused.length === 0) {
    SpreadsheetApp.getUi().alert("Tidak ada sheet yang perlu dihapus. Semua sheet sudah terpakai!");
    return;
  }
  var names = result.unused.map(function(s) { return "• " + s.name + " (" + s.rows + " baris)"; }).join("\n");
  var response = SpreadsheetApp.getUi().alert(
    "Konfirmasi Hapus Sheet",
    "Sheet berikut akan dihapus permanen:\n\n" + names + "\n\nLanjutkan?",
    SpreadsheetApp.getUi().ButtonSet.YES_NO
  );
  if (response === SpreadsheetApp.getUi().Button.YES) {
    var count = 0;
    result.unused.forEach(function(s) {
      var sheet = ss.getSheetByName(s.name);
      if (sheet && ss.getSheets().length > 1) {
        ss.deleteSheet(sheet);
        count++;
        Logger.log("Dihapus: " + s.name);
      }
    });
    SpreadsheetApp.getUi().alert("Selesai! " + count + " sheet berhasil dihapus.");
  } else {
    Logger.log("Penghapusan dibatalkan oleh pengguna.");
  }
}

function doOptions(e) {
  var h = HtmlService.createHtmlOutput("");
  h.addMetaTag("Access-Control-Allow-Origin", "*");
  h.addMetaTag("Access-Control-Allow-Headers", "Content-Type");
  return h;
}
