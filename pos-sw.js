/* ══════════════════════════════════════════
   POS Service Worker  v1.0.0
   HTML  → Network First（永遠取最新版）
   SDK   → Cache First（省流量）
   Fonts → Stale While Revalidate
══════════════════════════════════════════ */
const VER          = 'pos-v1.0.0';
const STATIC_CACHE = `pos-static-${VER}`;
const FONT_CACHE   = `pos-fonts-${VER}`;
const FB_CACHE     = `pos-firebase-${VER}`;
const ALL_CACHES   = [STATIC_CACHE, FONT_CACHE, FB_CACHE];

const PRECACHE = [
  './pos-manifest.json',
  './pos-icons/pos-icon-72.png',
  './pos-icons/pos-icon-96.png',
  './pos-icons/pos-icon-128.png',
  './pos-icons/pos-icon-192.png',
  './pos-icons/pos-icon-512.png',
];

/* ── Install ── */
self.addEventListener('install', e => {
  console.log('[POS-SW] install', VER);
  e.waitUntil(
    caches.open(STATIC_CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

/* ── Activate：清舊快取 ── */
self.addEventListener('activate', e => {
  console.log('[POS-SW] activate', VER);
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !ALL_CACHES.includes(k)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── Fetch ── */
self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') { e.respondWith(fetch(request)); return; }
  const url = new URL(request.url);

  // Firebase RTDB → Network First
  if (url.hostname.includes('firebasedatabase.app') ||
      url.hostname.includes('firebase.googleapis.com')) {
    e.respondWith(networkFirst(request, FB_CACHE, 10000));
    return;
  }
  // Firebase SDK (gstatic) → Cache First
  if (url.hostname === 'www.gstatic.com') {
    e.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
  // Google Fonts CSS → Stale While Revalidate
  if (url.hostname === 'fonts.googleapis.com') {
    e.respondWith(staleWhileRevalidate(request, FONT_CACHE));
    return;
  }
  // Google Fonts 字型 → Cache First
  if (url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }
  // HTML → Network First（確保永遠最新）
  if (url.pathname.endsWith('.html') || url.pathname.endsWith('/') || url.pathname === '/') {
    e.respondWith(networkFirstHTML(request, STATIC_CACHE));
    return;
  }
  // 其他靜態資源 → Cache First
  e.respondWith(cacheFirst(request, STATIC_CACHE));
});

/* ── Network First ── */
async function networkFirst(req, cache, timeout) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    const res = await fetch(req, { signal: ctrl.signal });
    clearTimeout(t);
    if (res.ok) (await caches.open(cache)).put(req, res.clone());
    return res;
  } catch(e) {
    return (await caches.match(req)) ||
      new Response(JSON.stringify({ offline:true }), { status:503,
        headers:{'Content-Type':'application/json'} });
  }
}

/* ── Network First HTML（含離線 fallback）── */
async function networkFirstHTML(req, cache) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(cache)).put(req, res.clone());
    return res;
  } catch(e) {
    const cached = await caches.match(req) ||
                   await caches.match('./POS.html');
    if (cached) return cached;
    return new Response(
      `<!DOCTYPE html><html lang="th"><head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Offline - POS</title>
        <style>body{margin:0;min-height:100vh;display:flex;flex-direction:column;
          align-items:center;justify-content:center;gap:16px;background:#f1f5f9;
          font-family:sans-serif;text-align:center;padding:20px}
          h2{color:#2563eb;margin:0}p{color:#64748b;font-size:14px;margin:0;line-height:1.6}
          button{padding:12px 28px;border:none;border-radius:50px;background:#2563eb;
            color:#fff;font-size:15px;cursor:pointer;margin-top:8px}
        </style></head><body>
        <div style="font-size:52px">📵</div>
        <h2>ไม่มีอินเทอร์เน็ต / 離線中</h2>
        <p>กรุณาเชื่อมต่อเน็ตแล้วลองใหม่<br>請連接網路後重試</p>
        <button onclick="location.reload()">ลองใหม่ / 重試</button>
      </body></html>`,
      { headers:{'Content-Type':'text/html;charset=utf-8'}, status:503 }
    );
  }
}

/* ── Cache First ── */
async function cacheFirst(req, cache) {
  const hit = await caches.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(cache)).put(req, res.clone());
    return res;
  } catch(e) { return new Response('Offline', { status:503 }); }
}

/* ── Stale While Revalidate ── */
async function staleWhileRevalidate(req, cache) {
  const cached = await caches.match(req);
  const update = fetch(req).then(async r => {
    if (r.ok) (await caches.open(cache)).put(req, r.clone());
    return r;
  }).catch(() => cached);
  return cached || update;
}

/* ── Message ── */
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

console.log('[POS-SW] loaded', VER);
