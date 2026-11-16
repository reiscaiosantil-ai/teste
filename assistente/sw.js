/* Lumi — guarda os arquivos do app para abrir mesmo sem internet. */
const CACHE = 'lumi-v4';
const ARQUIVOS = ['./', './index.html', './css/estilo.css', './js/mascote.js', './js/cerebro.js', './js/ia.js', './js/voz-google.js', './js/voz-offline.js', './js/frases-estudio.js', './js/app.js', './icone.svg', './manifest.webmanifest'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // APIs de clima, cotação etc. vão direto para a rede
  // rede primeiro (pega atualizações), cache quando estiver offline
  e.respondWith(fetch(e.request).then((r) => { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); return r; }).catch(() => caches.match(e.request)));
});
