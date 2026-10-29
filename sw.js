// Service Worker: macht die App offline nutzbar, ohne je an einer alten Fassung festzuhalten.
//
// VERSION und DATEIEN setzt scripts/version.mjs (Hash über alle Dateien). Ändert sich
// irgendeine Datei, ändert sich diese Datei – der Browser erkennt beim nächsten Öffnen
// den neuen Worker, der lädt alle Dateien frisch (am HTTP-Cache vorbei), übernimmt sofort
// und räumt alte Caches weg. Die Seite lädt dann einmal neu (src/ui/sw-anmeldung.js).
//
// Anfragen an andere Adressen (api.github.com) fasst der Worker nicht an.

const VERSION = '8ac00c298d';
const CACHE = `gym-log-${VERSION}`;
const DATEIEN = [
  './',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'index.html',
  'manifest.webmanifest',
  'src/logik/bearbeiten.js',
  'src/logik/datenformat.js',
  'src/logik/einheit.js',
  'src/logik/export.js',
  'src/logik/github.js',
  'src/logik/messarten.js',
  'src/logik/programm.js',
  'src/logik/speicher.js',
  'src/logik/sync.js',
  'src/logik/texte.js',
  'src/logik/unterschiede.js',
  'src/logik/vorschlag.js',
  'src/logik/zeit.js',
  'src/ui/ansichten/einheit.js',
  'src/ui/ansichten/einstellungen.js',
  'src/ui/ansichten/konflikt.js',
  'src/ui/ansichten/programm.js',
  'src/ui/ansichten/start.js',
  'src/ui/ansichten/sync-zeile.js',
  'src/ui/ansichten/uebung.js',
  'src/ui/app.js',
  'src/ui/html.js',
  'src/ui/sw-anmeldung.js',
  'src/ui/teile.js',
  'src/version.js',
  'startinhalt/programm.json',
  'styles.css',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(DATEIEN.map((d) => new Request(d, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil((async () => {
    for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (ev) => {
  const url = new URL(ev.request.url);
  if (ev.request.method !== 'GET' || url.origin !== self.location.origin) return;
  ev.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (ev.request.mode === 'navigate') {
      return (await cache.match('index.html')) ?? fetch(ev.request);
    }
    return (await cache.match(ev.request, { ignoreSearch: true })) ?? fetch(ev.request);
  })());
});
