/* SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 Robert Marchese
 */
/* app.js - UI wiring. Pure logic lives in lib.js, persistence in store.js. */
(function () {
  "use strict";
  var L = self.FoodLib, S = self.Store;
  var $ = function (id) { return document.getElementById(id); };
  var scanner = null;
  var currentProduct = null;
  var carbTarget = null;
  var calorieTarget = null, fatTarget = null, proteinTarget = null;
  var waterGoal = 64;   // fl oz; L.WATER_GOAL_DEFAULT
  var lastCode = null;                 // for the Retry button
  var LOOKUP_TIMEOUT_MS = 8000;        // bad wireless shouldn't hang forever
  var currentMeal = null;              // meal selected in the add sheet
  var lastSearchResults = [];          // rendered search hits, by index
  var editingEntryId = null;           // entry with the inline editor open
  var historyRange = 14;               // 14 or 30 days

  function nowMeal() { return L.guessMeal(new Date().getHours()); }

  /**
   * fetch() has no timeout of its own: on a weak signal it can hang until the
   * OS gives up, which can be minutes. AbortController bounds it.
   */
  function fetchJson(url) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, LOOKUP_TIMEOUT_MS);
    return fetch(url, ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(
        function (j) { clearTimeout(timer); return j; },
        function (e) { clearTimeout(timer); throw e; }
      );
  }

  var lookupDeps = {
    fetchJson: fetchJson,
    getCached: function (code) { return S.getCachedProduct(code); },
    putCached: function (code, p) { return S.putCachedProduct(code, p); },
    isOnline: function () { return navigator.onLine !== false; }
  };

  var searchDeps = {
    fetchJson: fetchJson,
    isOnline: function () { return navigator.onLine !== false; },
    // Offline / failed-network fallback: whatever matches on the device.
    getLocal: function (q) {
      return Promise.all([S.getAll("foods"), S.getAllCachedProducts()])
        .then(function (r) {
          return L.searchLocal(q, r[0], r[1]).map(function (hit) {
            var p = hit.item;
            p._localKind = hit.kind;   // "food" | "cached", for the badge
            return p;
          });
        });
    }
  };

  // ------------------------------------------------- bundled seed database
  var seedInfo = null;          // {version, count} once known
  var searchIndex = null;       // lazily built in-memory name index

  /** NDJSON text (one OFF-`product` per line) -> normalized products. */
  function parseSeedNdjson(text) {
    var out = [];
    text.split("\n").forEach(function (line) {
      line = line.trim();
      if (!line) return;
      try {
        var raw = JSON.parse(line);
        var p = L.normalizeProduct({ status: 1, code: raw.code, product: raw });
        if (p && p.code) out.push(p);
      } catch (e) { /* skip a malformed line, keep the rest */ }
    });
    return out;
  }

  /** Fetch + gunzip the seed file into normalized products. */
  function fetchSeed(file) {
    return fetch("seed/" + file).then(function (resp) {
      if (!resp.ok) throw new Error("seed HTTP " + resp.status);
      if (typeof DecompressionStream !== "undefined" && resp.body) {
        var s = resp.body.pipeThrough(new DecompressionStream("gzip"));
        return new Response(s).text().then(parseSeedNdjson);
      }
      // Old browser without DecompressionStream: skip the seed rather than
      // feed gzipped bytes to JSON.parse. Live search still works.
      return [];
    });
  }

  /**
   * Import the bundled food database on first launch (and whenever its version
   * changes). Best-effort: any failure just leaves the app running on live
   * Open Food Facts. Won't re-import a version already loaded.
   */
  function ensureSeed() {
    return fetch("seed/seed-meta.json")
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (meta) {
        if (!meta) return;
        return S.getSetting("seedVersion", null).then(function (cur) {
          seedInfo = { version: meta.version, count: meta.count, loaded: cur === meta.version };
          if (cur === meta.version) return;   // already have this version
          status($("searchStatus"), "Loading food database…");
          return fetchSeed(meta.file).then(function (products) {
            if (!products.length) return;
            return S.importProducts(products).then(function () {
              return S.setSetting("seedVersion", meta.version);
            }).then(function () {
              seedInfo.loaded = true;
              searchIndex = null;             // include the new rows
              status($("searchStatus"), "");
              refreshSeedLine();
            });
          });
        });
      })
      .catch(function () { /* seed is optional */ });
  }

  function buildSearchIndex() {
    return S.getAllCachedProducts().then(function (list) {
      searchIndex = list.map(function (p) {
        return { p: p, hay: ((p.name || "") + " " + (p.brand || "")).toLowerCase() };
      });
      return searchIndex;
    });
  }

  /** Instant substring search over the on-device corpus (seed + your scans). */
  function localSearchProducts(q) {
    q = String(q || "").trim().toLowerCase();
    var idxP = searchIndex ? Promise.resolve(searchIndex) : buildSearchIndex();
    return idxP.then(function (idx) {
      var out = [];
      for (var i = 0; i < idx.length && out.length < 50; i++) {
        if (idx[i].hay.indexOf(q) !== -1) out.push(idx[i].p);
      }
      return out;
    });
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
           "-" + String(d.getDate()).padStart(2, "0");
  }
  var viewDate = today();

  function fmt(n, d) { return (Math.round(n * Math.pow(10, d || 0)) / Math.pow(10, d || 0)).toFixed(d || 0); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function status(el, msg, kind) {
    el.textContent = msg;
    el.className = "status" + (kind ? " " + kind : "");
  }

  /** Persistent banner so the user is never surprised by a failed lookup. */
  function refreshOnlineBanner() {
    var off = navigator.onLine === false;
    $("offlineBanner").classList.toggle("hidden", !off);
    $("btnScan").disabled = false; // scanning still works; only lookup needs net
  }

  // ---------------------------------------------------------------- badges
  function novaBadge(nova) {
    if (!nova) return "";
    var info = L.NOVA_LABELS[nova] || { label: "NOVA " + nova, blurb: "" };
    return '<span class="badge nova' + nova + '" title="' + esc(info.blurb) + '">NOVA ' +
           nova + " &middot; " + esc(info.label) + "</span>";
  }
  function flagBadges(flags) {
    return (flags || []).map(function (f) {
      return '<span class="badge ' + f.severity + '">' + esc(f.label) + "</span>";
    }).join("");
  }
  function flagWarnBox(flags) {
    var high = (flags || []).filter(function (f) { return f.severity === "high"; });
    if (!high.length) return "";
    return '<div class="warnbox"><h3>High-glycemic ingredients</h3>' +
      high.map(function (f) {
        return '<p class="flagnote"><b>' + esc(f.label) + "</b> &mdash; " + esc(f.note) + "</p>";
      }).join("") + "</div>";
  }

  // ---------------------------------------------------------------- totals
  /** Fill one macro goal bar + its "/ target" caption from consumed vs target. */
  function setGoalBar(barId, tgtId, consumed, target, unit) {
    var prog = L.macroProgress(consumed, target);
    var bar = $(barId), tgt = $(tgtId);
    if (bar) {
      bar.style.width = prog.hasTarget ? prog.pct + "%" : "0%";
      bar.classList.toggle("over", prog.over);
    }
    if (tgt) tgt.textContent = prog.hasTarget ? " / " + fmt(target, 0) + (unit || "") : "";
  }

  function renderTotals(entries) {
    var t = L.dailyTotals(entries);
    $("tNetCarb").textContent = fmt(t.netCarb, 1);
    $("tFat").textContent = fmt(t.fat, 0);
    $("tProtein").textContent = fmt(t.protein, 0);
    $("tKcal").textContent = fmt(t.kcal, 0);

    // Goal-aware macro bars (fill only when a target is set).
    setGoalBar("barKcal", "tgtKcal", t.kcal, calorieTarget, "");
    setGoalBar("barFat", "tgtFat", t.fat, fatTarget, " g");
    setGoalBar("barProtein", "tgtProtein", t.protein, proteinTarget, " g");

    // Net-carb ring: fill = consumed/budget; green under, red over.
    var ring = $("carbRing"), unit = $("carbUnit");
    if (carbTarget) {
      var over = t.netCarb > carbTarget;
      var pct = Math.max(0, Math.min(100, t.netCarb / carbTarget * 100));
      var col = over ? "var(--red)" : "var(--green)";
      if (ring) ring.style.background =
        "conic-gradient(" + col + " " + pct + "%, var(--ring-track) 0)";
      $("tNetCarb").classList.toggle("over", over);
      if (unit) unit.textContent = over
        ? fmt(t.netCarb - carbTarget, 1) + " g over"
        : fmt(carbTarget - t.netCarb, 1) + " g left";
    } else {
      if (ring) ring.style.background =
        "conic-gradient(var(--green) " + (t.count ? 100 : 0) + "%, var(--ring-track) 0)";
      $("tNetCarb").classList.remove("over");
      if (unit) unit.textContent = "g net carbs";
    }

    $("splitLabel").textContent = t.count
      ? "fat " + fmt(t.split.fat, 0) + "% · carbs " + fmt(t.split.carb, 0) +
        "% · protein " + fmt(t.split.protein, 0) + "% of calories"
      : "";
  }

  // -------------------------------------------------------------- hydration
  function renderWater() {
    return S.getWater(viewDate).then(function (oz) {
      $("waterOz").textContent = fmt(oz, 0);
      $("waterGoalLbl").textContent = fmt(waterGoal, 0);
      var pct = waterGoal > 0 ? Math.min(100, oz / waterGoal * 100) : 0;
      $("barWater").style.width = pct + "%";
    });
  }
  function addWater(delta) {
    return S.getWater(viewDate).then(function (oz) {
      return S.setWater(viewDate, L.addOz(oz, delta)).then(renderWater);
    });
  }

  // ----------------------------------------------------------------- today
  function renderEntry(e) {
    var m = e.macros;
    var kcal = (m.kcal != null) ? m.kcal : L.estimateKcal(m);
    var editing = editingEntryId === e.id;
    return '<div class="item">' +
      '<div class="top"><span class="nm">' + esc(e.name) + "</span>" +
      '<span class="sub">' + fmt(m.grams, 0) + " g</span></div>" +
      (e.brand ? '<div class="sub">' + esc(e.brand) + "</div>" : "") +
      '<div class="macros">net carbs <b>' + fmt(m.netCarb, 1) + " g</b> &middot; fat <b>" +
        fmt(m.fat, 1) + " g</b> &middot; protein <b>" + fmt(m.protein, 1) +
        " g</b> &middot; <b>" + fmt(kcal, 0) + "</b> kcal</div>" +
      '<div class="badges">' + novaBadge(e.nova) + flagBadges(e.flags) + "</div>" +
      (editing
        ? '<div class="editrow">' +
            '<input id="editGrams" type="number" step="any" value="' + fmt(m.grams, 0) +
              '" aria-label="New amount in grams">' +
            '<select id="editMeal" aria-label="Meal">' + mealOptions(e.meal) + "</select>" +
            '<button class="primary tiny" data-saveedit="' + e.id + '">Save</button>' +
            '<button class="ghost tiny" data-canceledit="1">Cancel</button>' +
          "</div>"
        : '<div class="acts">' +
            '<button class="ghost tiny" data-edit="' + e.id + '">Edit</button>' +
            '<button class="ghost tiny" data-again="' + e.id + '">Log again</button>' +
            '<button class="ghost tiny" data-del="' + e.id + '">Remove</button>' +
          "</div>") +
      "</div>";
  }

  function mealOptions(selected) {
    return L.MEALS.map(function (m) {
      return '<option value="' + m + '"' + (m === selected ? " selected" : "") + ">" +
        esc(L.MEAL_LABELS[m]) + "</option>";
    }).join("");
  }

  function renderToday() {
    return S.entriesForDate(viewDate).then(function (entries) {
      var groups = L.groupByMeal(entries);
      $("entryList").innerHTML = groups.map(function (g) {
        var showHead = !(groups.length === 1 && g.meal === "other");
        var addBtn = g.meal !== "other"
          ? '<button class="meal-add" data-mealadd="' + g.meal +
            '" aria-label="Add to ' + esc(g.label) + '">+</button>'
          : "";
        return (showHead
          ? '<div class="mealhead"><span class="mh-left"><b>' + esc(g.label) + "</b>" + addBtn +
            '</span><span class="sub">' +
            fmt(g.totals.netCarb, 1) + " g net &middot; " + fmt(g.totals.kcal, 0) + " kcal</span></div>"
          : "") + g.entries.map(renderEntry).join("");
      }).join("");
      $("todayEmpty").classList.toggle("hidden", entries.length > 0);
      renderTotals(entries);
      renderWater();
    });
  }

  function startEditEntry(id) {
    editingEntryId = id;
    renderToday();
  }

  function saveEditEntry(id) {
    var g = parseFloat($("editGrams").value);
    var meal = $("editMeal").value;
    return S.entriesForDate(viewDate).then(function (entries) {
      var e = entries.filter(function (x) { return x.id === id; })[0];
      if (!e) { editingEntryId = null; return renderToday(); }
      var scaled = L.scaleMacros(e.macros, g);
      if (scaled) e.macros = scaled;      // bad grams -> keep old amounts
      e.meal = meal;
      return S.put("entries", e).then(function () {
        editingEntryId = null;
        return renderToday();
      });
    });
  }

  /** Re-log a past entry as a fresh row on the day being viewed. */
  function logAgain(id) {
    return S.entriesForDate(viewDate).then(function (entries) {
      var e = entries.filter(function (x) { return x.id === id; })[0];
      if (!e) return;
      return addRawEntry(e.name, e.macros, {
        brand: e.brand, code: e.code, nova: e.nova, flags: e.flags,
        meal: nowMeal()
      });
    });
  }

  // ------------------------------------------------------------ product UI
  function renderProduct(p, stale) {
    currentProduct = p;
    var serving = p.servingGrams || 100;
    $("productCard").innerHTML =
      '<div class="card">' +
      (stale ? '<p class="stale">Saved copy - not refreshed from Open Food Facts.</p>' : "") +
      '<div class="prod">' +
        (p.image ? '<img src="' + esc(p.image) + '" alt="">' : "") +
        '<div><div class="nm"><b>' + esc(p.name) + "</b></div>" +
        (p.brand ? '<div class="sub">' + esc(p.brand) + "</div>" : "") +
        '<div class="badges">' + novaBadge(p.nova) + flagBadges(p.flags) + "</div></div>" +
      "</div>" +
      '<div class="macros" style="margin-top:.6rem">Per 100 g: net carbs <b>' +
        fmt(L.netCarbs(p.per100.carb, p.per100.fiber), 1) + " g</b> &middot; fat <b>" +
        fmt(p.per100.fat, 1) + " g</b> &middot; protein <b>" + fmt(p.per100.protein, 1) + " g</b></div>" +
      (p.additives.length ? '<p class="hint">Additives: ' + esc(p.additives.join(", ")) + "</p>" : "") +
      flagWarnBox(p.flags) +
      (L.hasNutrition(p) ? "" :
        '<div class="nofacts">' +
          '<h3>No nutrition data on this record</h3>' +
          '<p class="flagnote">This barcode\'s entry has no nutrition table, so the zeros above ' +
            'aren\'t real - logging it would count as 0. Copy the numbers off the package label ' +
            '(if the label truly says 0, you can ignore this).</p>' +
          '<button id="btnFixNutrition" class="primary tiny" style="margin-top:.4rem">Add nutrition from the label</button>' +
          '<div id="fixForm" class="hidden" style="margin-top:.6rem">' +
            '<div class="grid2">' +
              '<label>Serving size (g)<input id="fxGrams" type="number" step="any" value="' + serving + '"></label>' +
              '<label>Calories (blank = auto)<input id="fxKcal" type="number" step="any"></label>' +
              '<label>Fat (g)<input id="fxFat" type="number" step="any"></label>' +
              '<label>Total carbs (g)<input id="fxCarb" type="number" step="any"></label>' +
              '<label>Fiber (g)<input id="fxFiber" type="number" step="any"></label>' +
              '<label>Protein (g)<input id="fxProtein" type="number" step="any"></label>' +
            "</div>" +
            '<p class="hint">Amounts for <em>one serving</em> as printed on the label.</p>' +
            '<button id="btnApplyFix" class="primary tiny">Save nutrition</button>' +
            '<p class="status" id="fixStatus"></p>' +
          "</div>" +
        "</div>") +
      '<div class="row" style="margin-top:.7rem">' +
        '<input id="portion" type="number" step="any" value="' + serving + '" aria-label="Portion in grams">' +
        '<select id="portionMeal" aria-label="Meal">' + mealOptions(currentMeal || nowMeal()) + "</select>" +
      "</div>" +
      '<div class="row" style="margin-top:.5rem">' +
        '<button id="btnAddEntry" class="primary" style="flex:1">Add to ' +
          (viewDate === today() ? "today" : esc(viewDate)) + "</button>" +
        '<button id="btnSaveProduct" class="ghost" style="flex:1">Save product</button>' +
      "</div>" +
      '<p class="hint">Portion in grams' + (p.servingSize ? " (label serving: " + esc(p.servingSize) + ")" : "") +
        ". Save product keeps it in your Foods for quick re-logging.</p>" +
      "</div>";

    $("btnAddEntry").addEventListener("click", function () {
      var g = parseFloat($("portion").value);
      if (!(g > 0)) return;
      addEntry(p, g, $("portionMeal").value);
    });
    $("btnSaveProduct").addEventListener("click", function () { saveProduct(p); });
    if (!L.hasNutrition(p)) {
      $("btnFixNutrition").addEventListener("click", function () {
        $("fixForm").classList.toggle("hidden");
        $("fxCarb").focus();
      });
      $("btnApplyFix").addEventListener("click", function () { applyNutritionFix(p); });
    }
  }

  /**
   * Apply label values typed by the user to a nutrition-less record. The
   * corrected copy replaces the cached one for that barcode, so every future
   * scan (and offline search) uses the user's numbers, and any saved food for
   * the product is updated too.
   */
  function applyNutritionFix(p) {
    var corrected = L.productWithNutrition(p, parseFloat($("fxGrams").value), {
      kcal: $("fxKcal").value.trim(),
      fat: parseFloat($("fxFat").value) || 0,
      carb: parseFloat($("fxCarb").value) || 0,
      fiber: parseFloat($("fxFiber").value) || 0,
      protein: parseFloat($("fxProtein").value) || 0
    });
    if (!corrected) {
      status($("fixStatus"), "Enter the serving size in grams.", "err");
      return;
    }
    var jobs = [];
    if (corrected.code) {
      jobs.push(S.putCachedProduct(corrected.code, corrected));
      jobs.push(S.removePending(corrected.code));   // no longer needs enrichment
      // If this product was saved to Foods (as itself or an offline stub),
      // carry the corrected numbers over.
      jobs.push(S.getAll("foods").then(function (foods) {
        var id = "product:" + corrected.code;
        var existing = foods.filter(function (f) { return f.id === id; })[0];
        return existing ? S.put("foods", L.foodFromProduct(corrected)) : null;
      }));
    }
    return Promise.all(jobs).then(function () {
      searchIndex = null;                       // corrected copy joins search
      renderProduct(corrected, false);
      status($("scanStatus"), "Nutrition saved for " + corrected.name +
        ". Future scans of this barcode use your numbers.", "ok");
      renderFoods();
      updateDbLine();
    });
  }

  /** Save a scanned/looked-up product to the frequently-purchased list. */
  function saveProduct(p) {
    if (!p) return;
    return S.getAll("foods").then(function (foods) {
      var food = L.foodFromProduct(p);
      var existed = foods.some(function (f) { return f.id === food.id; });
      return S.put("foods", food).then(function () {
        status($("scanStatus"), (existed ? "Updated " : "Saved ") + p.name + " in your Foods.", "ok");
        renderFoods();
      });
    });
  }

  /** Write an already-computed macro block straight into the diary. */
  function addRawEntry(name, macros, extra) {
    var entry = Object.assign({
      date: viewDate, name: name, brand: "", code: "",
      nova: null, flags: [], macros: macros,
      meal: currentMeal || nowMeal(),
      loggedAt: new Date().toISOString()
    }, extra || {});
    return S.put("entries", entry).then(renderToday);
  }

  function addEntry(p, grams, meal) {
    var entry = {
      date: viewDate,
      name: p.name,
      brand: p.brand || "",
      code: p.code || "",
      nova: p.nova || null,
      flags: p.flags || [],
      macros: L.macrosForGrams(p.per100, grams),
      meal: meal || currentMeal || nowMeal(),
      loggedAt: new Date().toISOString()
    };
    return S.put("entries", entry).then(function () {
      $("productCard").innerHTML = "";
      status($("scanStatus"), "Added " + p.name + ".", "ok");
      showTab("today");
      return renderToday();
    });
  }

  // -------------------------------------------------------------- barcode
  /** Cache/seed hit for any barcode variant, or null. Never touches network. */
  function localBarcode(code) {
    var variants = L.barcodeVariants(code);
    return (function tryNext(i) {
      if (i >= variants.length) return Promise.resolve(null);
      return S.getCachedProduct(variants[i]).then(function (p) {
        return p || tryNext(i + 1);
      }, function () { return tryNext(i + 1); });
    })(0);
  }

  function lookup(code) {
    code = String(code || "").trim();
    if (!/^\d{6,14}$/.test(code)) {
      status($("scanStatus"), "That doesn't look like a barcode.", "err");
      return;
    }
    lastCode = code;
    $("productCard").innerHTML = "";
    $("btnLookup").disabled = true;

    // Local-first: a bundled/seen product resolves instantly with no network
    // call, which is the whole point of the on-device database. Only reach out
    // to Open Food Facts when we don't already have it.
    localBarcode(code).then(function (localP) {
      if (localP) {
        $("btnLookup").disabled = false;
        status($("scanStatus"), "", "");
        renderProduct(localP, false);
        return;
      }
      status($("scanStatus"), navigator.onLine === false
        ? "Offline - checking saved products…"
        : "Looking up " + code + "…");
      return L.lookupProduct(lookupDeps, code).then(function (r) {
        $("btnLookup").disabled = false;
        if (r.product) {
          status($("scanStatus"), r.stale ? r.message : "", r.stale ? "warn" : "");
          renderProduct(r.product, r.stale);
          return;
        }
        // No product. If this was a connectivity failure (not a genuine
        // "unknown to OFF"), remember the barcode so we can fill it in later.
        if (r.error !== L.ERR.NOT_FOUND) S.addPending(code);
        status($("scanStatus"), r.message, "err");
        renderFallback(code, r.error);
      });
    });
  }

  /** When a lookup can't produce a product, keep the user moving. */
  function renderFallback(code, err) {
    var retryable = err !== L.ERR.NOT_FOUND;   // offline/timeout/network vs unknown
    $("productCard").innerHTML =
      '<div class="card">' +
        "<h2>Couldn't load " + esc(code) + "</h2>" +
        '<p class="hint">' + esc(L.ERR_MESSAGE[err] || "Lookup failed.") + "</p>" +
        '<div class="row">' +
          (retryable ? '<button id="btnSaveLater" class="primary">Save for later</button>' : "") +
          (retryable ? '<button id="btnRetry" class="ghost">Retry</button>' : "") +
          '<button id="btnManual" class="' + (retryable ? "ghost" : "primary") + '">Enter it by hand</button>' +
        "</div>" +
        (retryable
          ? '<p class="hint">At the store with bad signal? <b>Save for later</b> keeps the barcode; its nutrition fills in automatically once you\'re back online.</p>'
          : '<p class="hint">Logging, custom foods and totals all keep working offline.</p>') +
      "</div>";

    if (retryable) {
      $("btnSaveLater").addEventListener("click", function () { saveBarcodeForLater(code); });
      $("btnRetry").addEventListener("click", function () { lookup(code); });
    }
    $("btnManual").addEventListener("click", function () {
      showTab("foods");
      $("cfName").value = "";
      $("cfBarcode").value = code;      // carry the barcode across
      $("cfName").focus();
    });
  }

  /**
   * Offline capture: save a placeholder product for this barcode and queue it
   * for enrichment. The reconciler fills in real nutrition once online.
   */
  function saveBarcodeForLater(code) {
    return Promise.all([
      S.put("foods", L.pendingProductFood(code)),
      S.addPending(code)
    ]).then(function () {
      status($("scanStatus"),
        "Saved barcode " + code + " to your Foods. Nutrition will fill in when you're back online.", "ok");
      $("productCard").innerHTML = "";
      renderFoods();
      updateDbLine();
    });
  }

  function startScan() {
    if (typeof Html5Qrcode === "undefined") {
      status($("scanStatus"),
        "Camera scanner didn't load (offline on first run?). Type the barcode below - everything else still works.",
        "err");
      return;
    }
    var reader = $("reader");
    reader.classList.remove("hidden");
    $("btnScan").classList.add("hidden");
    $("btnStopScan").classList.remove("hidden");
    scanner = new Html5Qrcode("reader", {
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A, Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODE_128
      ]
    });
    scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 260, height: 160 } },
      function (text) { stopScan(); lookup(text); },
      function () {}
    ).catch(function (e) {
      status($("scanStatus"), "Camera unavailable (" + e + "). Use manual entry.", "err");
      stopScan();
    });
  }

  function stopScan() {
    $("btnScan").classList.remove("hidden");
    $("btnStopScan").classList.add("hidden");
    $("reader").classList.add("hidden");
    if (scanner) {
      scanner.stop().then(function () { scanner.clear(); scanner = null; }).catch(function () { scanner = null; });
    }
  }

  // ---------------------------------------------------------------- search
  function renderSearchResults(products) {
    lastSearchResults = products;
    $("searchResults").innerHTML = products.map(function (p, i) {
      var nc = L.netCarbs(p.per100.carb, p.per100.fiber);
      var note = p._online ? "Open Food Facts" : "";
      return '<div class="item" data-result="' + i + '" role="button" tabindex="0">' +
        '<div class="top"><span class="nm">' + esc(p.name) + "</span>" +
          (note ? '<span class="srcnote">' + note + "</span>" : "") + "</div>" +
        (p.brand ? '<div class="sub">' + esc(p.brand) + "</div>" : "") +
        '<div class="macros">per 100 g: net carbs <b>' + fmt(nc, 1) + " g</b>" +
          (p.per100.kcal ? " &middot; <b>" + fmt(p.per100.kcal, 0) + "</b> kcal" : "") + "</div>" +
        '<div class="badges">' + novaBadge(p.nova) + flagBadges(p.flags) + "</div>" +
      "</div>";
    }).join("");
  }

  /** Local-first: search the on-device database instantly, no API call. */
  function doSearch() {
    var q = $("searchQuery").value.trim();
    if (q.length < 2) { status($("searchStatus"), "Type at least two characters.", "err"); return; }
    status($("searchStatus"), "Searching your food database…");
    localSearchProducts(q).then(function (local) {
      renderSearchResults(local);
      var n = local.length;
      status($("searchStatus"),
        n ? (n + (n >= 50 ? "+" : "") + " match" + (n === 1 ? "" : "es") + " on this device."
           + (navigator.onLine !== false ? " Not it? Search Open Food Facts below." : ""))
          : (navigator.onLine !== false
              ? "Nothing on this device matched. Try Open Food Facts below."
              : "Nothing on this device matched, and you're offline."), "");
      // The online search is the ONLY thing that hits the rate-limited API, and
      // only when the user asks for it -- so normal use never touches it.
      $("btnSearchOnline").classList.toggle("hidden", navigator.onLine === false);
      $("btnSearchOnline").textContent = n ? "Also search Open Food Facts" : "Search Open Food Facts online";
    });
  }

  function doOnlineSearch() {
    var q = $("searchQuery").value.trim();
    if (q.length < 2) return;
    $("btnSearchOnline").disabled = true;
    status($("searchStatus"), "Searching Open Food Facts…");
    L.searchProducts(searchDeps, q).then(function (r) {
      $("btnSearchOnline").disabled = false;
      var byCode = {};
      lastSearchResults.forEach(function (p) { if (p.code) byCode[p.code] = true; });
      var merged = lastSearchResults.slice();
      (r.products || []).forEach(function (p) {
        if (p.code && byCode[p.code]) return;
        if (p.code) byCode[p.code] = true;
        p._online = true;
        merged.push(p);
      });
      renderSearchResults(merged);
      var added = merged.length - lastSearchResults.length;
      status($("searchStatus"),
        r.message || (added + " more from Open Food Facts."), r.error ? "warn" : "");
    });
  }

  function pickSearchResult(i) {
    var p = lastSearchResults[i];
    if (!p) return;
    // Cache a live Open Food Facts hit so it resolves instantly (and offline)
    // next time. Local/seed hits are already in the cache.
    if (p._online && p.code) S.putCachedProduct(p.code, p);
    renderProduct(p, false);
    $("productCard").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // --------------------------------------------------------------- history
  /**
   * Minimal single-series bar chart as an SVG string. One axis; thin bars
   * with a gap; rounded value ends; recessive gridlines; the budget as a
   * dashed reference line (position carries over/under -- the red fill is
   * redundant, not the only encoding); full-height tap targets with a
   * hover tooltip per day.
   */
  function barChart(days, opts) {
    var W = 360, H = 150, padL = 34, padR = 8, padT = 14, padB = 20;
    var iw = W - padL - padR, ih = H - padT - padB;
    var n = days.length;
    var vals = days.map(opts.value);
    var max = Math.max.apply(null, vals.concat(opts.target || 0, 1)) * 1.1;
    var y = function (v) { return padT + ih - (v / max) * ih; };
    var slot = iw / n;
    var barW = Math.max(2, slot - 2);
    var MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    var DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    function fmtDay(dstr) {
      var d = new Date(dstr + "T12:00:00Z");
      return DOW[d.getUTCDay()] + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCDate();
    }
    var parts = [];
    [max / 1.1, max / 2.2].forEach(function (v) {
      parts.push('<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y(v) + '" y2="' + y(v) +
        '" stroke="var(--line)" stroke-width="1"/>' +
        '<text x="' + (padL - 4) + '" y="' + (y(v) + 3) + '" text-anchor="end" class="axis">' +
        Math.round(v) + "</text>");
    });
    parts.push('<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + (padT + ih) +
      '" y2="' + (padT + ih) + '" stroke="var(--line)"/>');
    var step = Math.ceil(n / 7);
    days.forEach(function (d, i) {
      var v = vals[i];
      var x = padL + i * slot + (slot - barW) / 2;
      var over = opts.target && v > opts.target;
      var fill = over ? "var(--red)" : (opts.color || "var(--green)");
      if (v > 0) {
        parts.push('<rect x="' + x + '" y="' + y(v) + '" width="' + barW + '" height="' +
          Math.max(1, padT + ih - y(v)) + '" rx="2" fill="' + fill + '"/>');
      }
      var title = fmtDay(d.date) + " - " +
        (d.totals.count ? fmt(v, opts.decimals) + " " + opts.unit : "nothing logged");
      parts.push('<rect class="bar" data-day="' + d.date + '" x="' + (padL + i * slot) +
        '" y="' + padT + '" width="' + slot + '" height="' + ih +
        '" fill="transparent"><title>' + esc(title) + "</title></rect>");
      if (i % step === 0) {
        parts.push('<text x="' + (padL + i * slot + slot / 2) + '" y="' + (H - 6) +
          '" text-anchor="middle" class="axis">' + Number(d.date.slice(8)) + "</text>");
      }
    });
    if (opts.target) {
      parts.push('<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y(opts.target) +
        '" y2="' + y(opts.target) +
        '" stroke="var(--fg)" stroke-dasharray="4 3" stroke-width="1" opacity=".7"/>' +
        '<text x="' + (W - padR) + '" y="' + (y(opts.target) - 4) +
        '" text-anchor="end" class="axis">goal ' + opts.target + (opts.targetUnit || "") + "</text>");
    }
    return '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' +
      esc(opts.unit + " per day, last " + n + " days") + '">' + parts.join("") + "</svg>";
  }

  function histStat(v, label) {
    return '<div class="tot"><span class="tval">' + v + '</span><span class="tlab">' +
      label + "</span></div>";
  }

  function renderHistory() {
    var dates = L.dateRange(today(), historyRange);
    return S.entriesForRange(dates[0], dates[dates.length - 1]).then(function (entries) {
      var days = L.historyDays(entries, dates);
      var streak = L.streakUnderBudget(days, carbTarget);
      $("streakLine").textContent = carbTarget
        ? (streak > 0
            ? streak + (streak === 1 ? " day" : " days") + " in a row at or under " + carbTarget + " g."
            : "No current under-budget streak (target " + carbTarget + " g).")
        : "Set a net-carb budget in Settings to see a target line and streak.";
      $("carbChart").innerHTML = barChart(days, {
        value: function (d) { return d.totals.netCarb; },
        unit: "g net carbs", decimals: 1, target: carbTarget || null, targetUnit: " g"
      });
      $("kcalChart").innerHTML = barChart(days, {
        value: function (d) { return d.totals.kcal; },
        unit: "kcal", decimals: 0, target: calorieTarget || null, color: "var(--prot)"
      });
      var logged = days.filter(function (d) { return d.totals.count > 0; });
      function avg(f) {
        if (!logged.length) return 0;
        return logged.reduce(function (s, d) { return s + f(d.totals); }, 0) / logged.length;
      }
      $("histStats").innerHTML =
        histStat(fmt(avg(function (t) { return t.netCarb; }), 1) + " g", "avg net carbs") +
        histStat(fmt(avg(function (t) { return t.kcal; }), 0), "avg kcal") +
        histStat(logged.length + "/" + days.length, "days logged") +
        histStat(carbTarget ? String(streak) : "&mdash;", "day streak under budget");
    });
  }

  // ---------------------------------------------------------------- foods
  function renderFoods() {
    return S.getAll("foods").then(function (foods) {
      $("foodsEmpty").classList.toggle("hidden", foods.length > 0);
      $("foodList").innerHTML = foods.map(function (f) {
        var m = L.macrosForGrams(f.per100, f.servingGrams);
        return '<div class="item">' +
          '<div class="top"><span class="nm">' + esc(f.name) +
            (f.pending ? ' <span class="srcnote">awaiting nutrition</span>' : "") + "</span>" +
            '<span class="sub">' + esc(f.servingLabel || fmt(f.servingGrams, 0) + " g") + "</span></div>" +
          (f.pending
            ? '<div class="macros">Barcode ' + esc(f.code) + " saved. Nutrition fills in when you're back online.</div>"
            : '<div class="macros">per serving: net carbs <b>' + fmt(m.netCarb, 1) +
              " g</b> &middot; fat <b>" + fmt(m.fat, 1) + " g</b> &middot; protein <b>" +
              fmt(m.protein, 1) + " g</b></div>") +
          '<div class="badges">' + novaBadge(f.nova) + flagBadges(f.flags) + "</div>" +
          '<div class="acts">' +
            (f.pending ? "" : '<button class="primary tiny" data-log="' + esc(f.id) + '">Log a serving</button>') +
            '<button class="ghost tiny" data-delfood="' + esc(f.id) + '">Delete</button>' +
          "</div>" +
        "</div>";
      }).join("");
    });
  }

  function saveManualFood() {
    var name = $("cfName").value.trim();
    var g = parseFloat($("cfGrams").value);
    var barcode = $("cfBarcode").value.trim();
    if (!name || !(g > 0)) { alert("Give the food a name and a serving weight in grams."); return; }
    var fat = parseFloat($("cfFat").value) || 0,
        carb = parseFloat($("cfCarb").value) || 0,
        fiber = parseFloat($("cfFiber").value) || 0,
        prot = parseFloat($("cfProtein").value) || 0;
    var k = 100 / g;
    var food = {
      id: "food:" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ":" + Date.now(),
      type: "food", name: name, brand: "Custom", code: barcode || "",
      servingGrams: g, servingLabel: "1 serving (" + fmt(g, 0) + " g)",
      per100: { fat: fat * k, carb: carb * k, fiber: fiber * k, protein: prot * k, sugars: 0,
                kcal: (fat * 9 + Math.max(0, carb - fiber) * 4 + prot * 4) * k },
      nova: null, additives: [], ingredientsText: "", flags: []
    };
    var jobs = [S.put("foods", food)];
    // If it came from a barcode we couldn't resolve, cache it under that code
    // so a future scan of the same item resolves instantly, even offline.
    if (barcode) {
      jobs.push(S.putCachedProduct(barcode, {
        code: barcode, name: name, brand: "Custom (entered by hand)", image: "",
        per100: food.per100, servingSize: "", servingGrams: g,
        nova: null, additives: [], ingredientsText: "", flags: []
      }));
    }
    Promise.all(jobs).then(function () {
      ["cfName", "cfGrams", "cfFat", "cfCarb", "cfFiber", "cfProtein", "cfBarcode"]
        .forEach(function (i) { $(i).value = ""; });
      status($("foodStatus"), barcode
        ? "Saved. Scanning " + barcode + " will now find it, even offline."
        : "Saved.", "ok");
      renderFoods();
    });
  }

  function importRecipe() {
    var raw = $("recipeJson").value.trim();
    if (!raw) return;
    var parsed;
    try { parsed = JSON.parse(raw); }
    catch (e) { status($("importStatus"), "That isn't valid JSON.", "err"); return; }
    var food;
    try { food = L.recipeFromAnalyzerJson(parsed); }
    catch (e) { status($("importStatus"), e.message, "err"); return; }
    food.id = food.id + ":" + Date.now();
    S.put("foods", food).then(function () {
      $("recipeJson").value = "";
      status($("importStatus"), "Imported “" + food.name + "”.", "ok");
      renderFoods();
    });
  }

  function logFood(id) {
    S.getAll("foods").then(function (foods) {
      var f = foods.filter(function (x) { return x.id === id; })[0];
      if (f) addEntry(f, f.servingGrams);
    });
  }

  // ------------------------------------------------ pending enrichment queue
  var RECONCILE_GAP_MS = 400;   // gentle spacing under the 15/min product limit
  var RECONCILE_MAX = 15;       // process at most this many per run
  var reconciling = false;

  /**
   * Fill in barcodes that were scanned while offline/unreachable, once we're
   * back online. On a real network hit lookupProduct() also refreshes the
   * cache, so we just drop the code from the queue. A genuine "unknown to OFF"
   * is dropped too (retrying won't help). Never touches the user's own foods
   * or logged entries.
   */
  function reconcilePending() {
    if (reconciling || navigator.onLine === false) return Promise.resolve(0);
    reconciling = true;
    return S.getAllPending().then(function (list) {
      list = (list || []).slice(0, RECONCILE_MAX);
      var filled = 0, i = 0;
      function step() {
        if (i >= list.length) return Promise.resolve();
        if (navigator.onLine === false) return Promise.resolve();
        var row = list[i++];
        return L.lookupProduct(lookupDeps, row.code).then(function (r) {
          if (r.product && r.source === "network") {
            filled++;
            searchIndex = null;                 // new product joins search
            return fillSavedProduct(r.product).then(function () {
              return S.removePending(row.code);
            });
          }
          if (r.error === L.ERR.NOT_FOUND) return S.removePending(row.code);
          return S.bumpPending(row.code);       // still unreachable; try later
        }).then(function () {
          return new Promise(function (res) { setTimeout(res, RECONCILE_GAP_MS); });
        }).then(step);
      }
      return step().then(function () { return filled; });
    }).then(function (filled) {
      reconciling = false;
      if (filled) {
        status($("scanStatus"),
          filled + " scanned item" + (filled === 1 ? "" : "s") + " filled in from Open Food Facts.", "ok");
        renderFoods();   // saved placeholders may now have real nutrition
      }
      updateDbLine();
      return filled;
    }, function () { reconciling = false; return 0; });
  }

  /** If a resolved product was saved as a pending placeholder, fill it in. */
  function fillSavedProduct(product) {
    if (!product || !product.code) return Promise.resolve();
    var id = "product:" + product.code;
    return S.getAll("foods").then(function (foods) {
      var existing = foods.filter(function (f) { return f.id === id; })[0];
      // Only replace a stub awaiting fill-in; never a food the user curated.
      if (existing && existing.pending) return S.put("foods", L.foodFromProduct(product));
      return null;
    }, function () { return null; });
  }

  // ------------------------------------------------ offline-database status
  function updateDbLine() {
    var el = $("dbLine");
    if (!el) return;
    Promise.all([S.countProducts(), S.getAllPending()]).then(function (r) {
      var count = r[0], pending = (r[1] || []).length;
      var ver = seedInfo ? seedInfo.version : "";
      var parts = [];
      parts.push(count.toLocaleString() + " products on this device" + (ver ? " (seed " + esc(ver) + ")" : ""));
      if (pending) parts.push(pending + " scan" + (pending === 1 ? "" : "s") + " waiting to be filled in when online");
      el.innerHTML = parts.join(". ") + ".";
    });
  }
  function refreshSeedLine() { updateDbLine(); }

  // -------------------------------------------------------------- settings
  // Each target is a settings key; blank means "no goal, just track it".
  var TARGETS = [
    { key: "carbTarget", input: "setCarbTarget", set: function (n) { carbTarget = n; } },
    { key: "calorieTarget", input: "setKcal", set: function (n) { calorieTarget = n; } },
    { key: "fatTarget", input: "setFat", set: function (n) { fatTarget = n; } },
    { key: "proteinTarget", input: "setProtein", set: function (n) { proteinTarget = n; } }
  ];

  function loadSettings() {
    var jobs = TARGETS.map(function (tg) {
      return S.getSetting(tg.key, null).then(function (v) {
        var n = (v === null || v === "" || v === undefined) ? null : Number(v);
        tg.set(n);
        var el = $(tg.input);
        if (el) el.value = n || "";
      });
    });
    jobs.push(S.getSetting("waterGoal", L.WATER_GOAL_DEFAULT).then(function (v) {
      waterGoal = (v > 0) ? Number(v) : L.WATER_GOAL_DEFAULT;
      var el = $("setWater");
      if (el) el.value = waterGoal;
    }));
    return Promise.all(jobs);
  }

  function saveSettings() {
    // Validate all fields first (blank or positive), then persist.
    var vals = {};
    for (var i = 0; i < TARGETS.length; i++) {
      var raw = $(TARGETS[i].input).value.trim();
      if (raw !== "" && !(Number(raw) > 0)) {
        status($("settingsStatus"), "Enter positive numbers, or leave a field blank.", "err");
        return;
      }
      vals[TARGETS[i].key] = raw === "" ? null : Number(raw);
    }
    var wraw = $("setWater").value.trim();
    if (wraw !== "" && !(Number(wraw) > 0)) {
      status($("settingsStatus"), "Enter a positive water goal, or leave it blank.", "err");
      return;
    }
    var wGoal = wraw === "" ? L.WATER_GOAL_DEFAULT : Number(wraw);

    var jobs = TARGETS.map(function (tg) {
      tg.set(vals[tg.key]);
      return S.setSetting(tg.key, vals[tg.key]);
    });
    waterGoal = wGoal;
    jobs.push(S.setSetting("waterGoal", wGoal));

    Promise.all(jobs).then(function () {
      status($("settingsStatus"), "Targets saved.", "ok");
      renderToday();
    });
  }

  function doExport() {
    S.exportAll().then(function (blob) {
      var a = document.createElement("a");
      var url = URL.createObjectURL(new Blob([JSON.stringify(blob, null, 2)], { type: "application/json" }));
      a.href = url;
      a.download = "foodlog-" + today() + ".json";
      a.click();
      URL.revokeObjectURL(url);
      status($("dataStatus"), "Exported " + blob.entries.length + " entries, " + blob.foods.length + " foods.", "ok");
    });
  }

  function doImport(file) {
    var fr = new FileReader();
    fr.onload = function () {
      var blob;
      try { blob = JSON.parse(fr.result); }
      catch (e) { status($("dataStatus"), "Not valid JSON.", "err"); return; }
      S.importAll(blob, "merge").then(function (r) {
        status($("dataStatus"), "Imported " + r.entries + " entries and " + r.foods + " foods.", "ok");
        renderToday(); renderFoods();
      }).catch(function (e) { status($("dataStatus"), e.message, "err"); });
    };
    fr.readAsText(file);
  }

  // ----------------------------------------------------------- add sheet
  var recentItems = [];

  function setSheetMeal(meal) {
    currentMeal = meal;
    document.querySelectorAll("#mealSeg .seg-btn").forEach(function (b) {
      b.classList.toggle("active", b.dataset.meal === meal);
    });
  }

  /** One-tap re-log list: distinct items from the last two weeks. */
  function renderRecents() {
    var dates = L.dateRange(today(), 14);
    S.entriesForRange(dates[0], dates[dates.length - 1]).then(function (entries) {
      recentItems = L.recentFoods(entries, 6);
      $("recentWrap").classList.toggle("hidden", recentItems.length === 0);
      $("recentList").innerHTML = recentItems.map(function (f, i) {
        var m = f.macros;
        return '<div class="item">' +
          '<div class="top"><span class="nm">' + esc(f.name) + "</span>" +
            '<span class="sub">' + fmt(m.grams, 0) + " g</span></div>" +
          '<div class="macros">net carbs <b>' + fmt(m.netCarb, 1) + " g</b> &middot; fat <b>" +
            fmt(m.fat, 1) + " g</b> &middot; protein <b>" + fmt(m.protein, 1) + " g</b></div>" +
          '<div class="acts"><button class="primary tiny" data-recent="' + i + '">Log</button></div>' +
        "</div>";
      }).join("");
    });
  }

  function openSheet(presetMeal) {
    $("sheetDate").textContent = viewDate === today() ? "today" : viewDate;
    $("addSheet").classList.remove("hidden");
    $("sheetBackdrop").classList.remove("hidden");
    // always reopen in the collapsed state
    $("savedPicker").classList.add("hidden");
    $("quickForm").classList.add("hidden");
    status($("quickStatus"), "", "");
    setSheetMeal(L.MEAL_LABELS[presetMeal] ? presetMeal : nowMeal());
    renderRecents();
  }

  function closeSheet() {
    $("addSheet").classList.add("hidden");
    $("sheetBackdrop").classList.add("hidden");
  }

  /** Saved foods, rendered inside the sheet so you never leave the diary. */
  function showSavedPicker() {
    $("quickForm").classList.add("hidden");
    $("savedPicker").classList.remove("hidden");
    S.getAll("foods").then(function (foods) {
      $("savedPickerEmpty").classList.toggle("hidden", foods.length > 0);
      $("savedPickerList").innerHTML = foods.map(function (f) {
        var m = L.macrosForGrams(f.per100, f.servingGrams);
        return '<div class="item">' +
          '<div class="top"><span class="nm">' + esc(f.name) + "</span>" +
            '<span class="sub">' + esc(f.servingLabel || fmt(f.servingGrams, 0) + " g") + "</span></div>" +
          '<div class="macros">net carbs <b>' + fmt(m.netCarb, 1) + " g</b> &middot; fat <b>" +
            fmt(m.fat, 1) + " g</b> &middot; protein <b>" + fmt(m.protein, 1) + " g</b></div>" +
          '<div class="acts"><button class="primary tiny" data-sheetlog="' + esc(f.id) +
            '">Log a serving</button></div>' +
        "</div>";
      }).join("");
    });
  }

  function showQuickForm() {
    $("savedPicker").classList.add("hidden");
    $("quickForm").classList.remove("hidden");
    $("qName").focus();
  }

  function submitQuickAdd() {
    var name = $("qName").value.trim();
    var g = parseFloat($("qGrams").value);
    if (!name) { status($("quickStatus"), "Give it a name.", "err"); return; }
    if (!(g > 0)) { status($("quickStatus"), "Enter the amount in grams.", "err"); return; }

    var macros = L.quickEntryMacros(g, {
      fat: parseFloat($("qFat").value) || 0,
      carb: parseFloat($("qCarb").value) || 0,
      fiber: parseFloat($("qFiber").value) || 0,
      protein: parseFloat($("qProtein").value) || 0
    });
    addRawEntry(name, macros, { brand: "Quick add" }).then(function () {
      ["qName", "qGrams", "qFat", "qCarb", "qFiber", "qProtein"]
        .forEach(function (i) { $(i).value = ""; });
      closeSheet();
    });
  }

  // ------------------------------------------------------------------ tabs
  function showTab(name) {
    document.querySelectorAll(".tab").forEach(function (t) {
      t.classList.toggle("active", t.dataset.tab === name);
    });
    document.querySelectorAll(".panel").forEach(function (p) {
      p.classList.toggle("active", p.id === "panel-" + name);
    });
    // The + only makes sense on the diary.
    $("fabAdd").classList.toggle("hidden", name !== "today");
    if (name !== "scan" && scanner) stopScan();
    if (name === "history") renderHistory();
  }

  // ------------------------------------------------------------------ init
  function init() {
    $("dayPicker").value = viewDate;
    $("dayPicker").addEventListener("change", function (e) {
      viewDate = e.target.value || today();
      editingEntryId = null;
      renderToday();
    });
    document.querySelectorAll(".tab").forEach(function (t) {
      t.addEventListener("click", function () { showTab(t.dataset.tab); });
    });
    $("btnScan").addEventListener("click", startScan);
    $("btnStopScan").addEventListener("click", stopScan);
    $("btnLookup").addEventListener("click", function () { lookup($("manualCode").value); });
    $("manualCode").addEventListener("keydown", function (e) { if (e.key === "Enter") lookup($("manualCode").value); });
    $("btnAddFood").addEventListener("click", saveManualFood);

    $("fabAdd").addEventListener("click", openSheet);
    $("btnEmptyAdd").addEventListener("click", openSheet);
    $("btnCloseSheet").addEventListener("click", closeSheet);
    $("sheetBackdrop").addEventListener("click", closeSheet);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeSheet();
    });
    $("actScan").addEventListener("click", function () { closeSheet(); showTab("scan"); });
    $("actSaved").addEventListener("click", showSavedPicker);
    $("actQuick").addEventListener("click", showQuickForm);
    $("actSearch").addEventListener("click", function () {
      closeSheet(); showTab("scan"); $("searchQuery").focus();
    });
    document.querySelectorAll("#mealSeg .seg-btn").forEach(function (b) {
      b.addEventListener("click", function () { setSheetMeal(b.dataset.meal); });
    });

    $("btnSearch").addEventListener("click", doSearch);
    $("btnSearchOnline").addEventListener("click", doOnlineSearch);
    $("searchQuery").addEventListener("keydown", function (e) { if (e.key === "Enter") doSearch(); });
    $("searchResults").addEventListener("click", function (e) {
      var it = e.target.closest && e.target.closest("[data-result]");
      if (it) pickSearchResult(Number(it.dataset.result));
    });

    document.querySelectorAll("#panel-history .seg-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        historyRange = Number(b.dataset.range) || 14;
        document.querySelectorAll("#panel-history .seg-btn").forEach(function (x) {
          x.classList.toggle("active", x === b);
        });
        renderHistory();
      });
    });
    ["carbChart", "kcalChart"].forEach(function (id) {
      $(id).addEventListener("click", function (e) {
        var r = e.target.closest && e.target.closest("[data-day]");
        if (!r) return;
        viewDate = r.getAttribute("data-day");
        $("dayPicker").value = viewDate;
        editingEntryId = null;
        showTab("today");
        renderToday();
      });
    });
    $("btnQuickAdd").addEventListener("click", submitQuickAdd);
    $("btnImportRecipe").addEventListener("click", importRecipe);
    $("btnSaveSettings").addEventListener("click", saveSettings);
    $("btnExport").addEventListener("click", doExport);
    $("fileImport").addEventListener("change", function (e) { if (e.target.files[0]) doImport(e.target.files[0]); });

    // delegated row actions
    document.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("button");
      if (!b) return;
      if (b.dataset.del) S.del("entries", Number(b.dataset.del)).then(renderToday);
      else if (b.dataset.delfood) S.del("foods", b.dataset.delfood).then(renderFoods);
      else if (b.dataset.log) logFood(b.dataset.log);
      else if (b.dataset.sheetlog) { closeSheet(); logFood(b.dataset.sheetlog); }
      else if (b.dataset.edit) startEditEntry(Number(b.dataset.edit));
      else if (b.dataset.saveedit) saveEditEntry(Number(b.dataset.saveedit));
      else if (b.dataset.canceledit) { editingEntryId = null; renderToday(); }
      else if (b.dataset.again) logAgain(Number(b.dataset.again));
      else if (b.dataset.mealadd) openSheet(b.dataset.mealadd);
      else if (b.dataset.water) addWater(Number(b.dataset.water));
      else if (b.dataset.recent !== undefined) {
        var f = recentItems[Number(b.dataset.recent)];
        if (f) {
          addRawEntry(f.name, f.macros, {
            brand: f.brand, code: f.code, nova: f.nova, flags: f.flags,
            meal: currentMeal || nowMeal()
          });
          closeSheet();
        }
      }
    });

    window.addEventListener("online", function () {
      refreshOnlineBanner();
      reconcilePending();          // fill in anything scanned while offline
    });
    window.addEventListener("offline", refreshOnlineBanner);
    refreshOnlineBanner();

    S.requestPersistence();
    loadSettings().then(renderToday).then(renderFoods);

    // Load the bundled food database, then reconcile any pending scans and
    // show the on-device database status. All best-effort and non-blocking.
    ensureSeed()
      .then(function () { updateDbLine(); return reconcilePending(); })
      .catch(function () {});

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
