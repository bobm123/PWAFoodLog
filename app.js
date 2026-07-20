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
  function renderTotals(entries) {
    var t = L.dailyTotals(entries);
    $("tNetCarb").textContent = fmt(t.netCarb, 1);
    $("tFat").textContent = fmt(t.fat, 0);
    $("tProtein").textContent = fmt(t.protein, 0);
    $("tKcal").textContent = fmt(t.kcal, 0);

    var bar = $("splitBar");
    bar.querySelector(".sfat").style.width = t.split.fat + "%";
    bar.querySelector(".scarb").style.width = t.split.carb + "%";
    bar.querySelector(".sprot").style.width = t.split.protein + "%";

    var lbl = "fat " + fmt(t.split.fat, 0) + "% · carbs " + fmt(t.split.carb, 0) +
              "% · protein " + fmt(t.split.protein, 0) + "%";
    if (carbTarget) {
      var over = t.netCarb > carbTarget;
      $("tNetCarb").classList.toggle("over", over);
      lbl += "  —  " + fmt(t.netCarb, 1) + " / " + carbTarget + " g net carbs" +
             (over ? " (over budget)" : "");
    } else {
      $("tNetCarb").classList.remove("over");
    }
    $("splitLabel").textContent = t.count ? lbl : "";
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
        return (showHead
          ? '<div class="mealhead"><b>' + esc(g.label) + "</b><span class=\"sub\">" +
            fmt(g.totals.netCarb, 1) + " g net &middot; " + fmt(g.totals.kcal, 0) + " kcal</span></div>"
          : "") + g.entries.map(renderEntry).join("");
      }).join("");
      $("todayEmpty").classList.toggle("hidden", entries.length > 0);
      renderTotals(entries);
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
      '<div class="row" style="margin-top:.7rem">' +
        '<input id="portion" type="number" step="any" value="' + serving + '" aria-label="Portion in grams">' +
        '<select id="portionMeal" aria-label="Meal">' + mealOptions(currentMeal || nowMeal()) + "</select>" +
        '<button id="btnAddEntry" class="primary">Add to ' +
          (viewDate === today() ? "today" : esc(viewDate)) + "</button>" +
      "</div>" +
      '<p class="hint">Portion in grams' + (p.servingSize ? " (label serving: " + esc(p.servingSize) + ")" : "") + "</p>" +
      "</div>";

    $("btnAddEntry").addEventListener("click", function () {
      var g = parseFloat($("portion").value);
      if (!(g > 0)) return;
      addEntry(p, g, $("portionMeal").value);
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
  function lookup(code) {
    code = String(code || "").trim();
    if (!/^\d{6,14}$/.test(code)) {
      status($("scanStatus"), "That doesn't look like a barcode.", "err");
      return;
    }
    lastCode = code;
    $("productCard").innerHTML = "";
    $("btnLookup").disabled = true;
    status($("scanStatus"), navigator.onLine === false
      ? "Offline - checking saved products…"
      : "Looking up " + code + "…");

    L.lookupProduct(lookupDeps, code).then(function (r) {
      $("btnLookup").disabled = false;

      if (r.product) {
        // Usable result, possibly from the on-device cache.
        status($("scanStatus"), r.stale ? r.message : "", r.stale ? "warn" : "");
        renderProduct(r.product, r.stale);
        return;
      }
      // No product: explain precisely why, and offer the manual path.
      status($("scanStatus"), r.message, "err");
      renderFallback(code, r.error);
    });
  }

  /** When a lookup can't produce a product, keep the user moving. */
  function renderFallback(code, err) {
    var retryable = err !== L.ERR.NOT_FOUND;
    $("productCard").innerHTML =
      '<div class="card">' +
        "<h2>Couldn't load " + esc(code) + "</h2>" +
        '<p class="hint">' + esc(L.ERR_MESSAGE[err] || "Lookup failed.") + "</p>" +
        '<div class="row">' +
          (retryable ? '<button id="btnRetry" class="ghost">Retry</button>' : "") +
          '<button id="btnManual" class="primary">Enter it by hand</button>' +
        "</div>" +
        '<p class="hint">Logging, custom foods and totals all keep working offline.</p>' +
      "</div>";

    if (retryable) $("btnRetry").addEventListener("click", function () { lookup(code); });
    $("btnManual").addEventListener("click", function () {
      showTab("foods");
      $("cfName").value = "";
      $("cfBarcode").value = code;      // carry the barcode across
      $("cfName").focus();
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
  function doSearch() {
    var q = $("searchQuery").value.trim();
    if (q.length < 2) { status($("searchStatus"), "Type at least two characters.", "err"); return; }
    $("btnSearch").disabled = true;
    $("searchResults").innerHTML = "";
    status($("searchStatus"), navigator.onLine === false
      ? "Offline - searching foods saved on this device…"
      : "Searching…");
    L.searchProducts(searchDeps, q).then(function (r) {
      $("btnSearch").disabled = false;
      lastSearchResults = r.products;
      status($("searchStatus"), r.message || "", r.error ? "warn" : "");
      $("searchResults").innerHTML = r.products.map(function (p, i) {
        var nc = L.netCarbs(p.per100.carb, p.per100.fiber);
        var srcNote = p._localKind === "food" ? "saved food"
                    : p._localKind === "cached" ? "scanned before" : "";
        return '<div class="item" data-result="' + i + '" role="button" tabindex="0">' +
          '<div class="top"><span class="nm">' + esc(p.name) + "</span>" +
            (srcNote ? '<span class="srcnote">' + srcNote + "</span>" : "") + "</div>" +
          (p.brand ? '<div class="sub">' + esc(p.brand) + "</div>" : "") +
          '<div class="macros">per 100 g: net carbs <b>' + fmt(nc, 1) + " g</b>" +
            (p.per100.kcal ? " &middot; <b>" + fmt(p.per100.kcal, 0) + "</b> kcal" : "") + "</div>" +
          '<div class="badges">' + novaBadge(p.nova) + flagBadges(p.flags) + "</div>" +
        "</div>";
      }).join("");
    });
  }

  function pickSearchResult(i) {
    var p = lastSearchResults[i];
    if (!p) return;
    // Mirror a fresh network hit into the product cache, exactly like a
    // successful scan, so it resolves offline (and in offline search) later.
    if (!p._localKind && p.code) S.putCachedProduct(p.code, p);
    // A previously-scanned product is a saved copy; a live hit is fresh.
    renderProduct(p, p._localKind === "cached");
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
        '" text-anchor="end" class="axis">budget ' + opts.target + " g</text>");
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
        unit: "g net carbs", decimals: 1, target: carbTarget || null
      });
      $("kcalChart").innerHTML = barChart(days, {
        value: function (d) { return d.totals.kcal; },
        unit: "kcal", decimals: 0, target: null, color: "var(--prot)"
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
          '<div class="top"><span class="nm">' + esc(f.name) + "</span>" +
            '<span class="sub">' + esc(f.servingLabel || fmt(f.servingGrams, 0) + " g") + "</span></div>" +
          '<div class="macros">per serving: net carbs <b>' + fmt(m.netCarb, 1) +
            " g</b> &middot; fat <b>" + fmt(m.fat, 1) + " g</b> &middot; protein <b>" +
            fmt(m.protein, 1) + " g</b></div>" +
          '<div class="badges">' + novaBadge(f.nova) + flagBadges(f.flags) + "</div>" +
          '<div class="acts">' +
            '<button class="primary tiny" data-log="' + esc(f.id) + '">Log a serving</button>' +
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

  // -------------------------------------------------------------- settings
  function loadSettings() {
    return S.getSetting("carbTarget", null).then(function (v) {
      carbTarget = v ? Number(v) : null;
      $("setCarbTarget").value = carbTarget || "";
    });
  }
  function saveSettings() {
    var v = $("setCarbTarget").value.trim();
    var n = v === "" ? null : Number(v);
    if (v !== "" && !(n > 0)) { status($("settingsStatus"), "Enter a positive number, or leave blank.", "err"); return; }
    carbTarget = n;
    S.setSetting("carbTarget", n).then(function () {
      status($("settingsStatus"), n ? "Budget set to " + n + " g net carbs/day." : "Budget cleared.", "ok");
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

  function openSheet() {
    $("sheetDate").textContent = viewDate === today() ? "today" : viewDate;
    $("addSheet").classList.remove("hidden");
    $("sheetBackdrop").classList.remove("hidden");
    // always reopen in the collapsed state
    $("savedPicker").classList.add("hidden");
    $("quickForm").classList.add("hidden");
    status($("quickStatus"), "", "");
    setSheetMeal(nowMeal());
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

    window.addEventListener("online", refreshOnlineBanner);
    window.addEventListener("offline", refreshOnlineBanner);
    refreshOnlineBanner();

    S.requestPersistence();
    loadSettings().then(renderToday).then(renderFoods);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
