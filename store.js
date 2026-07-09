/* SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 Robert Marchese
 */
/*
 * store.js - IndexedDB persistence + JSON export/import.
 *
 * IndexedDB (not localStorage) because iOS Safari evicts localStorage for
 * sites that go unused, and an installed PWA asking for persistent storage
 * gets much better durability guarantees. All data stays on the device.
 */
(function (root) {
  "use strict";

  var DB_NAME = "foodlog";
  var DB_VERSION = 2;
  var _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (ev) {
        var db = ev.target.result;
        if (!db.objectStoreNames.contains("entries")) {
          var e = db.createObjectStore("entries", { keyPath: "id", autoIncrement: true });
          e.createIndex("date", "date", { unique: false });
        }
        if (!db.objectStoreNames.contains("foods")) {
          db.createObjectStore("foods", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }
        // v2: cache of normalized Open Food Facts products, keyed by the
        // barcode that was queried, so scans resolve with no connection.
        if (!db.objectStoreNames.contains("products")) {
          db.createObjectStore("products", { keyPath: "code" });
        }
      };
      req.onsuccess = function () { _db = req.result; resolve(_db); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function tx(store, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(store, mode);
        var s = t.objectStore(store);
        var out = fn(s);
        t.oncomplete = function () {
          // fn() returns an IDBRequest; unwrap it. Checking `.result !== undefined`
          // would wrongly resolve with the request object on a cache miss, where
          // `result` is legitimately undefined.
          var isReq = out && typeof out === "object" && "result" in out;
          resolve(isReq ? out.result : out);
        };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  function getAll(store) {
    return tx(store, "readonly", function (s) { return s.getAll(); });
  }
  function put(store, value) {
    return tx(store, "readwrite", function (s) { return s.put(value); });
  }
  function del(store, key) {
    return tx(store, "readwrite", function (s) { return s.delete(key); });
  }
  function clear(store) {
    return tx(store, "readwrite", function (s) { return s.clear(); });
  }

  /** Entries for a given YYYY-MM-DD. */
  function entriesForDate(date) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction("entries", "readonly");
        var idx = t.objectStore("entries").index("date");
        var req = idx.getAll(IDBKeyRange.only(date));
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function getSetting(key, fallback) {
    return tx("settings", "readonly", function (s) { return s.get(key); })
      .then(function (r) { return r && r.value !== undefined ? r.value : fallback; });
  }
  function setSetting(key, value) {
    return put("settings", { key: key, value: value });
  }

  /** Look up a cached product by the barcode that was queried. */
  function getCachedProduct(code) {
    return tx("products", "readonly", function (s) { return s.get(String(code)); })
      .then(function (row) { return row ? row.product : null; }, function () { return null; });
  }

  /** Cache a normalized product under the queried barcode. */
  function putCachedProduct(code, product) {
    return put("products", {
      code: String(code), product: product, cachedAt: new Date().toISOString()
    });
  }

  /** Ask the browser not to evict us. Best-effort. */
  function requestPersistence() {
    if (navigator.storage && navigator.storage.persist) {
      return navigator.storage.persist().catch(function () { return false; });
    }
    return Promise.resolve(false);
  }

  function exportAll() {
    // The product cache is deliberately NOT exported: it is a disposable
    // mirror of Open Food Facts, not user data, and would bloat the backup.
    return Promise.all([getAll("entries"), getAll("foods"), getAll("settings")])
      .then(function (r) {
        return {
          format: "foodlog-export",
          version: 1,
          exportedAt: new Date().toISOString(),
          entries: r[0], foods: r[1], settings: r[2]
        };
      });
  }

  /**
   * Import a previously exported blob. `mode` is "merge" (default) or
   * "replace". Entry ids are dropped on merge so they can't collide with
   * rows already in the database.
   */
  function importAll(blob, mode) {
    if (!blob || blob.format !== "foodlog-export") {
      return Promise.reject(new Error("Not a food log export file"));
    }
    var wipe = mode === "replace"
      ? Promise.all([clear("entries"), clear("foods"), clear("settings")])
      : Promise.resolve();

    return wipe.then(function () {
      var jobs = [];
      (blob.entries || []).forEach(function (e) {
        var copy = Object.assign({}, e);
        if (mode !== "replace") delete copy.id;
        jobs.push(put("entries", copy));
      });
      (blob.foods || []).forEach(function (f) { jobs.push(put("foods", f)); });
      (blob.settings || []).forEach(function (s) { jobs.push(put("settings", s)); });
      return Promise.all(jobs);
    }).then(function () {
      return {
        entries: (blob.entries || []).length,
        foods: (blob.foods || []).length
      };
    });
  }

  root.Store = {
    open: open, getAll: getAll, put: put, del: del, clear: clear,
    entriesForDate: entriesForDate,
    getCachedProduct: getCachedProduct, putCachedProduct: putCachedProduct,
    getSetting: getSetting, setSetting: setSetting,
    requestPersistence: requestPersistence,
    exportAll: exportAll, importAll: importAll
  };
})(typeof self !== "undefined" ? self : this);
