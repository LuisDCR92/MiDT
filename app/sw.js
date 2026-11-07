// Service Worker de MiDT
// Sube el número de versión cada vez que cambies index.html para que los usuarios reciban la actualización.
const CACHE_NAME = 'midt-v8';
const ARCHIVOS_LOCALES = [
  './',
  './index.html',
  './config.js',
  './cloud.js',
  './ui.js',
  './aviso-privacidad.html',
  './manifest.json',
  './icons/icon-32.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];
// Librerías externas que la app necesita (se guardan al primer uso para que funcione sin internet)
const HOSTS_CDN = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(ARCHIVOS_LOCALES.map((u) => cache.add(u).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Páginas (index.html): primero red, así siempre ves la última versión; sin internet, usa la copia guardada
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone();
          const esAviso = url.pathname.includes('aviso-privacidad');
          caches.open(CACHE_NAME).then((c) => c.put(esAviso ? req : './index.html', copia));
          return res;
        })
        .catch(() => url.pathname.includes('aviso-privacidad')
          ? caches.match(req).then((r) => r || caches.match('./index.html'))
          : caches.match('./index.html'))
    );
    return;
  }

  const esLocal = url.origin === self.location.origin;
  const esCDN = HOSTS_CDN.includes(url.hostname);
  if (!esLocal && !esCDN) return; // no tocar WhatsApp ni otras peticiones externas

  // Recursos (iconos, librerías): primero caché, y se actualiza en segundo plano
  event.respondWith(
    caches.match(req).then((cacheado) => {
      const red = fetch(req)
        .then((res) => {
          if (res && (res.status === 200 || res.type === 'opaque')) {
            const copia = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copia));
          }
          return res;
        })
        .catch(() => cacheado);
      return cacheado || red;
    })
  );
});
