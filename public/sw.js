/**
 * sw.js — el ayudante que corre junto a la tienda.
 *
 * Hace dos cosas, y ninguna es guardar datos:
 *
 *   1. Su sola existencia es lo que hace que Android ofrezca "Instalar
 *      aplicación" en vez de esconderlo en el menú.
 *   2. Guarda el cascarón de la tienda para que abra al instante en las
 *      visitas siguientes, y para que enseñe algo si el cliente se queda
 *      sin señal a media cuadra.
 *
 * Lo que NO cachea, a propósito: nada que empiece con /api. El menú, los
 * precios y las existencias tienen que salir del servidor siempre. Un
 * precio viejo servido desde el teléfono es peor que un error de red.
 */

const VERSION = 'moramango-v1';
const ESENCIALES = ['/', '/icon-192x192.png', '/icon-512x512.png', '/logo.png'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(VERSION)
      // addAll falla entero si un archivo falla; de uno en uno, lo que se
      // pueda guardar se guarda y la instalación no se cae por una imagen.
      .then((cache) => Promise.allSettled(ESENCIALES.map((u) => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(nombres.filter((n) => n !== VERSION).map((n) => caches.delete(n)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET') return;

  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return;
  // El menú, los precios y el inventario siempre del servidor
  if (url.pathname.startsWith('/api/')) return;

  /**
   * Primero la red, y el caché como respaldo.
   *
   * Al revés —caché primero— la tienda abriría más rápido pero podría
   * mostrar el menú de ayer sin avisar. Así solo se recurre a la copia
   * cuando de verdad no hay conexión.
   */
  evento.respondWith(
    fetch(peticion)
      .then((respuesta) => {
        if (respuesta && respuesta.status === 200 && respuesta.type === 'basic') {
          const copia = respuesta.clone();
          caches.open(VERSION).then((cache) => cache.put(peticion, copia));
        }
        return respuesta;
      })
      .catch(() =>
        caches.match(peticion).then((guardada) => guardada || caches.match('/'))
      )
  );
});
