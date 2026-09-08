/**
 * Service Worker: macht das Spiel offline spielbar.
 *
 * Zwei Strategien:
 *  - Seite selbst: erst Netz, bei Fehler aus dem Zwischenspeicher. So kommen
 *    Aktualisierungen an, ohne dass man den Speicher leeren muss.
 *  - Alles andere (Skript, Stile, Modelle, Texturen, Icons): erst Zwischen-
 *    speicher, sonst Netz und dann ablegen. Nach dem ersten Match ist alles da.
 *
 * VERSION bei jeder Veröffentlichung hochzählen, damit alte Stände weichen.
 */
const VERSION = '__VERSION__';
const CACHE = `crash-corps-${VERSION}`;
const SHELL = ['./', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
// Vom Build eingetragen: Skript, Stile, Modelle, Texturen
const ASSETS = __ASSETS__;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // Einzeln, damit ein fehlendes Teil nicht die ganze Installation kippt
    await Promise.allSettled(SHELL.map((u) => c.add(u)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
    warmUp();                       // Modelle im Hintergrund holen
  })());
});

/**
 * Die großen Dateien nachladen, nachdem die Seite schon läuft. Im Install-
 * Schritt wären es acht Megabyte, bevor überhaupt etwas zu sehen ist.
 */
async function warmUp() {
  const c = await caches.open(CACHE);
  let fertig = 0;
  for (const url of ASSETS) {
    if (!(await c.match(url))) {
      try { await c.add(url); } catch { /* einzelne Fehlschläge sind kein Grund aufzugeben */ }
    }
    fertig++;
    if (fertig % 8 === 0 || fertig === ASSETS.length) melde(fertig / ASSETS.length);
  }
}

async function melde(anteil) {
  for (const client of await self.clients.matchAll()) {
    client.postMessage({ typ: 'offline-fortschritt', anteil });
  }
}

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;

  if (request.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const net = await fetch(request);
        (await caches.open(CACHE)).put('./index.html', net.clone());
        return net;
      } catch {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const hit = await caches.match(request);
    if (hit) return hit;
    const net = await fetch(request);
    if (net.ok) (await caches.open(CACHE)).put(request, net.clone());
    return net;
  })());
});
