// Green House PWA Service Worker
const CACHE_NAME = 'greenhouse-pwa-v2';
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        }),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  let url;
  try {
    url = new URL(event.request.url);
  } catch {
    return;
  }

  // Chỉ can thiệp các request cùng origin (same-origin), bỏ qua cross-origin (Goong, Render, unpkg...)
  if (url.origin !== self.location.origin) return;

  // Bỏ qua các API requests, uploads và websocket
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/socket.io/') ||
    url.pathname.startsWith('/uploads/')
  ) {
    return;
  }

  // Luôn đảm bảo event.respondWith trả về một Response hợp lệ, không bao giờ undefined hoặc rejected
  event.respondWith(
    fetch(event.request)
      .then(response => {
        return response;
      })
      .catch(async () => {
        try {
          const cached = await caches.match(event.request);
          if (cached) return cached;

          // Nếu là navigation request (HTML trang như /job-detail/...), trả về shell SPA '/'
          if (event.request.mode === 'navigate' || event.request.destination === 'document') {
            const rootShell = await caches.match('/');
            if (rootShell) return rootShell;
          }
        } catch {}

        // Trả về Response fallback hợp lệ thay vì throw hoặc undefined
        return new Response(
          event.request.mode === 'navigate'
            ? '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Green House</title></head><body style="font-family:sans-serif;text-align:center;padding:40px;background:#f8fafc;"><div style="max-width:400px;margin:0 auto;background:#fff;padding:24px;border-radius:16px;box-shadow:0 4px 12px rgba(0,0,0,0.08);"><h3 style="color:#1f2937;margin-bottom:8px;">Kết nối mạng không ổn định</h3><p style="color:#6b7280;font-size:14px;line-height:20px;">Vui lòng kiểm tra lại kết nối Internet của thiết bị để tiếp tục.</p><button onclick="location.reload()" style="margin-top:16px;padding:10px 24px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;">Tải lại trang</button></div></body></html>'
            : '',
          {
            status: 503,
            statusText: 'Service Unavailable',
            headers: {
              'Content-Type':
                event.request.mode === 'navigate' ? 'text/html; charset=utf-8' : 'text/plain',
            },
          },
        );
      }),
  );
});
