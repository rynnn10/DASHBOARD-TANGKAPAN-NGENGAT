// ============================================================
// Backend Google Apps Script — Dashboard Tangkapan Ngengat
// Terakhir diperbarui: Kamis, 25 Juni 2026 17:50 WIB
// ============================================================
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
    var emailNorm = String(data.email || "")
      .toLowerCase()
      .trim();

    // Helper: ambil semua baris dari sebuah sheet (skip header)
    function getSheetRows(s) {
      if (!s || s.getLastRow() < 2) return [];
      return s.getDataRange().getValues().slice(1);
    }

    // Helper: beri warna header sheet sesuai tema data
    function styleHeader(s, numCols, bgColor) {
      s.getRange(1, 1, 1, numCols)
        .setBackground(bgColor)
        .setFontColor("#ffffff")
        .setFontWeight("bold");
      try {
        if (s.getFrozenRows() < 1) s.setFrozenRows(1);
      } catch (e) {}
    }

    // Format epoch (ms) ke waktu WIB eksplisit (GMT+7), apa pun zona project.
    // Memperbaiki bug jam yang tidak sesuai kenyataan di sheet.
    function fmtWIB(ms) {
      var n = Number(ms);
      if (!n || isNaN(n)) return "";
      return Utilities.formatDate(new Date(n), "GMT+7", "dd/MM/yyyy HH.mm.ss");
    }
    // Nama hari Indonesia dari epoch (ms) dalam WIB
    var HARI_ID_GS = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
    function hariWIB(ms) {
      var n = Number(ms);
      if (!n || isNaN(n)) return "";
      return HARI_ID_GS[Number(Utilities.formatDate(new Date(n), "GMT+7", "u")) % 7];
    }
    // Kunci tanggal WIB "YYYY-MM-DD" dari epoch (ms)
    function dateKeyWIB(ms) {
      var n = Number(ms);
      if (!n || isNaN(n)) return "";
      return Utilities.formatDate(new Date(n), "GMT+7", "yyyy-MM-dd");
    }

    // ============================================
    // SKEMA KONSOLIDASI v2: satu sheet per jenis data,
    // tiap baris ditandai kolom "Nama User" + "Email".
    // modeBase memisahkan Demo vs Asli; partisi data per-email.
    // ============================================
    var modeBase = data.isDemoMode ? "_Demo" : "_DataAsli";
    var partEmail = emailNorm || (data.isDemoMode ? "demo" : "");
    var partName =
      data.name || (emailNorm ? emailNorm.split("@")[0] : "Demo");

    // Ambil/siapkan sheet konsolidasi dengan 2 kolom depan (Nama User, Email)
    function getConsolidatedSheet(name, origHeader, color) {
      var s = sheet.getSheetByName(name);
      // Kasus tabrakan nama (mis. "Logs_Demo" lama per-mode vs konsolidasi baru):
      // sheet ada tapi header pertama BUKAN "Nama User" → skema lama. Upgrade in-place.
      if (
        s &&
        s.getLastRow() >= 1 &&
        String(s.getRange(1, 1).getValue()).trim() !== "Nama User"
      ) {
        var oldData = s.getDataRange().getValues();
        s.setName(name + "_old_v1"); // arsipkan (TIDAK dihapus)
        var ns = sheet.insertSheet(name);
        ns.appendRow(["Nama User", "Email"].concat(origHeader));
        styleHeader(ns, origHeader.length + 2, color);
        var rows = [];
        for (var i = 1; i < oldData.length; i++) {
          if (oldData[i].join("") === "") continue;
          rows.push(["Demo", "demo"].concat(oldData[i].slice(0, origHeader.length)));
        }
        if (rows.length > 0)
          ns.getRange(2, 1, rows.length, origHeader.length + 2).setValues(rows);
        return ns;
      }
      if (!s) s = sheet.insertSheet(name);
      if (s.getLastRow() === 0) {
        s.appendRow(["Nama User", "Email"].concat(origHeader));
        styleHeader(s, origHeader.length + 2, color);
      }
      return s;
    }

    // Cek apakah email sudah ada di kolom Email (kolom 2) sheet konsolidasi
    function emailExistsInSheet(s, email) {
      if (s.getLastRow() < 2) return false;
      var col = s.getRange(2, 2, s.getLastRow() - 1, 1).getValues();
      var en = String(email).toLowerCase().trim();
      for (var i = 0; i < col.length; i++)
        if (String(col[i][0]).toLowerCase().trim() === en) return true;
      return false;
    }

    // Migrasi SEKALI: salin sheet per-email lama (_DataAsli_<email>) ke konsolidasi.
    // Sheet lama TIDAK dihapus (arsip). Dijaga flag Script Property agar jalan sekali.
    function migrateConsolidatedV2() {
      var props;
      try {
        props = PropertiesService.getScriptProperties();
      } catch (e) {
        props = null;
      }
      if (props && props.getProperty("consolidated_v2_done") === "yes") return;

      var userMap = {};
      if (sUsers.getLastRow() >= 2) {
        var uv = sUsers.getDataRange().getValues();
        for (var i = 1; i < uv.length; i++) {
          var em = String(uv[i][0]).toLowerCase().trim();
          if (em)
            userMap[em.replace(/[@.]/g, "_")] = {
              email: em,
              name: uv[i][2] || em.split("@")[0],
            };
        }
      }

      var types = [
        { p: "Logs", h: ["ID", "Waktu", "Sumber Node", "Aksi Deteksi", "TimestampISO"], c: "#be123c" },
        { p: "Status", h: ["Nama Node", "Total", "Status", "Baterai", "Tegangan", "LED"], c: "#047857" },
        { p: "Ringkasan", h: ["Parameter", "Nilai"], c: "#4338ca" },
        { p: "Grafik", h: ["Waktu (Titik)", "Node A (365nm)", "Node B (395nm)"], c: "#1d4ed8" },
        { p: "Lingkungan", h: ["Waktu", "Node", "Suhu (°C)", "Kelembaban (%)", "Timestamp_ms"], c: "#0e7490" },
        { p: "RataRataLingkungan", h: ["Waktu Update", "Avg Suhu A (°C)", "Avg Hum A (%)", "Avg Suhu B (°C)", "Avg Hum B (%)"], c: "#0f766e" },
      ];

      var all = sheet.getSheets();
      all.forEach(function (s) {
        var name = s.getName();
        if (s.getLastRow() < 2) return;
        for (var t = 0; t < types.length; t++) {
          var ty = types[t];
          var variants = [ty.p + "_DataAsli_"];
          if (ty.p === "RataRataLingkungan") variants.push("RataRata_DataAsli_");
          for (var v = 0; v < variants.length; v++) {
            if (name.indexOf(variants[v]) !== 0) continue;
            var sani = name.substring(variants[v].length);
            var info = userMap[sani] || { email: sani, name: sani };
            var dest = getConsolidatedSheet(ty.p + "_DataAsli", ty.h, ty.c);
            if (emailExistsInSheet(dest, info.email)) continue;
            var ov = s.getDataRange().getValues();
            var rows = [];
            for (var r = 1; r < ov.length; r++) {
              if (ov[r].join("") === "") continue;
              rows.push([info.name, info.email].concat(ov[r].slice(0, ty.h.length)));
            }
            if (rows.length > 0)
              dest
                .getRange(dest.getLastRow() + 1, 1, rows.length, ty.h.length + 2)
                .setValues(rows);
          }
        }
      });

      if (props) props.setProperty("consolidated_v2_done", "yes");
    }

    // Hapus semua baris milik email tertentu (kolom 2 = Email), tulis ulang sisanya
    function deleteUserRows(s, email) {
      if (s.getLastRow() < 2) return;
      var vals = s.getDataRange().getValues();
      var numCols = vals[0].length;
      var keep = [];
      for (var i = 1; i < vals.length; i++) {
        if (String(vals[i][1]).toLowerCase().trim() !== String(email).toLowerCase().trim())
          keep.push(vals[i]);
      }
      s.getRange(2, 1, s.getLastRow() - 1, numCols).clearContent();
      if (keep.length > 0) s.getRange(2, 1, keep.length, numCols).setValues(keep);
    }

    // Append baris milik user (prepend Nama User + Email ke tiap baris)
    function appendUserRows(s, name, email, rows) {
      if (!rows || !rows.length) return;
      var tagged = rows.map(function (r) {
        return [name, email].concat(r);
      });
      s.getRange(s.getLastRow() + 1, 1, tagged.length, tagged[0].length).setValues(
        tagged,
      );
    }

    // Sisipkan baris milik user TEPAT DI BAWAH HEADER (baris 2) → data terbaru di atas.
    // `rows` HARUS sudah urut top-down (paling baru lebih dulu): rows[0] jadi baris 2.
    function prependUserRows(s, name, email, rows) {
      if (!rows || !rows.length) return;
      var tagged = rows.map(function (r) {
        return [name, email].concat(r);
      });
      s.insertRowsAfter(1, tagged.length);
      s.getRange(2, 1, tagged.length, tagged[0].length).setValues(tagged);
    }

    // Baca baris milik email; kembalikan kolom asli (tanpa 2 kolom depan)
    function readUserRows(name, email) {
      var s = sheet.getSheetByName(name);
      if (!s || s.getLastRow() < 2) return [];
      var vals = s.getDataRange().getValues();
      var out = [];
      var en = String(email).toLowerCase().trim();
      for (var i = 1; i < vals.length; i++) {
        if (String(vals[i][1]).toLowerCase().trim() === en) out.push(vals[i].slice(2));
      }
      return out;
    }

    // Nama sheet sistem yang DILINDUNGI (skema konsolidasi v2) — cocok PERSIS.
    // Sheet lama per-email (<jenis>_DataAsli_<email>) & arsip *_old_v1 TIDAK
    // termasuk → dianggap tidak terpakai sehingga bisa dibersihkan.
    function isProtectedSheet(name) {
      var exact = [
        "Users",
        "Users_Demo",
        "Users_DataAsli",
        "Jadwal_Alarm",
        "Log_Login",
        "OTP_Verifikasi",
        "Logs_Demo",
        "Logs_DataAsli",
        "Status_Demo",
        "Status_DataAsli",
        "Ringkasan_Demo",
        "Ringkasan_DataAsli",
        "Grafik_Demo",
        "Grafik_DataAsli",
        "Lingkungan_Demo",
        "Lingkungan_DataAsli",
        "RataRataLingkungan_Demo",
        "RataRataLingkungan_DataAsli",
        "Efektivitas_Harian_Demo",
        "Efektivitas_Harian_DataAsli",
        "Log_Alarm_Demo",
        "Log_Alarm_DataAsli",
      ];
      return exact.indexOf(name) !== -1;
    }

    // Hapus SEKALI sheet lama yang tak terpakai (sheet per-email & arsip *_old_v1)
    // HANYA setelah migrasi konsolidasi selesai. Dijaga flag agar jalan sekali.
    function cleanupOldSheetsV2() {
      var props;
      try {
        props = PropertiesService.getScriptProperties();
      } catch (e) {
        props = null;
      }
      if (!props) return;
      if (props.getProperty("consolidated_v2_done") !== "yes") return;
      if (props.getProperty("cleanup_old_v2_done") === "yes") return;
      var oldAsliRe = /^(Logs|Status|Ringkasan|Grafik|grafik|Lingkungan|RataRataLingkungan|RataRata)_DataAsli_.+/;
      var toDelete = [];
      sheet.getSheets().forEach(function (s) {
        var n = s.getName();
        if (isProtectedSheet(n)) return;
        if (oldAsliRe.test(n) || /_old_v1$/.test(n)) toDelete.push(n);
      });
      toDelete.forEach(function (n) {
        var s = sheet.getSheetByName(n);
        if (s && sheet.getSheets().length > 1) {
          try {
            sheet.deleteSheet(s);
          } catch (e2) {}
        }
      });
      props.setProperty("cleanup_old_v2_done", "yes");
    }

    // Tipe akun berdasarkan mode: Demo dan Asli adalah AKUN TERPISAH
    // (boleh email sama, password & data berbeda) dibedakan kolom "Tipe".
    var wantedTipe = data.isDemoMode ? "Demo" : "Asli";

    // Sheet lama (backward compat) — TIDAK dihapus. Users_Demo = akun Demo,
    // Users_DataAsli = akun Asli. Dibaca saat login agar akun lama tetap masuk.
    var sUsersDemo = sheet.getSheetByName("Users_Demo");
    var sUsersAsli = sheet.getSheetByName("Users_DataAsli");
    var legacyForMode = data.isDemoMode ? sUsersDemo : sUsersAsli;

    // ============================================
    // 1. FITUR AKUN (Register & Login & Update)
    // ============================================
    // Buat header + pastikan kolom "Tipe" (kolom 7) ada
    if (sUsers.getLastRow() === 0) {
      sUsers.appendRow([
        "Email",
        "Password",
        "Name",
        "PhotoURL",
        "CoverURL",
        "Dibuat Sejak",
        "Tipe",
      ]);
      styleHeader(sUsers, 7, "#7c3aed");
    } else if (!sUsers.getRange(1, 7).getValue()) {
      sUsers.getRange(1, 7).setValue("Tipe");
      styleHeader(sUsers, 7, "#7c3aed");
    }

    // ── KIRIM OTP ke email (verifikasi email benar-benar ada) ──────────────
    if (data.action === "sendOtp") {
      // Tolak jika email sudah terdaftar (Tipe sama)
      var otpRegRows = getSheetRows(sUsers);
      for (var i = 0; i < otpRegRows.length; i++) {
        if (
          String(otpRegRows[i][0]).toLowerCase().trim() === emailNorm &&
          String(otpRegRows[i][6] || "").trim() === wantedTipe
        ) {
          return ContentService.createTextOutput(
            JSON.stringify({
              status: "error",
              message:
                "Email sudah terdaftar untuk mode " +
                (data.isDemoMode ? "Demo" : "Asli") +
                "!",
            }),
          ).setMimeType(ContentService.MimeType.JSON);
        }
      }
      var otpLegRows = getSheetRows(legacyForMode);
      for (var i = 0; i < otpLegRows.length; i++) {
        if (String(otpLegRows[i][0]).toLowerCase().trim() === emailNorm) {
          return ContentService.createTextOutput(
            JSON.stringify({
              status: "error",
              message:
                "Email sudah terdaftar untuk mode " +
                (data.isDemoMode ? "Demo" : "Asli") +
                "!",
            }),
          ).setMimeType(ContentService.MimeType.JSON);
        }
      }
      // Peringatan nama duplikat (kecuali forceRegister)
      if (!data.forceRegister && data.name) {
        var otpNameNorm = String(data.name).toLowerCase().trim();
        for (var i = 0; i < otpRegRows.length; i++) {
          if (
            String(otpRegRows[i][2] || "").toLowerCase().trim() === otpNameNorm &&
            String(otpRegRows[i][6] || "").trim() === wantedTipe
          ) {
            return ContentService.createTextOutput(
              JSON.stringify({
                status: "name_exists",
                message:
                  'Nama "' + data.name + '" sudah dipakai. Mungkin Anda ingin login?',
              }),
            ).setMimeType(ContentService.MimeType.JSON);
          }
        }
      }
      // Buat & simpan kode OTP
      var sOtp =
        sheet.getSheetByName("OTP_Verifikasi") ||
        sheet.insertSheet("OTP_Verifikasi");
      if (sOtp.getLastRow() === 0) {
        sOtp.appendRow(["Email", "Tipe", "Kode", "Kadaluarsa(ms)", "Dibuat"]);
        styleHeader(sOtp, 5, "#9333ea");
      }
      var otpCode = String(Math.floor(100000 + Math.random() * 900000));
      var otpExpiry = Date.now() + 10 * 60 * 1000; // 10 menit
      var otpRow = [
        emailNorm,
        wantedTipe,
        otpCode,
        otpExpiry,
        new Date().toLocaleString("id-ID"),
      ];
      var otpFound = false;
      if (sOtp.getLastRow() >= 2) {
        var otpVals = sOtp.getDataRange().getValues();
        for (var i = 1; i < otpVals.length; i++) {
          if (
            String(otpVals[i][0]).toLowerCase().trim() === emailNorm &&
            String(otpVals[i][1]) === wantedTipe
          ) {
            sOtp.getRange(i + 1, 1, 1, 5).setValues([otpRow]);
            otpFound = true;
            break;
          }
        }
      }
      if (!otpFound) sOtp.appendRow(otpRow);

      try {
        MailApp.sendEmail({
          to: emailNorm,
          subject: "Kode Verifikasi - Dashboard Tangkapan Ngengat",
          htmlBody:
            '<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">' +
            '<h2 style="color:#059669;margin:0 0 8px">Dashboard Tangkapan Ngengat</h2>' +
            '<p style="color:#374151;font-size:14px">Gunakan kode berikut untuk verifikasi email Anda saat mendaftar:</p>' +
            '<div style="text-align:center;margin:20px 0"><span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#111827">' +
            otpCode +
            "</span></div>" +
            '<p style="color:#6b7280;font-size:12px">Kode berlaku <b>10 menit</b>. Abaikan email ini jika Anda tidak mendaftar.</p>' +
            "</div>",
        });
      } catch (eMail) {
        return ContentService.createTextOutput(
          JSON.stringify({
            status: "error",
            message: "Gagal mengirim email OTP: " + eMail,
          }),
        ).setMimeType(ContentService.MimeType.JSON);
      }
      return ContentService.createTextOutput(
        JSON.stringify({
          status: "otp_sent",
          message: "Kode OTP telah dikirim ke " + emailNorm,
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "register") {
      // Verifikasi OTP wajib (email harus benar-benar ada)
      var otpInput = String(data.otp || "").trim();
      var sOtpV = sheet.getSheetByName("OTP_Verifikasi");
      var otpValid = false;
      if (sOtpV && otpInput && sOtpV.getLastRow() >= 2) {
        var otpVV = sOtpV.getDataRange().getValues();
        for (var oi = 1; oi < otpVV.length; oi++) {
          if (
            String(otpVV[oi][0]).toLowerCase().trim() === emailNorm &&
            String(otpVV[oi][1]) === wantedTipe
          ) {
            if (
              String(otpVV[oi][2]) === otpInput &&
              Number(otpVV[oi][3]) > Date.now()
            ) {
              otpValid = true;
              sOtpV.deleteRow(oi + 1); // pakai sekali
            }
            break;
          }
        }
      }
      if (!otpValid) {
        return ContentService.createTextOutput(
          JSON.stringify({
            status: "otp_invalid",
            message: "Kode OTP salah atau sudah kadaluarsa. Silakan kirim ulang.",
          }),
        ).setMimeType(ContentService.MimeType.JSON);
      }

      // Cek duplikat HANYA untuk tipe yang sama (Demo/Asli akun terpisah)
      var regRows = getSheetRows(sUsers);
      for (var i = 0; i < regRows.length; i++) {
        var rEm = String(regRows[i][0]).toLowerCase().trim();
        var rTp = String(regRows[i][6] || "").trim();
        if (rEm === emailNorm && rTp === wantedTipe) {
          return ContentService.createTextOutput(
            JSON.stringify({
              status: "error",
              message:
                "Email sudah terdaftar untuk mode " +
                (data.isDemoMode ? "Demo" : "Asli") +
                "!",
            }),
          ).setMimeType(ContentService.MimeType.JSON);
        }
      }
      // Cek juga sheet lama untuk mode yang sama
      var regLegRows = getSheetRows(legacyForMode);
      for (var i = 0; i < regLegRows.length; i++) {
        if (String(regLegRows[i][0]).toLowerCase().trim() === emailNorm) {
          return ContentService.createTextOutput(
            JSON.stringify({
              status: "error",
              message:
                "Email sudah terdaftar untuk mode " +
                (data.isDemoMode ? "Demo" : "Asli") +
                "!",
            }),
          ).setMimeType(ContentService.MimeType.JSON);
        }
      }
      // Peringatan NAMA sudah dipakai (Tipe sama) — bukan error keras.
      // App bisa menampilkan konfirmasi "mungkin mau login?". Jika user tetap
      // ingin lanjut, kirim ulang dengan forceRegister=true.
      if (!data.forceRegister && data.name) {
        var nameNorm = String(data.name).toLowerCase().trim();
        for (var i = 0; i < regRows.length; i++) {
          var rN = String(regRows[i][2] || "").toLowerCase().trim();
          var rTp2 = String(regRows[i][6] || "").trim();
          if (rN && rN === nameNorm && rTp2 === wantedTipe) {
            return ContentService.createTextOutput(
              JSON.stringify({
                status: "name_exists",
                message:
                  "Nama \"" +
                  data.name +
                  "\" sudah dipakai. Mungkin Anda ingin login?",
              }),
            ).setMimeType(ContentService.MimeType.JSON);
          }
        }
      }
      // Simpan dengan Tipe
      sUsers.appendRow([
        emailNorm,
        data.password,
        data.name || "",
        data.photoURL || "",
        data.coverUrl || "",
        new Date().toISOString(),
        wantedTipe,
      ]);
      return ContentService.createTextOutput(
        JSON.stringify({
          status: "success",
          message: "Pendaftaran berhasil!",
          data: {
            email: emailNorm,
            name: data.name,
            photoURL: data.photoURL,
            coverUrl: data.coverUrl,
          },
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "login") {
      var pwd = String(data.password || "");
      var loginEmailFound = false;

      // 1. Sheet utama: dua pass — pertama cari email, lalu cek password
      var allUsers = sUsers.getDataRange().getValues();
      for (var i = 1; i < allUsers.length; i++) {
        var uEm = String(allUsers[i][0]).toLowerCase().trim();
        var uTp = String(allUsers[i][6] || "").trim();
        if (uEm === emailNorm && (uTp === wantedTipe || uTp === "")) {
          loginEmailFound = true;
          if (String(allUsers[i][1]) === pwd) {
            // Self-heal: isi Tipe baris lama yang masih kosong
            if (uTp === "") sUsers.getRange(i + 1, 7).setValue(wantedTipe);
            return ContentService.createTextOutput(
              JSON.stringify({
                status: "success",
                message: "Login berhasil!",
                data: {
                  email: allUsers[i][0],
                  name: allUsers[i][2],
                  photoURL: allUsers[i][3],
                  coverUrl: allUsers[i][4],
                },
              }),
            ).setMimeType(ContentService.MimeType.JSON);
          }
        }
      }

      // 2. Sheet lama untuk mode ini (Users_Demo / Users_DataAsli)
      var legLoginRows = getSheetRows(legacyForMode);
      for (var i = 0; i < legLoginRows.length; i++) {
        if (String(legLoginRows[i][0]).toLowerCase().trim() === emailNorm) {
          loginEmailFound = true;
          if (String(legLoginRows[i][1]) === pwd) {
            return ContentService.createTextOutput(
              JSON.stringify({
                status: "success",
                message: "Login berhasil!",
                data: {
                  email: legLoginRows[i][0],
                  name: legLoginRows[i][2],
                  photoURL: legLoginRows[i][3],
                  coverUrl: legLoginRows[i][4],
                },
              }),
            ).setMimeType(ContentService.MimeType.JSON);
          }
        }
      }

      // Pesan error spesifik: email tidak ada vs password salah
      if (!loginEmailFound) {
        return ContentService.createTextOutput(
          JSON.stringify({
            status: "error",
            message: "Email belum terdaftar untuk mode " + (data.isDemoMode ? "Demo" : "Asli") + ". Silakan daftar akun baru.",
          }),
        ).setMimeType(ContentService.MimeType.JSON);
      }
      return ContentService.createTextOutput(
        JSON.stringify({
          status: "error",
          message: "Password salah. Periksa kembali password Anda.",
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "updateProfile") {
      // Cari user di sheet utama (cocokkan Tipe sesuai mode atau kosong), lalu sheet lama
      if (sUsers.getLastRow() >= 2) {
        var updMain = sUsers.getDataRange().getValues();
        for (var i = 1; i < updMain.length; i++) {
          var mEm = String(updMain[i][0]).toLowerCase().trim();
          var mTp = String(updMain[i][6] || "").trim();
          if (mEm === emailNorm && (mTp === wantedTipe || mTp === "")) {
            sUsers.getRange(i + 1, 3).setValue(data.displayName);
            sUsers.getRange(i + 1, 4).setValue(data.photoURL);
            sUsers.getRange(i + 1, 5).setValue(data.coverUrl);
            if (mTp === "") sUsers.getRange(i + 1, 7).setValue(wantedTipe);
            return ContentService.createTextOutput(
              JSON.stringify({
                status: "success",
                message: "Profile updated!",
              }),
            ).setMimeType(ContentService.MimeType.JSON);
          }
        }
      }
      if (legacyForMode && legacyForMode.getLastRow() >= 2) {
        var updLeg = legacyForMode.getDataRange().getValues();
        for (var i = 1; i < updLeg.length; i++) {
          if (String(updLeg[i][0]).toLowerCase().trim() === emailNorm) {
            legacyForMode.getRange(i + 1, 3).setValue(data.displayName);
            legacyForMode.getRange(i + 1, 4).setValue(data.photoURL);
            legacyForMode.getRange(i + 1, 5).setValue(data.coverUrl);
            return ContentService.createTextOutput(
              JSON.stringify({
                status: "success",
                message: "Profile updated!",
              }),
            ).setMimeType(ContentService.MimeType.JSON);
          }
        }
      }
    }

    // ============================================
    // 2. LOG AKTIVITAS LOGIN
    // ============================================
    if (data.action === "saveLoginLog") {
      var sLog =
        sheet.getSheetByName("Log_Login") || sheet.insertSheet("Log_Login");
      if (sLog.getLastRow() === 0) {
        sLog.appendRow([
          "Waktu",
          "Email",
          "IP Publik",
          "Kota",
          "Negara",
          "Perangkat/Browser",
          "Mode",
          "Status",
          "SessionID",
        ]);
        styleHeader(sLog, 9, "#1e40af");
      } else if (!sLog.getRange(1, 9).getValue()) {
        // Self-heal: tambah kolom SessionID pada sheet lama (8 kolom)
        sLog.getRange(1, 9).setValue("SessionID");
        styleHeader(sLog, 9, "#1e40af");
      }
      var logLoginRow = [
        fmtWIB(Date.now()),
        data.email || "-",
        data.ip || "-",
        data.city || "-",
        data.country || "-",
        data.userAgent || "-",
        data.isDemoMode ? "Demo" : "Asli",
        data.status || "success",
        data.sessionId || "-", // token sesi: penanda device untuk validasi
      ];
      // Sisipkan login terbaru di baris 2 (paling atas) bukan di bawah
      sLog.insertRowsAfter(1, 1);
      sLog.getRange(2, 1, 1, logLoginRow.length).setValues([logLoginRow]);
      return ContentService.createTextOutput(
        JSON.stringify({ status: "success", message: "Login log tersimpan!" }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // ── VALIDASI SESI — sesi sah hanya jika baris Log_Login (token) masih ada.
    // Admin hapus baris di sheet → token tak ketemu → device wajib login ulang.
    if (data.action === "validateSession") {
      var sLogV = sheet.getSheetByName("Log_Login");
      var token = String(data.sessionId || "");
      var emV = String(data.email || "").toLowerCase().trim();
      var valid = false;
      if (sLogV && sLogV.getLastRow() >= 2 && token) {
        var lvV = sLogV.getRange(2, 1, sLogV.getLastRow() - 1, 9).getValues();
        for (var vi = 0; vi < lvV.length; vi++) {
          if (
            String(lvV[vi][1]).toLowerCase().trim() === emV &&
            String(lvV[vi][8]) === token
          ) {
            valid = true;
            break;
          }
        }
      }
      return ContentService.createTextOutput(
        JSON.stringify({ status: "success", valid: valid }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // ============================================
    // 3. JADWAL ALARM DS3231 (Global — semua device berbagi sensor yang sama)
    // ============================================
    if (data.action === "saveSchedule") {
      var sJadwal =
        sheet.getSheetByName("Jadwal_Alarm") ||
        sheet.insertSheet("Jadwal_Alarm");
      if (sJadwal.getLastRow() === 0) {
        sJadwal.appendRow(["Diperbarui", "OlehEmail", "JadwalJSON"]);
        styleHeader(sJadwal, 3, "#b45309");
      }
      // Selalu overwrite baris data (baris 2) — hanya simpan versi terbaru
      if (sJadwal.getLastRow() < 2) {
        sJadwal.appendRow([
          new Date().toLocaleString("id-ID"),
          data.email || "-",
          JSON.stringify(data.schedules || []),
        ]);
      } else {
        sJadwal.getRange(2, 1).setValue(new Date().toLocaleString("id-ID"));
        sJadwal.getRange(2, 2).setValue(data.email || "-");
        sJadwal.getRange(2, 3).setValue(JSON.stringify(data.schedules || []));
      }
      return ContentService.createTextOutput(
        JSON.stringify({ status: "success", message: "Jadwal tersimpan!" }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "loadSchedule") {
      var sJadwal = sheet.getSheetByName("Jadwal_Alarm");
      if (!sJadwal || sJadwal.getLastRow() < 2) {
        return ContentService.createTextOutput(
          JSON.stringify({ status: "success", schedules: null }),
        ).setMimeType(ContentService.MimeType.JSON);
      }
      var raw = sJadwal.getRange(2, 3).getValue();
      var parsed = [];
      try {
        parsed = JSON.parse(raw);
      } catch (pe) {
        parsed = [];
      }
      return ContentService.createTextOutput(
        JSON.stringify({ status: "success", schedules: parsed }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // ── LOG EKSEKUSI ALARM — relay ON/OFF terjadwal (Berhasil) atau terlewat (Gagal) ──
    if (data.action === "logAlarm") {
      var sAlarm = getConsolidatedSheet(
        "Log_Alarm" + modeBase,
        ["Waktu Eksekusi", "Node", "Aksi", "Status", "Timestamp_ms"],
        "#b45309",
      );
      var tms = Number(data.ts) || Date.now();
      prependUserRows(sAlarm, partName, partEmail, [
        [
          fmtWIB(tms),
          data.node || "-",
          data.alarmAction || "-",     // "ON" / "OFF"
          data.status || "Berhasil",   // "Berhasil" / "Gagal (Terlewat)"
          tms,
        ],
      ]);
      return ContentService.createTextOutput(
        JSON.stringify({ status: "success", message: "Log alarm tersimpan" }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // ============================================
    // 4. FITUR LOG, GRAFIK & NOTIFIKASI
    // ============================================
    if (data.action === "syncData" || data.action === "fetchData") {
      // Migrasi sekali dari skema per-email lama → konsolidasi, lalu bersihkan sheet lama
      migrateConsolidatedV2();
      cleanupOldSheetsV2();

      // JIKA INI SINKRONISASI DARI WEB -> SIMPAN KE SHEET KONSOLIDASI (tag per user)
      if (data.action === "syncData" && data.logs) {
        var sL = getConsolidatedSheet(
          "Logs" + modeBase,
          ["ID", "Waktu", "Sumber Node", "Aksi Deteksi", "TimestampISO"],
          "#be123c",
        );

        if (data.isReset) {
          // RESET sah dari user → bersihkan log node target (atau semua), lalu tulis sisanya.
          // Kolom penuh: 1 Nama,2 Email,3 ID,4 Waktu,5 Sumber Node,6 Aksi,7 TimestampISO
          var rt = String(data.resetTarget || "both");
          if (sL.getLastRow() > 1) {
            var lvR = sL.getDataRange().getValues();
            var keepR = [lvR[0]];
            var enR = String(partEmail).toLowerCase().trim();
            for (var ri2 = 1; ri2 < lvR.length; ri2++) {
              var isUserR = String(lvR[ri2][1]).toLowerCase().trim() === enR;
              if (!isUserR) { keepR.push(lvR[ri2]); continue; }
              if (rt === "both") continue; // hapus semua milik user
              var srcR = String(lvR[ri2][4] || "");
              var rowNode =
                srcR.indexOf("365") !== -1 || /\bA\b|Node A/i.test(srcR) ? "A" :
                srcR.indexOf("395") !== -1 || /\bB\b|Node B/i.test(srcR) ? "B" : "";
              if (rowNode === rt) continue; // hapus baris node target
              keepR.push(lvR[ri2]);
            }
            sL.getRange(2, 1, sL.getLastRow() - 1, lvR[0].length).clearContent();
            if (keepR.length > 1)
              sL.getRange(2, 1, keepR.length - 1, lvR[0].length)
                .setValues(keepR.slice(1));
          }
        } else if (data.logs.length > 0) {
          // MENUMPUK + DEDUP per ID — tiap deteksi disimpan permanen, tidak ditimpa.
          var existingIds = {};
          if (sL.getLastRow() > 1) {
            var lv = sL.getRange(2, 1, sL.getLastRow() - 1, 3).getValues();
            for (var li = 0; li < lv.length; li++) {
              if (
                String(lv[li][1]).toLowerCase().trim() ===
                  String(partEmail).toLowerCase().trim() &&
                lv[li][2] !== "" && lv[li][2] != null
              )
                existingIds[String(lv[li][2])] = true;
            }
          }
          var rL = data.logs
            .filter(function (l) {
              return l.id != null && !existingIds[String(l.id)];
            })
            .map(function (l) {
              return [
                l.id,
                fmtWIB(l.timestamp), // waktu WIB eksplisit (perbaikan bug jam)
                l.source,
                l.action,
                l.timestamp,
              ];
            });
          rL.sort(function (a, b) {
            return Number(b[4]) - Number(a[4]);
          });
          prependUserRows(sL, partName, partEmail, rL);
        }
      }

      // Sinkronisasi status node + ringkasan (tag per user)
      if (data.action === "syncData" && data.nodeA && data.nodeB) {
        var sS = getConsolidatedSheet(
          "Status" + modeBase,
          ["Nama Node", "Total", "Status", "Baterai", "Tegangan", "LED"],
          "#047857",
        );
        // PENGAMAN ANTI-HAPUS: baca total tersimpan. Tanpa reset sah (isReset),
        // total TIDAK BOLEH turun → cegah sync stale (mis. 0 sebelum data termuat)
        // menimpa angka tangkapan yang benar di database.
        var storedA = 0, storedB = 0;
        var prevStatus = readUserRows("Status" + modeBase, partEmail);
        for (var psi = 0; psi < prevStatus.length; psi++) {
          var pnm = String(prevStatus[psi][0] || "");
          if (pnm.indexOf("A") !== -1 || pnm.indexOf("365") !== -1)
            storedA = Number(prevStatus[psi][1]) || 0;
          if (pnm.indexOf("B") !== -1 || pnm.indexOf("395") !== -1)
            storedB = Number(prevStatus[psi][1]) || 0;
        }
        var incA = Number(data.nodeA.uv365) || 0;
        var incB = Number(data.nodeB.uv395) || 0;
        var finalA = data.isReset ? incA : Math.max(incA, storedA);
        var finalB = data.isReset ? incB : Math.max(incB, storedB);

        deleteUserRows(sS, partEmail);
        appendUserRows(sS, partName, partEmail, [
          [
            "Node A (365nm)",
            finalA,
            data.nodeA.online ? "Online" : "Offline",
            data.nodeA.battery,
            data.nodeA.voltage,
            data.nodeA.led ? "Y" : "N",
          ],
          [
            "Node B (395nm)",
            finalB,
            data.nodeB.online ? "Online" : "Offline",
            data.nodeB.battery,
            data.nodeB.voltage,
            data.nodeB.led ? "Y" : "N",
          ],
        ]);

        var sRing = getConsolidatedSheet(
          "Ringkasan" + modeBase,
          ["Parameter", "Nilai"],
          "#4338ca",
        );
        deleteUserRows(sRing, partEmail);
        appendUserRows(sRing, partName, partEmail, [
          ["Node A (365nm)", finalA],
          ["Node B (395nm)", finalB],
        ]);
      }

      // Simpan data Grafik (tag per user)
      if (
        data.action === "syncData" &&
        data.chartData &&
        data.chartData.length > 0
      ) {
        var sC = getConsolidatedSheet(
          "Grafik" + modeBase,
          ["Waktu (Titik)", "Node A (365nm)", "Node B (395nm)"],
          "#1d4ed8",
        );
        deleteUserRows(sC, partEmail);
        var rC = data.chartData
          .map(function (c) {
            return [c.time, c.NodeA, c.NodeB];
          })
          .reverse(); // chartData kronologis → balik agar titik terbaru di atas
        appendUserRows(sC, partName, partEmail, rC);
      }

      // ── EFEKTIVITAS HARIAN — total ngengat per HARI per node (upsert per tanggal) ──
      // Tidak menimpa hari lama: hanya memperbarui/menambah tanggal yang dikirim.
      if (
        data.action === "syncData" &&
        data.dailyEffect &&
        data.dailyEffect.length > 0
      ) {
        var sEff = getConsolidatedSheet(
          "Efektivitas_Harian" + modeBase,
          ["Tanggal", "Hari", "Node A (365nm)", "Node B (395nm)", "Total"],
          "#9333ea",
        );
        // Kolom Tanggal kini = "YYYY-MM-DD HH.mm" (tanggal + jam update terakhir WIB).
        // Pencocokan upsert pakai 10 karakter pertama (bagian tanggal saja).
        var nowHm = Utilities.formatDate(new Date(), "GMT+7", "HH.mm");
        // Peta tanggal → nomor baris (untuk user ini). Kolom: 1 Nama,2 Email,3 Tanggal..7 Total
        var effExisting = {};
        var effLastR = sEff.getLastRow();
        if (effLastR > 1) {
          var effVals = sEff.getRange(2, 1, effLastR - 1, 7).getValues();
          for (var ei = 0; ei < effVals.length; ei++) {
            if (
              String(effVals[ei][1]).toLowerCase().trim() ===
                String(partEmail).toLowerCase().trim() &&
              effVals[ei][2]
            )
              effExisting[String(effVals[ei][2]).substring(0, 10)] = ei + 2;
          }
        }
        var effAppend = [];
        data.dailyEffect.forEach(function (e) {
          var a = Number(e.NodeA) || 0;
          var b = Number(e.NodeB) || 0;
          var tanggalCell = e.date + " " + nowHm; // tanggal + jam update
          if (effExisting[e.date]) {
            // Tanggal sama → perbarui Tanggal(+jam) & angka (kol 3 Tanggal..7 Total)
            sEff
              .getRange(effExisting[e.date], 3, 1, 5)
              .setValues([[tanggalCell, e.day, a, b, a + b]]);
          } else {
            effAppend.push([tanggalCell, e.day, a, b, a + b]);
          }
        });
        if (effAppend.length) {
          effAppend.sort(function (x, y) {
            return x[0] < y[0] ? 1 : -1;
          }); // tanggal terbaru di atas
          prependUserRows(sEff, partName, partEmail, effAppend);
        }
      }

      // Simpan Suhu & Kelembaban DHT22 — append dedup per user berbasis Timestamp_ms
      if (
        data.action === "syncData" &&
        data.lingkunganData &&
        data.lingkunganData.length > 0
      ) {
        var sLing = getConsolidatedSheet(
          "Lingkungan" + modeBase,
          ["Waktu", "Node", "Suhu (°C)", "Kelembaban (%)", "Timestamp_ms"],
          "#0e7490",
        );
        // Timestamp yang sudah ada UNTUK USER INI (kolom Email=2, Timestamp_ms=7)
        var existingTs = {};
        if (sLing.getLastRow() > 1) {
          var ev = sLing.getRange(2, 1, sLing.getLastRow() - 1, 7).getValues();
          for (var ei = 0; ei < ev.length; ei++) {
            if (
              String(ev[ei][1]).toLowerCase().trim() ===
                String(partEmail).toLowerCase().trim() &&
              ev[ei][6]
            )
              existingTs[String(ev[ei][6])] = true;
          }
        }
        var rLing = data.lingkunganData
          .filter(function (d) {
            return !existingTs[String(d.timestamp)];
          })
          .map(function (d) {
            return [
              fmtWIB(d.timestamp), // waktu WIB eksplisit (perbaikan bug jam)
              d.node,
              d.temp,
              d.humidity,
              d.timestamp,
            ];
          });
        // Terbaru → lama (kolom 5 = timestamp ms), lalu sisipkan di atas (baris 2)
        rLing.sort(function (a, b) {
          return Number(b[4]) - Number(a[4]);
        });
        prependUserRows(sLing, partName, partEmail, rLing);
      }

      // ── Refresh warna header semua sheet yang ada ─────────────────────────
      (function() {
        var colorMap = [
          { re: /^Users$/, cols: 7, color: "#7c3aed" },
          { re: /^Users_DataAsli$|^Users_Demo$/, cols: 6, color: "#7c3aed" },
          { re: /^Log_Login$/, cols: 9, color: "#1e40af" },
          { re: /^Jadwal_Alarm$/, cols: 3, color: "#b45309" },
          { re: /^OTP_Verifikasi$/, cols: 5, color: "#9333ea" },
          { re: /^Logs(_Demo|_DataAsli)$/, cols: 7, color: "#be123c" },
          { re: /^Logs_/, cols: 5, color: "#be123c" },
          { re: /^Status(_Demo|_DataAsli)$/, cols: 8, color: "#047857" },
          { re: /^Status_/, cols: 6, color: "#047857" },
          { re: /^Ringkasan(_Demo|_DataAsli)$/, cols: 4, color: "#4338ca" },
          { re: /^Ringkasan_/, cols: 2, color: "#4338ca" },
          { re: /^[Gg]rafik(_Demo|_DataAsli)$/, cols: 5, color: "#1d4ed8" },
          { re: /^[Gg]rafik_/, cols: 3, color: "#1d4ed8" },
          { re: /^Lingkungan(_Demo|_DataAsli)$/, cols: 7, color: "#0e7490" },
          { re: /^Lingkungan_/, cols: 5, color: "#0e7490" },
          { re: /^RataRataLingkungan(_Demo|_DataAsli)$/, cols: 7, color: "#0f766e" },
          { re: /^RataRataLingkungan_|^RataRata_/, cols: 5, color: "#0f766e" },
          { re: /^Efektivitas_Harian(_Demo|_DataAsli)$/, cols: 7, color: "#9333ea" },
          { re: /^Log_Alarm(_Demo|_DataAsli)$/, cols: 7, color: "#b45309" },
        ];
        sheet.getSheets().forEach(function(s) {
          if (s.getLastRow() < 1) return;
          var n = s.getName();
          for (var ci = 0; ci < colorMap.length; ci++) {
            if (colorMap[ci].re.test(n)) {
              try {
                var curBg = s.getRange(1, 1).getBackground();
                if (curBg !== colorMap[ci].color) styleHeader(s, colorMap[ci].cols, colorMap[ci].color);
              } catch(eS) {}
              break;
            }
          }
        });
      })();

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
        var logCountA = 0, logCountB = 0; // untuk self-heal total
        var logRows = readUserRows("Logs" + modeBase, partEmail);
        for (var i = 0; i < logRows.length; i++) {
          if (logRows[i][0]) {
            var lsrc = String(logRows[i][2] || ""); // Sumber Node
            if (lsrc.indexOf("365") !== -1 || lsrc.indexOf("A") !== -1) logCountA++;
            else if (lsrc.indexOf("395") !== -1 || lsrc.indexOf("B") !== -1) logCountB++;
            ObjectLogs.push({
              id: logRows[i][0],
              timestamp: logRows[i][4] ? logRows[i][4] : Date.now(),
              source: logRows[i][2],
              action: logRows[i][3],
            });
          }
        }

        var statusRows = readUserRows("Status" + modeBase, partEmail);
        for (var i = 0; i < statusRows.length; i++) {
          var nm = statusRows[i][0];
          if (nm && (nm.indexOf("A") !== -1 || nm.indexOf("365") !== -1)) {
            dataA.uv365 = statusRows[i][1];
            dataA.online = statusRows[i][2] === "Online";
            dataA.battery = statusRows[i][3];
            dataA.voltage = statusRows[i][4];
            dataA.led = statusRows[i][5] === "Y";
          }
          if (nm && (nm.indexOf("B") !== -1 || nm.indexOf("395") !== -1)) {
            dataB.uv395 = statusRows[i][1];
            dataB.online = statusRows[i][2] === "Online";
            dataB.battery = statusRows[i][3];
            dataB.voltage = statusRows[i][4];
            dataB.led = statusRows[i][5] === "Y";
          }
        }
        // SELF-HEAL: total tak boleh lebih kecil dari jumlah deteksi tercatat di Logs.
        // Jika Status sempat ke-0 tapi Logs masih ada, total dipulihkan otomatis.
        if (logCountA > (Number(dataA.uv365) || 0)) dataA.uv365 = logCountA;
        if (logCountB > (Number(dataB.uv395) || 0)) dataB.uv395 = logCountB;

        var ObjectChartData = [];
        var chartRows = readUserRows("Grafik" + modeBase, partEmail);
        for (var i = 0; i < chartRows.length; i++) {
          if (chartRows[i][0]) {
            ObjectChartData.push({
              time: chartRows[i][0],
              NodeA: chartRows[i][1] ? chartRows[i][1] : 0,
              NodeB: chartRows[i][2] ? chartRows[i][2] : 0,
            });
          }
        }

        var ObjectSummary = { NodeA: 0, NodeB: 0 };
        var ringRows = readUserRows("Ringkasan" + modeBase, partEmail);
        for (var i = 0; i < ringRows.length; i++) {
          var pr = ringRows[i][0];
          if (pr) {
            if (pr.indexOf("A") !== -1 || pr.indexOf("365") !== -1)
              ObjectSummary.NodeA = ringRows[i][1] ? ringRows[i][1] : 0;
            if (pr.indexOf("B") !== -1 || pr.indexOf("395") !== -1)
              ObjectSummary.NodeB = ringRows[i][1] ? ringRows[i][1] : 0;
          }
        }

        // ── Efektivitas harian (riwayat total per hari) + total HARI INI ──
        var ObjectDailyEffect = [];
        var todayKey = dateKeyWIB(Date.now());
        var ObjectToday = { date: todayKey, NodeA: 0, NodeB: 0 };
        var effRows = readUserRows("Efektivitas_Harian" + modeBase, partEmail);
        for (var i = 0; i < effRows.length; i++) {
          if (!effRows[i][0]) continue; // kolom: 0 Tanggal(+jam),1 Hari,2 A,3 B,4 Total
          var dDate = String(effRows[i][0]).substring(0, 10); // bagian tanggal saja
          var dEnt = {
            date: effRows[i][0], // tampilkan apa adanya (tanggal + jam)
            day: effRows[i][1],
            NodeA: Number(effRows[i][2]) || 0,
            NodeB: Number(effRows[i][3]) || 0,
          };
          ObjectDailyEffect.push(dEnt);
          if (dDate === todayKey) {
            ObjectToday.NodeA = dEnt.NodeA;
            ObjectToday.NodeB = dEnt.NodeB;
          }
        }

        var ObjectLingkungan = [];
        var lingRows = readUserRows("Lingkungan" + modeBase, partEmail);
        for (var i = 0; i < lingRows.length; i++) {
          var ts_f = lingRows[i][4];
          if (ts_f) {
            ObjectLingkungan.push({
              timestamp: Number(ts_f),
              node: lingRows[i][1],
              temp: lingRows[i][2],
              humidity: lingRows[i][3],
            });
          }
        }

        // ── Hitung rata-rata per node ─────────────────────────────────────────
        var aT = [],
          aH = [],
          bT = [],
          bH = [];
        for (var ri = 0; ri < ObjectLingkungan.length; ri++) {
          var rl = ObjectLingkungan[ri];
          if (rl.node === "A") {
            aT.push(rl.temp);
            aH.push(rl.humidity);
          } else if (rl.node === "B") {
            bT.push(rl.temp);
            bH.push(rl.humidity);
          }
        }
        function avgArr(arr) {
          if (!arr.length) return null;
          return (
            Math.round(
              (arr.reduce(function (a, b) {
                return a + b;
              }, 0) /
                arr.length) *
                10,
            ) / 10
          );
        }
        var rataRata = {
          A: { temp: avgArr(aT), hum: avgArr(aH), count: aT.length },
          B: { temp: avgArr(bT), hum: avgArr(bH), count: bT.length },
        };

        // ── Bersihkan kolom "Total Data" lama jika sheet sudah terlanjur punya ────
        var sRataOld = sheet.getSheetByName("RataRataLingkungan" + modeBase);
        if (sRataOld && sRataOld.getLastColumn() >= 8) {
          var lastHdr = sRataOld.getRange(1, sRataOld.getLastColumn()).getValue();
          if (String(lastHdr).indexOf("Total Data") !== -1) {
            sRataOld.deleteColumn(sRataOld.getLastColumn());
          }
        }

        // ── Simpan rata-rata ke sheet konsolidasi RataRataLingkungan (1 baris/user) ────
        var sRata = getConsolidatedSheet(
          "RataRataLingkungan" + modeBase,
          [
            "Waktu Update",
            "Avg Suhu A (°C)",
            "Avg Hum A (%)",
            "Avg Suhu B (°C)",
            "Avg Hum B (%)",
          ],
          "#0f766e",
        );
        deleteUserRows(sRata, partEmail);
        appendUserRows(sRata, partName, partEmail, [
          [
            fmtWIB(Date.now()),
            rataRata.A.temp,
            rataRata.A.hum,
            rataRata.B.temp,
            rataRata.B.hum,
          ],
        ]);

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
              dailyEffect: ObjectDailyEffect,
              todayEffect: ObjectToday,
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
      var usedSheets = [];
      var unusedSheets = [];
      allSheets.forEach(function (s) {
        var name = s.getName();
        if (isProtectedSheet(name)) {
          usedSheets.push(name);
        } else {
          unusedSheets.push({ name: name, rows: s.getLastRow() });
        }
      });
      return ContentService.createTextOutput(
        JSON.stringify({
          status: "success",
          data: { used: usedSheets, unused: unusedSheets },
        }),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "deleteSheets") {
      var toDelete = data.sheetNames || [];
      var deleted = [];
      var failed = [];
      toDelete.forEach(function (name) {
        if (isProtectedSheet(name)) {
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
        JSON.stringify({
          status: "success",
          data: { deleted: deleted, failed: failed },
        }),
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
  var validExact = [
    "Users",
    "Users_Demo",
    "Users_DataAsli",
    "Jadwal_Alarm",
    "Log_Login",
    "OTP_Verifikasi",
    "Logs_Demo",
    "Logs_DataAsli",
    "Status_Demo",
    "Status_DataAsli",
    "Ringkasan_Demo",
    "Ringkasan_DataAsli",
    "Grafik_Demo",
    "Grafik_DataAsli",
    "Lingkungan_Demo",
    "Lingkungan_DataAsli",
    "RataRataLingkungan_Demo",
    "RataRataLingkungan_DataAsli",
    "Efektivitas_Harian_Demo",
    "Efektivitas_Harian_DataAsli",
    "Log_Alarm_Demo",
    "Log_Alarm_DataAsli",
  ];
  var unusedSheets = [];
  var usedSheets = [];
  allSheets.forEach(function (s) {
    var name = s.getName();
    var isUsed = validExact.indexOf(name) !== -1;
    if (isUsed) {
      usedSheets.push(name);
    } else {
      unusedSheets.push({ name: name, rows: s.getLastRow() });
    }
  });
  Logger.log("=== SHEET TERPAKAI (" + usedSheets.length + ") ===");
  usedSheets.forEach(function (n) {
    Logger.log("✅ " + n);
  });
  Logger.log("=== SHEET TIDAK TERPAKAI (" + unusedSheets.length + ") ===");
  if (unusedSheets.length === 0) {
    Logger.log("(Kosong — semua sheet sudah terpakai sistem)");
  } else {
    unusedSheets.forEach(function (s) {
      Logger.log("❌ " + s.name + " | baris: " + s.rows);
    });
  }
  return { used: usedSheets, unused: unusedSheets };
}

// Hapus semua sheet tidak terpakai (dengan konfirmasi dialog di editor)
function deleteUnusedSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = scanUnusedSheets();
  if (result.unused.length === 0) {
    SpreadsheetApp.getUi().alert(
      "Tidak ada sheet yang perlu dihapus. Semua sheet sudah terpakai!",
    );
    return;
  }
  var names = result.unused
    .map(function (s) {
      return "• " + s.name + " (" + s.rows + " baris)";
    })
    .join("\n");
  var response = SpreadsheetApp.getUi().alert(
    "Konfirmasi Hapus Sheet",
    "Sheet berikut akan dihapus permanen:\n\n" + names + "\n\nLanjutkan?",
    SpreadsheetApp.getUi().ButtonSet.YES_NO,
  );
  if (response === SpreadsheetApp.getUi().Button.YES) {
    var count = 0;
    result.unused.forEach(function (s) {
      var sheet = ss.getSheetByName(s.name);
      if (sheet && ss.getSheets().length > 1) {
        ss.deleteSheet(sheet);
        count++;
        Logger.log("Dihapus: " + s.name);
      }
    });
    SpreadsheetApp.getUi().alert(
      "Selesai! " + count + " sheet berhasil dihapus.",
    );
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
