/* SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 Robert Marchese
 */
/* sw.js - offline app shell.
 * Shell files are precached. Open Food Facts lookups are network-first with a
 * cache fallback, so a product you scanned before still resolves offline.
 */
// The version is written out here as a literal, NOT imported from lib.js.
// That is deliberate and load-bearing:
//
//   A browser only installs a new service worker when sw.js itself differs
//   byte-for-byte. Importing the version meant this file never changed between
//   releases, so an installed copy was never told to update -- and the old
//   worker went on serving its cached lib.js, which reported the old version.
//   The value meant to retire the cache was itself inside the cache.
//
// Keep this in sync with APP_VERSION in lib.js; `node bump-version.js <ver>`
// writes both, and test_lib.js fails if they ever drift apart.
var APP_VERSION = "1.0.6";
var CACHE = "foodlog-" + APP_VERSION;
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

  // App shell: network first, cache second. Cache-first would keep handing an
  // installed copy its old HTML/JS forever -- the cache only gets replaced on
  // activate, and activate only runs once a NEW worker installs, which needs
  // fresh files to notice in the first place. Offline still works: any failure
  // falls straight back to the cached copy.
  e.respondWith(
    fetch(e.request).then(function (res) {
      // Only cache real, complete responses from our own origin.
      if (res && res.ok && res.type === "basic") {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (hit) {
        return hit || Response.error();
      });
    })
  );
});
