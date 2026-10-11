/* ======================================================
   Service Worker — 个人简历 PWA 离线缓存
   策略：
     1) install 时预缓存 核心资源（HTML + manifest）
     2) 同域请求：stale-while-revalidate（缓存先展示，后台更新）
     3) 图片：cache-first（图片不变）
     4) 跨域 CDN：network-first + 超时回退缓存
   ====================================================== */
const VERSION = 'v1.0.1';
const STATIC_CACHE = `static-${VERSION}`;
const IMAGE_CACHE = `image-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json'
];

// 安装：预缓存核心资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// 激活：清理旧版本缓存
self.addEventListener('activate', (event) => {
  const VALID = new Set([STATIC_CACHE, IMAGE_CACHE, RUNTIME_CACHE]);
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => !VALID.has(k)).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// 请求路由
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 图片类：cache-first
  if (req.destination === 'image') {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        if (!res.ok) return res;
        const copy = res.clone();
        caches.open(IMAGE_CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => cached))
    );
    return;
  }

  // 跨域 CDN（jsdelivr 等）：network-first，3s 超时回退缓存
  if (url.origin !== self.location.origin) {
    event.respondWith(
      Promise.race([
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('cdn-timeout')), 3000))
      ]).catch(() => caches.match(req))
    );
    return;
  }

  // 同域 HTML/JS/CSS：stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});
