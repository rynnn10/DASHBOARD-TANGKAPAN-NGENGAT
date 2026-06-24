// ============================================================
// Backend Google Apps Script — Dashboard Tangkapan Ngengat
// Terakhir diperbarui: Rabu, 24 Juni 2026 20:15 WIB
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
        { p: "RataRataLingkungan", h: ["Waktu Update", "Avg Suhu A (°C)", "Avg Hum A (%)", "Avg Suhu B (°C)", "Avg Hum B (%)", "Total Data"], c: "#0f766e" },
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
        ]);
        styleHeader(sLog, 8, "#1e40af");
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

    // ============================================
    // 4. FITUR LOG, GRAFIK & NOTIFIKASI
    // ============================================
    if (data.action === "syncData" || data.action === "fetchData") {
      // Migrasi sekali dari skema per-email lama → konsolidasi, lalu bersihkan sheet lama
      migrateConsolidatedV2();
      cleanupOldSheetsV2();

      // JIKA INI SINKRONISASI DARI WEB -> SIMPAN KE SHEET KONSOLIDASI (tag per user)
      if (data.action === "syncData" && data.logs && data.logs.length > 0) {
        var sL = getConsolidatedSheet(
          "Logs" + modeBase,
          ["ID", "Waktu", "Sumber Node", "Aksi Deteksi", "TimestampISO"],
          "#be123c",
        );
        deleteUserRows(sL, partEmail);
        var rL = data.logs.map(function (l) {
          return [
            l.id,
            new Date(l.timestamp).toLocaleString("id-ID"),
            l.source,
            l.action,
            l.timestamp,
          ];
        });
        appendUserRows(sL, partName, partEmail, rL);
      }

      // Sinkronisasi status node + ringkasan (tag per user)
      if (data.action === "syncData" && data.nodeA && data.nodeB) {
        var sS = getConsolidatedSheet(
          "Status" + modeBase,
          ["Nama Node", "Total", "Status", "Baterai", "Tegangan", "LED"],
          "#047857",
        );
        deleteUserRows(sS, partEmail);
        appendUserRows(sS, partName, partEmail, [
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

        var sRing = getConsolidatedSheet(
          "Ringkasan" + modeBase,
          ["Parameter", "Nilai"],
          "#4338ca",
        );
        deleteUserRows(sRing, partEmail);
        appendUserRows(sRing, partName, partEmail, [
          ["Node A (365nm)", data.nodeA.uv365],
          ["Node B (395nm)", data.nodeB.uv395],
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
        var rC = data.chartData.map(function (c) {
          return [c.time, c.NodeA, c.NodeB];
        });
        appendUserRows(sC, partName, partEmail, rC);
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
              new Date(d.timestamp).toLocaleString("id-ID"),
              d.node,
              d.temp,
              d.humidity,
              d.timestamp,
            ];
          });
        appendUserRows(sLing, partName, partEmail, rLing);
      }

      // ── Refresh warna header semua sheet yang ada ─────────────────────────
      (function() {
        var colorMap = [
          { re: /^Users$/, cols: 7, color: "#7c3aed" },
          { re: /^Users_DataAsli$|^Users_Demo$/, cols: 6, color: "#7c3aed" },
          { re: /^Log_Login$/, cols: 8, color: "#1e40af" },
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
          { re: /^RataRataLingkungan(_Demo|_DataAsli)$/, cols: 8, color: "#0f766e" },
          { re: /^RataRataLingkungan_|^RataRata_/, cols: 6, color: "#0f766e" },
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
        var logRows = readUserRows("Logs" + modeBase, partEmail);
        for (var i = 0; i < logRows.length; i++) {
          if (logRows[i][0]) {
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

        // ── Simpan rata-rata ke sheet konsolidasi RataRataLingkungan (1 baris/user) ────
        var sRata = getConsolidatedSheet(
          "RataRataLingkungan" + modeBase,
          [
            "Waktu Update",
            "Avg Suhu A (°C)",
            "Avg Hum A (%)",
            "Avg Suhu B (°C)",
            "Avg Hum B (%)",
            "Total Data",
          ],
          "#0f766e",
        );
        deleteUserRows(sRata, partEmail);
        appendUserRows(sRata, partName, partEmail, [
          [
            new Date().toLocaleString("id-ID"),
            rataRata.A.temp,
            rataRata.A.hum,
            rataRata.B.temp,
            rataRata.B.hum,
            ObjectLingkungan.length,
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
