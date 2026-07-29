/*
  Service worker de "Mi Pádel" — SOLO para que la app sea instalable
  (icono real en el móvil, pantalla completa) y dé una pantalla mínima
  si un entrenador la abre sin conexión.

  Deliberadamente NO cachea el HTML de forma agresiva: la app se apoya
  en Supabase para datos en vivo (asistencia, alumnos, partidos), así
  que cualquier caché de la página podría mostrar datos viejos. La
  estrategia es "red primero, caché solo como último recurso".

  No hace falta tocar este archivo cuando subís una versión nueva de
  mipadel.html (el ?v=X de siempre sigue funcionando igual). Solo
  cambiad CACHE_NAME si algún día cambiáis manifest.json o los iconos
  y queréis forzar que el móvil descarte la copia vieja.
*/

const CACHE_NAME = 'mipadel-shell-v1';
const STATIC_ASSETS = [
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // no tocar POST/PUT a Supabase ni nada que no sea GET

  // Navegación (abrir/recargar la app): red primero, caché del "shell" solo si falla.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('shell', copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match('shell').then(
            (cached) =>
              cached ||
              new Response(
                '<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:2rem;text-align:center">Sin conexión. Vuelve a intentarlo cuando tengas internet.</body>',
                { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
              )
          )
        )
    );
    return;
  }

  // Assets estáticos propios (iconos, manifest): caché primero, red de respaldo.
  const url = new URL(req.url);
  if (self.location.origin === url.origin && STATIC_ASSETS.some((a) => url.pathname.endsWith(a.replace('./', '')))) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
    return;
  }

  // Todo lo demás (Supabase, vídeos, etc.): tal cual, sin intervenir.
});
