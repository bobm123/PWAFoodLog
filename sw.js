/* SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 Robert Marchese
 */
/* sw.js - offline app shell.
 * Shell files are precached. Open Food Facts lookups are network-first with a
 * cache fallback, so a product you scanned before still resolves offline.
 */
var CACHE = "foodlog-v7";
var SHELL = [
  "./", "./index.html", "./styles.css", "./lib.js", "./store.js", "./app.js",
  "./manifest.webmanifest", "./icon-192.png", "./icon-512.png",
  "./vendor/html5-qrcode.min.js",
  // CDN fallback, only used if the vendored copy is absent.
  "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // addAll fails atomically if any request fails; add individually so a
      // flaky CDN can't block installation of the local shell.
      return Promise.all(SHELL.map(function (u) {
        return c.add(u).catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // Open Food Facts: network first, fall back to whatever we cached.
  // On a total miss we must return a Response -- handing respondWith an
  // undefined value throws a TypeError. Response.error() surfaces as a normal
  // network failure to the page, which then falls back to its IndexedDB
  // product cache and shows a real message.
  if (url.hostname.indexOf("openfoodfacts.org") !== -1) {
    e.respondWith(
      fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return res;
      }).catch(function () {
        return caches.match(e.request).then(function (hit) {
          return hit || Response.error();
        });
      })
    );
    return;
  }

  // Everything else: cache first, network second, and never resolve undefined.
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).catch(function () { return Response.error(); });
    })
  );
});
