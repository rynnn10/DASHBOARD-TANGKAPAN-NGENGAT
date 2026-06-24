// Custom Service Worker — notifikasi background & periodic check
// File ini di-import oleh generated Workbox SW via importScripts()
// Terakhir diperbarui: Rabu, 24 Juni 2026 21:12 WIB

var SW_CACHE = 'ngengat-sw-config-v1';

// ── Simpan config dari app ────────────────────────────────────────────────
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'NOTIF_CONFIG') {
    caches.open(SW_CACHE).then(function(cache) {
      cache.put('notif-config', new Response(JSON.stringify(event.data.config), {
        headers: { 'Content-Type': 'application/json' }
      }));
    });
  }
});

// ── Periodic Background Sync (Chrome Android, Edge) ───────────────────────
self.addEventListener('periodicsync', function(event) {
  if (event.tag === 'check-ngengat-update') {
    event.waitUntil(checkUpdates());
  }
});

// ── Klik notifikasi → buka / fokus app ───────────────────────────────────
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        if ('focus' in list[i]) return list[i].focus();
      }
      return clients.openWindow('./');
    })
  );
});

// ── Ambil config tersimpan ────────────────────────────────────────────────
async function getConfig() {
  try {
    var cache = await caches.open(SW_CACHE);
    var res = await cache.match('notif-config');
    if (!res) return null;
    return await res.json();
  } catch (e) { return null; }
}

// ── Cek data terbaru & tampilkan notifikasi jika ada perubahan ────────────
async function checkUpdates() {
  var cfg = await getConfig();
  if (!cfg || !cfg.scriptUrl || !cfg.email) return;

  try {
    var res = await fetch(cfg.scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'fetchData', email: cfg.email, isDemoMode: false }),
    });
    var data = await res.json();
    if (data.status !== 'success') return;

    var newA = Number((data.data && data.data.nodeA && data.data.nodeA.uv365) || 0);
    var newB = Number((data.data && data.data.nodeB && data.data.nodeB.uv365) || 0);
    var prevA = Number(cfg.lastA || 0);
    var prevB = Number(cfg.lastB || 0);
    var diffA = newA - prevA;
    var diffB = newB - prevB;

    var msgs = [];
    if (diffA > 0) msgs.push('Node A: +' + diffA + ' ngengat (total ' + newA + ')');
    if (diffB > 0) msgs.push('Node B: +' + diffB + ' ngengat (total ' + newB + ')');

    if (msgs.length > 0) {
      await self.registration.showNotification('Ngengat Baru Terdeteksi!', {
        body: msgs.join('\n'),
        icon: './192x192.png',
        badge: './192x192.png',
        tag: 'ngengat-catch',
        renotify: true,
      });
    }

    // Baterai rendah
    var battA = Number((data.data && data.data.nodeA && data.data.nodeA.battery) || 0);
    var battB = Number((data.data && data.data.nodeB && data.data.nodeB.battery) || 0);
    if (battA > 0 && battA < 20) {
      await self.registration.showNotification('Baterai Node A Rendah', {
        body: 'Level: ' + battA + '% — segera cas baterai.',
        icon: './192x192.png', tag: 'batt-a',
      });
    }
    if (battB > 0 && battB < 20) {
      await self.registration.showNotification('Baterai Node B Rendah', {
        body: 'Level: ' + battB + '% — segera cas baterai.',
        icon: './192x192.png', tag: 'batt-b',
      });
    }

    // Simpan count terbaru
    cfg.lastA = newA;
    cfg.lastB = newB;
    var cache2 = await caches.open(SW_CACHE);
    await cache2.put('notif-config', new Response(JSON.stringify(cfg), {
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (e) { /* abaikan error jaringan */ }
}
