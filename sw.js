const CACHE = 'joey-v9';
const ASSETS = ['/painel.html', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;

  // Só GET. POST/PUT (signInAnonymously, writes do Firestore) passam direto.
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // NÃO intercepta cross-origin: Firebase/Google (identitytoolkit, securetoken,
  // *.googleapis.com, firestore.googleapis.com, *.gstatic.com, firebaseio, etc.)
  // vão DIRETO pra rede. O SW não pode mexer na autenticação nem no canal do Firestore.
  if (url.origin !== self.location.origin) return;

  // NÃO intercepta o App Garçom — sempre fresco da rede, sem SW/cache.
  if (url.pathname === '/garcom' || url.pathname === '/garcom.html') return;

  // Same-origin (painel etc.): network-first; em falha cai no cache; se não houver
  // cache, devolve um Response 503 VÁLIDO (nunca undefined — corrige o
  // "Failed to convert value to 'Response'").
  e.respondWith(
    fetch(req).catch(() =>
      caches.match(req).then(r => r || new Response('Offline', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      }))
    )
  );
});
