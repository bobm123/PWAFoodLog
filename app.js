/* app.js - UI wiring. Pure logic lives in lib.js, persistence in store.js. */
(function () {
  "use strict";
  var L = self.FoodLib, S = self.Store;
  var $ = function (id) { return document.getElementById(id); };
  var scanner = null;
  var currentProduct = null;
  var carbTarget = null;

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
  function renderToday() {
    return S.entriesForDate(viewDate).then(function (entries) {
      var list = $("entryList");
      list.innerHTML = entries.map(function (e) {
        var m = e.macros;
        var kcal = (m.kcal != null) ? m.kcal : L.estimateKcal(m);
        return '<div class="item">' +
          '<div class="top"><span class="nm">' + esc(e.name) + "</span>" +
          '<span class="sub">' + fmt(m.grams, 0) + " g</span></div>" +
          (e.brand ? '<div class="sub">' + esc(e.brand) + "</div>" : "") +
          '<div class="macros">net carbs <b>' + fmt(m.netCarb, 1) + " g</b> &middot; fat <b>" +
            fmt(m.fat, 1) + " g</b> &middot; protein <b>" + fmt(m.protein, 1) +
            " g</b> &middot; <b>" + fmt(kcal, 0) + "</b> kcal</div>" +
          '<div class="badges">' + novaBadge(e.nova) + flagBadges(e.flags) + "</div>" +
          '<div class="acts"><button class="ghost tiny" data-del="' + e.id + '">Remove</button></div>' +
          "</div>";
      }).join("");
      $("todayEmpty").classList.toggle("hidden", entries.length > 0);
      renderTotals(entries);
    });
  }

  // ------------------------------------------------------------ product UI
  function renderProduct(p) {
    currentProduct = p;
    var serving = p.servingGrams || 100;
    $("productCard").innerHTML =
      '<div class="card"><div class="prod">' +
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
        '<button id="btnAddEntry" class="primary">Add to ' +
          (viewDate === today() ? "today" : esc(viewDate)) + "</button>" +
      "</div>" +
      '<p class="hint">Portion in grams' + (p.servingSize ? " (label serving: " + esc(p.servingSize) + ")" : "") + "</p>" +
      "</div>";

    $("btnAddEntry").addEventListener("click", function () {
      var g = parseFloat($("portion").value);
      if (!(g > 0)) return;
      addEntry(p, g);
    });
  }

  function addEntry(p, grams) {
    var entry = {
      date: viewDate,
      name: p.name,
      brand: p.brand || "",
      code: p.code || "",
      nova: p.nova || null,
      flags: p.flags || [],
      macros: L.macrosForGrams(p.per100, grams),
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
    status($("scanStatus"), "Looking up " + code + "…");

    // Try the printed barcode, then its UPC-A/EAN-13 leading-zero variant.
    var variants = L.barcodeVariants(code);
    (function attempt(i) {
      if (i >= variants.length) {
        status($("scanStatus"), "Not in Open Food Facts. Add it by hand under Foods.", "err");
        $("productCard").innerHTML = "";
        return;
      }
      fetch(L.OFF_URL(variants[i]))
        .then(function (r) { return r.json(); })
        .then(function (j) {
          var p = L.normalizeProduct(j);
          if (!p) return attempt(i + 1);
          status($("scanStatus"), "", "");
          renderProduct(p);
        })
        .catch(function () {
          status($("scanStatus"), "Lookup failed. Check your connection.", "err");
        });
    })(0);
  }

  function startScan() {
    if (typeof Html5Qrcode === "undefined") {
      status($("scanStatus"), "Scanner library didn't load. Use manual entry.", "err");
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
    if (!name || !(g > 0)) { alert("Give the food a name and a serving weight in grams."); return; }
    var fat = parseFloat($("cfFat").value) || 0,
        carb = parseFloat($("cfCarb").value) || 0,
        fiber = parseFloat($("cfFiber").value) || 0,
        prot = parseFloat($("cfProtein").value) || 0;
    var k = 100 / g;
    var food = {
      id: "food:" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ":" + Date.now(),
      type: "food", name: name, brand: "Custom",
      servingGrams: g, servingLabel: "1 serving (" + fmt(g, 0) + " g)",
      per100: { fat: fat * k, carb: carb * k, fiber: fiber * k, protein: prot * k, sugars: 0,
                kcal: (fat * 9 + Math.max(0, carb - fiber) * 4 + prot * 4) * k },
      nova: 1, additives: [], ingredientsText: "", flags: []
    };
    S.put("foods", food).then(function () {
      ["cfName", "cfGrams", "cfFat", "cfCarb", "cfFiber", "cfProtein"].forEach(function (i) { $(i).value = ""; });
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

  // ------------------------------------------------------------------ tabs
  function showTab(name) {
    document.querySelectorAll(".tab").forEach(function (t) {
      t.classList.toggle("active", t.dataset.tab === name);
    });
    document.querySelectorAll(".panel").forEach(function (p) {
      p.classList.toggle("active", p.id === "panel-" + name);
    });
    if (name !== "scan" && scanner) stopScan();
  }

  // ------------------------------------------------------------------ init
  function init() {
    $("dayPicker").value = viewDate;
    $("dayPicker").addEventListener("change", function (e) {
      viewDate = e.target.value || today();
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
    });

    S.requestPersistence();
    loadSettings().then(renderToday).then(renderFoods);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
