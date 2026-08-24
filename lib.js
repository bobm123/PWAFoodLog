/* SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 Robert Marchese
 */
/*
 * lib.js - pure logic for the food log PWA.
 *
 * No DOM, no network. Everything here is deterministic and unit-testable
 * under Node. The browser loads this as a plain script (globals on window);
 * Node loads it via require() thanks to the export shim at the bottom.
 */
(function (root) {
  "use strict";

  // ---------------------------------------------------------------------
  // High-glycemic / refined-carb ingredient watchlist.
  //
  // Open Food Facts' `additives_tags` only contains E-numbers (en:e322).
  // Maltodextrin, modified starches and glucose syrups have NO E-number,
  // so they never appear there -- they only show up in `ingredients_text`.
  // That is why we scan the raw ingredient text ourselves.
  //
  // GI reference points: pure glucose = 100, sucrose (table sugar) = 65.
  // Maltodextrin measures 85-105 depending on chain length, i.e. often
  // HIGHER than table sugar, while being exempt from "added sugars" on the
  // FDA panel. Severity "high" means "behaves like glucose or worse".
  // ---------------------------------------------------------------------
  var GI_WATCHLIST = [
    // --- high: GI at or above table sugar, typically 85-110 ---
    { re: /maltodextrin/i, label: "Maltodextrin", severity: "high",
      note: "GI ~85-105, often higher than table sugar. Not counted as 'added sugar' on the label." },
    { re: /\bdextrose\b/i, label: "Dextrose", severity: "high",
      note: "Pure glucose. GI 100." },
    { re: /high[- ]fructose corn syrup|\bhfcs\b/i, label: "High-fructose corn syrup", severity: "high",
      note: "Refined liquid sugar, GI ~60-75 but high fructose load." },
    { re: /glucose[- ]fructose syrup/i, label: "Glucose-fructose syrup", severity: "high",
      note: "Refined liquid sugar." },
    { re: /glucose syrup|corn syrup(?! solids)/i, label: "Glucose/corn syrup", severity: "high",
      note: "Essentially liquid glucose. GI ~95-100." },
    { re: /corn syrup solids/i, label: "Corn syrup solids", severity: "high",
      note: "Dried glucose syrup. GI near 100." },
    { re: /modified (corn |food |potato |tapioca |wheat )?starch/i, label: "Modified starch", severity: "high",
      note: "Refined starch, digests to glucose rapidly. GI can exceed sugar." },
    { re: /\brice syrup\b|brown rice syrup/i, label: "Rice syrup", severity: "high",
      note: "Almost pure glucose. GI ~98." },
    { re: /\bmaltose\b/i, label: "Maltose", severity: "high",
      note: "GI ~105, higher than glucose." },
    { re: /\bdextrin\b/i, label: "Dextrin", severity: "high",
      note: "Partially hydrolysed starch; rapid glucose release." },
    { re: /tapioca (starch|syrup|dextrin)/i, label: "Tapioca starch/syrup", severity: "high",
      note: "Refined starch, high GI." },
    { re: /\b(potato|corn|wheat|rice) starch\b/i, label: "Refined starch", severity: "high",
      note: "Refined starch, digests quickly to glucose." },
    { re: /malt(ed)? (barley )?extract|barley malt/i, label: "Malt extract", severity: "high",
      note: "Maltose-rich syrup. High GI." },

    // --- moderate: real sugars, GI roughly 50-70 ---
    { re: /\bsucrose\b|\bcane sugar\b|\bcane syrup\b|\bevaporated cane juice\b/i, label: "Cane sugar", severity: "moderate",
      note: "Sucrose, GI ~65." },
    { re: /\bhoney\b/i, label: "Honey", severity: "moderate", note: "GI ~58, still a sugar." },
    { re: /\bagave\b/i, label: "Agave syrup", severity: "moderate",
      note: "Low GI but very high fructose." },
    { re: /fruit juice concentrate|juice concentrate/i, label: "Juice concentrate", severity: "moderate",
      note: "Concentrated sugar used to avoid the word 'sugar'." },
    { re: /\bmolasses\b/i, label: "Molasses", severity: "moderate", note: "Sugar syrup." },
    { re: /\binvert sugar\b/i, label: "Invert sugar", severity: "moderate", note: "Glucose + fructose syrup." },
    { re: /\bfructose\b/i, label: "Fructose", severity: "moderate",
      note: "Low GI but metabolised in the liver; high loads are problematic." }
  ];

  var NOVA_LABELS = {
    1: { label: "Unprocessed", blurb: "Whole or minimally processed food." },
    2: { label: "Culinary ingredient", blurb: "Oils, butter, sugar, salt used in cooking." },
    3: { label: "Processed", blurb: "Simple foods with added salt, sugar, or oil." },
    4: { label: "Ultra-processed", blurb: "Industrial formulation with additives and refined extracts." }
  };

  /** Scan an ingredient string for high-GI / refined-carb terms. */
  function scanIngredients(text) {
    if (!text || typeof text !== "string") return [];
    var hits = [];
    var seen = {};
    for (var i = 0; i < GI_WATCHLIST.length; i++) {
      var w = GI_WATCHLIST[i];
      if (w.re.test(text) && !seen[w.label]) {
        seen[w.label] = true;
        hits.push({ label: w.label, severity: w.severity, note: w.note });
      }
    }
    // high severity first, then alphabetical for stability
    hits.sort(function (a, b) {
      if (a.severity !== b.severity) return a.severity === "high" ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
    return hits;
  }

  function num(v) {
    var n = typeof v === "string" ? parseFloat(v) : v;
    return (typeof n === "number" && isFinite(n)) ? n : 0;
  }

  /**
   * Normalize an Open Food Facts API v2 response into our internal shape.
   * Returns null when the product is unknown (status 0).
   */
  var NUTRIMENT_KEYS = ["fat_100g", "carbohydrates_100g", "fiber_100g",
                        "proteins_100g", "sugars_100g", "energy-kcal_100g"];

  function normalizeProduct(json) {
    if (!json || json.status === 0 || !json.product) return null;
    var p = json.product;
    var n = p.nutriments || {};

    var per100 = {
      fat: num(n.fat_100g),
      carb: num(n.carbohydrates_100g),
      fiber: num(n.fiber_100g),
      protein: num(n.proteins_100g),
      sugars: num(n.sugars_100g),
      kcal: num(n["energy-kcal_100g"])
    };

    // Crowdsourced records sometimes have ingredients but an EMPTY nutrition
    // table (duplicate barcodes are a common culprit). Distinguish "no data at
    // all" from a real all-zero label (water, diet soda): only the former
    // should make the app warn instead of silently showing 0s.
    var anyNutriment = NUTRIMENT_KEYS.some(function (k) {
      var v = n[k];
      var x = typeof v === "string" ? parseFloat(v) : v;
      return typeof x === "number" && isFinite(x);
    });

    var additives = (p.additives_tags || []).map(function (t) {
      return String(t).replace(/^en:/, "").toUpperCase();
    });

    return {
      code: json.code || p.code || "",
      name: p.product_name || "(unnamed product)",
      brand: p.brands || "",
      image: p.image_front_small_url || "",
      per100: per100,
      servingSize: p.serving_size || "",
      servingGrams: num(p.serving_quantity),
      nova: p.nova_group || null,
      additives: additives,
      ingredientsText: p.ingredients_text || "",
      flags: scanIngredients(p.ingredients_text || ""),
      nutritionMissing: !anyNutriment
    };
  }

  /**
   * Should the UI trust this product's macros? False means "warn and offer the
   * correct-from-label form" -- the record carries no nutrition data. Products
   * from before the nutritionMissing flag existed (old caches) fall back to a
   * zero-macro heuristic.
   */
  function hasNutrition(p) {
    if (!p || !p.per100) return false;
    if (p.nutritionMissing !== undefined) return !p.nutritionMissing;
    var m = p.per100;
    return [m.fat, m.carb, m.protein, m.kcal].some(function (v) { return num(v) > 0; });
  }

  /**
   * A corrected copy of a product, its per-100g block rebuilt from nutrition
   * label values for one serving (the numbers printed on the package). kcal
   * left blank falls back to the Atwater estimate. Returns null on a bad
   * serving weight. The original object is not modified.
   */
  function productWithNutrition(p, servingGrams, label) {
    var g = num(servingGrams);
    if (!(g > 0)) return null;
    var k = 100 / g;
    label = label || {};
    var fat = num(label.fat), carb = num(label.carb), fiber = num(label.fiber),
        protein = num(label.protein), sugars = num(label.sugars);
    var kcal = (label.kcal === "" || label.kcal === null || label.kcal === undefined)
      ? (fat * 9 + Math.max(0, carb - fiber) * 4 + protein * 4)
      : num(label.kcal);
    return Object.assign({}, p, {
      per100: { fat: fat * k, carb: carb * k, fiber: fiber * k,
                protein: protein * k, sugars: sugars * k, kcal: kcal * k },
      servingGrams: g,
      servingSize: (p && p.servingSize) || (Math.round(g) + " g"),
      nutritionMissing: false,
      corrected: true
    });
  }

  /** Net carbs = total carbohydrate - fiber (US label convention). */
  function netCarbs(carb, fiber) {
    return Math.max(0, num(carb) - num(fiber));
  }

  /** Scale a per-100g macro block to an arbitrary gram weight. */
  function macrosForGrams(per100, grams) {
    var f = num(grams) / 100;
    var carb = num(per100.carb) * f;
    var fiber = num(per100.fiber) * f;
    return {
      grams: num(grams),
      fat: num(per100.fat) * f,
      carb: carb,
      fiber: fiber,
      protein: num(per100.protein) * f,
      netCarb: netCarbs(carb, fiber),
      kcal: per100.kcal ? num(per100.kcal) * f : null
    };
  }

  /**
   * Macros for a one-off diary entry, where the person types the amounts for
   * the portion they actually ate rather than a per-100 g label.
   *
   * kcal is deliberately left null so dailyTotals() applies the Atwater
   * estimate; a hand-typed entry has no label calories to preserve.
   */
  function quickEntryMacros(grams, m) {
    m = m || {};
    var carb = num(m.carb), fiber = num(m.fiber);
    return {
      grams: num(grams),
      fat: num(m.fat),
      carb: carb,
      fiber: fiber,
      protein: num(m.protein),
      netCarb: netCarbs(carb, fiber),
      kcal: null
    };
  }

  /** kcal from macros when the label doesn't give it (4/4/9, net carbs). */
  function estimateKcal(m) {
    return num(m.fat) * 9 + num(m.netCarb) * 4 + num(m.protein) * 4;
  }

  /**
   * Sum an array of logged entries into daily totals + calorie split.
   *
   * `kcal` is the calorie total for counting (label value when the product
   * gives one, Atwater estimate otherwise).
   *
   * `split` is computed against `macroKcal` -- the Atwater sum of the macros
   * -- NOT against `kcal`. Label calories rarely equal 9*fat + 4*netCarb +
   * 4*protein (label rounding, fiber, sugar alcohols), so dividing by `kcal`
   * would yield percentages that do not add up to 100%.
   */
  function dailyTotals(entries) {
    var t = { fat: 0, carb: 0, fiber: 0, protein: 0, netCarb: 0, kcal: 0, macroKcal: 0, count: 0 };
    (entries || []).forEach(function (e) {
      var m = e.macros || {};
      t.fat += num(m.fat);
      t.carb += num(m.carb);
      t.fiber += num(m.fiber);
      t.protein += num(m.protein);
      t.netCarb += num(m.netCarb);
      t.kcal += (m.kcal !== null && m.kcal !== undefined) ? num(m.kcal) : estimateKcal(m);
      t.count += 1;
    });
    t.macroKcal = t.fat * 9 + t.netCarb * 4 + t.protein * 4;
    var denom = t.macroKcal > 0 ? t.macroKcal : 1;
    t.split = {
      fat: (t.fat * 9) / denom * 100,
      carb: (t.netCarb * 4) / denom * 100,
      protein: (t.protein * 4) / denom * 100
    };
    return t;
  }

  /**
   * Convert `analyze_recipe.py --json` output into a loggable custom food.
   * Stores per-serving macros normalized to a per-100g block so the rest of
   * the app can treat recipes and packaged products identically.
   */
  function recipeFromAnalyzerJson(json) {
    if (!json || !json.per_serving) throw new Error("Not analyzer JSON: missing per_serving");
    var ps = json.per_serving;
    var grams = num(ps.grams);
    if (grams <= 0) throw new Error("Analyzer JSON has no per-serving gram weight");
    var k = 100 / grams;
    // "servings: 6" in the JSON names the portion "1/6 of recipe", which is
    // how people think about a dish that serves six.
    var servings = num(json.servings);
    var portionName = servings >= 2 ? "1/" + Math.round(servings) + " of recipe" : "1 serving";
    return {
      id: "recipe:" + (json.title || "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      type: "recipe",
      name: json.title || "Untitled recipe",
      brand: "Custom recipe",
      servingGrams: grams,
      servingLabel: portionName + " (" + Math.round(grams) + " g)",
      per100: {
        fat: num(ps.fat) * k,
        carb: num(ps.carb) * k,
        fiber: num(ps.fiber) * k,
        protein: num(ps.protein) * k,
        sugars: 0,
        kcal: num(ps.kcal) * k
      },
      nova: 1,
      additives: [],
      ingredientsText: (json.ingredients || []).map(function (i) { return i.name; }).join(", "),
      flags: scanIngredients((json.ingredients || []).map(function (i) { return i.name; }).join(", "))
    };
  }

  /**
   * Convert a normalized product (from a scan/lookup/search) into a saveable
   * food for the frequently-purchased list. Keyed by barcode so re-saving the
   * same product updates it rather than duplicating. per100 is carried through
   * unchanged, so logging a serving computes identical macros to the card.
   */
  function foodFromProduct(p) {
    p = p || {};
    var per = p.per100 || {};
    var serving = num(p.servingGrams) > 0 ? num(p.servingGrams) : 100;
    var slug = (p.code ? p.code : (p.name || "item").toLowerCase().replace(/[^a-z0-9]+/g, "-"));
    return {
      id: "product:" + slug,
      type: "product",
      name: p.name || "(unnamed product)",
      brand: p.brand || "",
      code: p.code || "",
      servingGrams: serving,
      servingLabel: p.servingSize ? String(p.servingSize) : "1 serving (" + Math.round(serving) + " g)",
      per100: {
        fat: num(per.fat), carb: num(per.carb), fiber: num(per.fiber),
        protein: num(per.protein), sugars: num(per.sugars),
        kcal: (per.kcal !== null && per.kcal !== undefined) ? num(per.kcal) : null
      },
      nova: p.nova || null,
      additives: p.additives || [],
      ingredientsText: p.ingredientsText || "",
      flags: p.flags || []
    };
  }

  /** A stub food for a barcode scanned with no connectivity, filled in later. */
  function pendingProductFood(code, name) {
    return {
      id: "product:" + String(code),
      type: "product",
      name: name || ("Scanned product " + code),
      brand: "", code: String(code),
      servingGrams: 100, servingLabel: "1 serving (100 g)",
      per100: { fat: 0, carb: 0, fiber: 0, protein: 0, sugars: 0, kcal: null },
      nova: null, additives: [], ingredientsText: "", flags: [],
      pending: true
    };
  }

  // --------------------------------------------------------------- portions
  var UNICODE_FRACTIONS = {
    "½": 1 / 2, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 1 / 4,
    "¾": 3 / 4, "⅕": 1 / 5, "⅛": 1 / 8, "⅜": 3 / 8,
    "⅝": 5 / 8, "⅞": 7 / 8
  };

  /**
   * How many portions? Accepts what people actually type: "2", "0.5", "1/2",
   * "1 1/2", "1.25", and unicode fractions ("½", "1½").
   * Returns 0 when unparseable or not positive.
   */
  function parseCount(s) {
    if (typeof s === "number") return (isFinite(s) && s > 0) ? s : 0;
    s = String(s === null || s === undefined ? "" : s).trim();
    if (!s) return 0;
    var m = s.match(/^(\d+)?\s*([½⅓⅔¼¾⅕⅛⅜⅝⅞])$/);
    if (m) return (m[1] ? parseInt(m[1], 10) : 0) + UNICODE_FRACTIONS[m[2]];
    m = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);          // "1 1/2"
    if (m) return Number(m[3]) > 0 ? Number(m[1]) + Number(m[2]) / Number(m[3]) : 0;
    m = s.match(/^(\d+)\s*\/\s*(\d+)$/);                  // "3/4"
    if (m) return Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : 0;
    var n = parseFloat(s);
    return (isFinite(n) && n > 0 && /^[\d.]/.test(s)) ? n : 0;
  }

  /** Compact count for display: 2 -> "2", 0.5 -> "0.5", 1.3333 -> "1.33". */
  function formatCount(n) {
    n = num(n);
    if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
    return String(Math.round(n * 100) / 100);
  }

  /** "2 × 1 egg" for diary rows. */
  function portionDisplay(count, label) {
    return formatCount(count) + " × " + label;
  }

  /** "1 egg (50 g)" -> "1 egg": the label without its gram parenthetical. */
  function shortPortionLabel(label) {
    return String(label || "").replace(/\s*\(\s*[\d.]+\s*g\s*\)\s*$/i, "").trim() || "serving";
  }

  // ------------------------------------------------------------------ meals
  var MEALS = ["breakfast", "lunch", "dinner", "snack"];
  var MEAL_LABELS = {
    breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner",
    snack: "Snacks", other: "Other"
  };

  /** Default meal for a new entry from the hour of day (0-23). */
  function guessMeal(hour) {
    var h = num(hour);
    if (h >= 4 && h < 11) return "breakfast";
    if (h >= 11 && h < 15) return "lunch";
    if (h >= 17 && h < 21) return "dinner";
    return "snack";
  }

  /**
   * Group a day's entries by meal in fixed display order. Entries with no
   * meal (logged before meals existed) land in "other". Empty groups are
   * omitted. Each group carries its own dailyTotals() for subtotals.
   */
  function groupByMeal(entries) {
    var order = MEALS.concat(["other"]);
    var by = {};
    (entries || []).forEach(function (e) {
      var m = (e && MEAL_LABELS[e.meal]) ? e.meal : "other";
      (by[m] = by[m] || []).push(e);
    });
    return order.filter(function (m) { return by[m]; }).map(function (m) {
      return { meal: m, label: MEAL_LABELS[m], entries: by[m], totals: dailyTotals(by[m]) };
    });
  }

  // ------------------------------------------------------------- re-logging
  /**
   * Rescale a logged entry's macro block to a new gram weight. Entries store
   * only the totals for the portion eaten, so scaling is proportional to the
   * original weight. Returns null when either weight is unusable.
   */
  function scaleMacros(macros, newGrams) {
    var m = macros || {};
    var oldG = num(m.grams), g = num(newGrams);
    if (!(oldG > 0) || !(g > 0)) return null;
    var f = g / oldG;
    var carb = num(m.carb) * f, fiber = num(m.fiber) * f;
    return {
      grams: g,
      fat: num(m.fat) * f,
      carb: carb,
      fiber: fiber,
      protein: num(m.protein) * f,
      netCarb: netCarbs(carb, fiber),
      kcal: (m.kcal !== null && m.kcal !== undefined) ? num(m.kcal) * f : null
    };
  }

  /**
   * Most recently logged distinct items, newest first, for one-tap
   * re-logging. Dedupes by barcode when present, else by lowercased name.
   */
  function recentFoods(entries, limit) {
    var sorted = (entries || []).slice().sort(function (a, b) {
      return String(b.loggedAt || "").localeCompare(String(a.loggedAt || ""));
    });
    var seen = {}, out = [];
    for (var i = 0; i < sorted.length && out.length < (limit || 8); i++) {
      var e = sorted[i];
      if (!e || !e.macros || !(num(e.macros.grams) > 0)) continue;
      var key = e.code ? "c:" + e.code : "n:" + String(e.name || "").toLowerCase();
      if (seen[key]) continue;
      seen[key] = true;
      out.push({
        name: e.name, brand: e.brand || "", code: e.code || "",
        nova: e.nova || null, flags: e.flags || [], macros: e.macros,
        portion: e.portion || null
      });
    }
    return out;
  }

  // --------------------------------------------------------------- history
  /** The `days` dates ending at endDate (YYYY-MM-DD), oldest first. */
  function dateRange(endDate, days) {
    var end = new Date(endDate + "T12:00:00Z"); // noon UTC dodges DST edges
    var out = [];
    for (var i = days - 1; i >= 0; i--) {
      out.push(new Date(end.getTime() - i * 86400000).toISOString().slice(0, 10));
    }
    return out;
  }

  /** Per-day totals for a date range, zero-filled for days with no entries. */
  function historyDays(entries, dates) {
    var byDate = {};
    (entries || []).forEach(function (e) {
      (byDate[e.date] = byDate[e.date] || []).push(e);
    });
    return (dates || []).map(function (d) {
      return { date: d, totals: dailyTotals(byDate[d] || []) };
    });
  }

  /**
   * Consecutive days at or under the net-carb budget, counting back from the
   * end of `days` (oldest-first). An unlogged day is unknown, not a success,
   * so it breaks the streak -- except the final day, which is skipped while
   * it has nothing logged yet.
   */
  function streakUnderBudget(days, target) {
    if (!(target > 0)) return 0;
    var i = (days || []).length - 1;
    if (i >= 0 && days[i].totals.count === 0) i--;   // today not logged yet
    var n = 0;
    for (; i >= 0; i--) {
      var t = days[i].totals;
      if (t.count > 0 && t.netCarb <= target) n++;
      else break;
    }
    return n;
  }

  // -------------------------------------------------------- targets / goals
  /**
   * Progress of a consumed amount toward a daily target. `pct` is clamped to
   * 0..100 for a bar; `over` and `remaining` are not clamped so the UI can say
   * "12 g over" or "340 left". hasTarget is false when no target is set, so the
   * UI falls back to just showing the consumed amount.
   */
  function macroProgress(consumed, target) {
    var c = num(consumed), t = num(target);
    if (!(t > 0)) return { hasTarget: false, pct: 0, over: false, remaining: null };
    return {
      hasTarget: true,
      pct: Math.max(0, Math.min(100, c / t * 100)),
      over: c > t,
      remaining: t - c
    };
  }

  // ------------------------------------------------------------- hydration
  var WATER_GOAL_DEFAULT = 64;      // fl oz (~8 cups)
  var WATER_PRESETS = [8, 12, 16];  // glass / cup / bottle, fl oz

  /** Add (or subtract) water, never dropping below zero. */
  function addOz(current, delta) {
    return Math.max(0, num(current) + num(delta));
  }

  // ---------------------------------------------------------------- search
  /** Normalize one page of OFF search results into internal product shape. */
  function normalizeSearchResults(json) {
    var list = (json && json.products) || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var p = normalizeProduct({ status: 1, code: list[i].code, product: list[i] });
      if (p && p.code) out.push(p);
    }
    return out;
  }

  var SEARCH_ERR_MESSAGE = {
    offline: "You're offline - showing matches saved on this device only.",
    timeout: "Open Food Facts search didn't respond - showing matches saved on this device.",
    network: "Couldn't reach Open Food Facts - showing matches saved on this device.",
    empty: "No products matched. Try fewer words, or scan the barcode."
  };

  /**
   * Substring search over what is already on the device: saved foods and
   * recipes, plus the cached-product mirror. Saved foods first; a cached
   * product that duplicates a saved food's barcode is dropped.
   */
  function searchLocal(query, foods, cachedProducts) {
    var q = String(query || "").trim().toLowerCase();
    if (q.length < 2) return [];
    function matches(name, brand) {
      return (String(name || "") + " " + String(brand || "")).toLowerCase().indexOf(q) !== -1;
    }
    var out = [], seenCodes = {};
    (foods || []).forEach(function (f) {
      if (!f || !matches(f.name, f.brand)) return;
      if (f.code) seenCodes[f.code] = true;
      out.push({ kind: "food", item: f });
    });
    (cachedProducts || []).forEach(function (p) {
      if (!p || !matches(p.name, p.brand)) return;
      if (p.code && seenCodes[p.code]) return;
      out.push({ kind: "cached", item: p });
    });
    return out;
  }

  /**
   * Offline-tolerant name search. Mirrors lookupProduct(): never rejects,
   * always resolves to { products, source, error, message }. On any network
   * failure it falls back to deps.getLocal(query) so a search still surfaces
   * whatever matches on the device.
   *
   * deps = {
   *   fetchJson(url) -> Promise<json>
   *   isOnline() -> boolean
   *   getLocal(query) -> Promise<product[]>   (optional)
   * }
   */
  function searchProducts(deps, query) {
    query = String(query || "").trim();
    if (query.length < 2) {
      return Promise.resolve({ products: [], source: null, error: null, message: null });
    }
    function localOnly(reason) {
      var get = deps.getLocal || function () { return Promise.resolve([]); };
      return Promise.resolve().then(function () { return get(query); }).then(function (items) {
        return { products: items || [], source: "local", error: reason,
                 message: SEARCH_ERR_MESSAGE[reason] };
      }, function () {
        return { products: [], source: "local", error: reason,
                 message: SEARCH_ERR_MESSAGE[reason] };
      });
    }
    if (!deps.isOnline()) return localOnly(ERR.OFFLINE);
    return deps.fetchJson(API.OFF_SEARCH_URL(query)).then(function (json) {
      var products = normalizeSearchResults(json);
      return { products: products, source: "network", error: null,
               message: products.length ? null : SEARCH_ERR_MESSAGE.empty };
    }, function (err) {
      return localOnly(isTimeoutError(err) ? ERR.TIMEOUT : ERR.NETWORK);
    });
  }

  /**
   * Barcode forms to try, in order. A US UPC-A is printed as 12 digits but is
   * frequently stored in Open Food Facts as the 13-digit EAN with a leading
   * zero (and occasionally the reverse), so try both before giving up.
   */
  function barcodeVariants(code) {
    code = String(code || "").trim();
    var out = [code];
    if (/^\d{12}$/.test(code)) out.push("0" + code);
    if (/^0\d{12}$/.test(code)) out.push(code.slice(1));
    return out;
  }

  // ---------------------------------------------------------------------
  // Offline-tolerant product lookup.
  //
  // Written against injected dependencies so every failure path (timeout,
  // dropped connection, airplane mode, unknown barcode) is unit-testable
  // without a network or a browser.
  //
  // Resolution order when online:
  //   network(variant 1) -> network(variant 2) -> not-found
  // On a network/timeout failure at any point we fall back to the local
  // product cache, so a barcode you have scanned before still resolves.
  // When offline we skip the network entirely and go straight to cache.
  //
  // This never rejects. It always resolves to a result object so the UI can
  // render a specific, honest message instead of a spinner that never stops.
  // ---------------------------------------------------------------------
  var ERR = {
    OFFLINE: "offline",     // no connection and nothing cached
    TIMEOUT: "timeout",     // request took too long
    NETWORK: "network",     // request failed
    NOT_FOUND: "not-found"  // reached the server; barcode genuinely unknown
  };

  var ERR_MESSAGE = {
    offline: "You're offline and this barcode isn't saved on this device. Enter it by hand below.",
    timeout: "Open Food Facts didn't respond. Check your signal, or enter it by hand.",
    network: "Couldn't reach Open Food Facts. Check your signal, or enter it by hand.",
    "not-found": "This barcode isn't in Open Food Facts. Enter it by hand below."
  };

  function isTimeoutError(err) {
    return !!err && (err.name === "AbortError" || err.timeout === true);
  }

  /**
   * deps = {
   *   fetchJson(url) -> Promise<json>   (rejects on timeout/network)
   *   getCached(code) -> Promise<product|null>
   *   putCached(code, product) -> Promise<any>
   *   isOnline() -> boolean
   * }
   * Resolves to { product, source, stale, offline, error, message }.
   */
  function lookupProduct(deps, code) {
    var variants = barcodeVariants(code);

    function fromCache(reason) {
      var i = 0;
      function next() {
        if (i >= variants.length) {
          return Promise.resolve({
            product: null, source: null, stale: false,
            offline: reason === ERR.OFFLINE,
            error: reason, message: ERR_MESSAGE[reason]
          });
        }
        return deps.getCached(variants[i++]).then(function (p) {
          if (p) {
            return {
              product: p, source: "cache", stale: true,
              offline: reason === ERR.OFFLINE, error: null,
              message: reason === ERR.OFFLINE
                ? "Offline - showing the copy saved on this device."
                : "Couldn't reach Open Food Facts - showing the saved copy."
            };
          }
          return next();
        }, next);
      }
      return next();
    }

    if (!deps.isOnline()) return fromCache(ERR.OFFLINE);

    var i = 0;
    function attempt() {
      if (i >= variants.length) {
        return Promise.resolve({
          product: null, source: null, stale: false, offline: false,
          error: ERR.NOT_FOUND, message: ERR_MESSAGE[ERR.NOT_FOUND]
        });
      }
      var v = variants[i++];
      return deps.fetchJson(API.OFF_URL(v)).then(function (json) {
        var p = normalizeProduct(json);
        if (!p) return attempt();               // status 0 -> try next variant
        function done() {
          return { product: p, source: "network", stale: false, offline: false,
                   error: null, message: null };
        }
        // A cache write failure must never sink a successful lookup.
        return deps.putCached(v, p).then(done, done);
      }, function (err) {
        return fromCache(isTimeoutError(err) ? ERR.TIMEOUT : ERR.NETWORK);
      });
    }
    return attempt();
  }

  var API = {
    ERR: ERR,
    ERR_MESSAGE: ERR_MESSAGE,
    isTimeoutError: isTimeoutError,
    lookupProduct: lookupProduct,
    GI_WATCHLIST: GI_WATCHLIST,
    NOVA_LABELS: NOVA_LABELS,
    scanIngredients: scanIngredients,
    normalizeProduct: normalizeProduct,
    hasNutrition: hasNutrition,
    productWithNutrition: productWithNutrition,
    netCarbs: netCarbs,
    macrosForGrams: macrosForGrams,
    quickEntryMacros: quickEntryMacros,
    estimateKcal: estimateKcal,
    dailyTotals: dailyTotals,
    recipeFromAnalyzerJson: recipeFromAnalyzerJson,
    foodFromProduct: foodFromProduct,
    pendingProductFood: pendingProductFood,
    parseCount: parseCount,
    formatCount: formatCount,
    portionDisplay: portionDisplay,
    shortPortionLabel: shortPortionLabel,
    barcodeVariants: barcodeVariants,
    MEALS: MEALS,
    MEAL_LABELS: MEAL_LABELS,
    guessMeal: guessMeal,
    groupByMeal: groupByMeal,
    scaleMacros: scaleMacros,
    recentFoods: recentFoods,
    dateRange: dateRange,
    historyDays: historyDays,
    streakUnderBudget: streakUnderBudget,
    macroProgress: macroProgress,
    addOz: addOz,
    WATER_GOAL_DEFAULT: WATER_GOAL_DEFAULT,
    WATER_PRESETS: WATER_PRESETS,
    normalizeSearchResults: normalizeSearchResults,
    SEARCH_ERR_MESSAGE: SEARCH_ERR_MESSAGE,
    searchLocal: searchLocal,
    searchProducts: searchProducts,
    OFF_URL: function (code) {
      return "https://world.openfoodfacts.org/api/v2/product/" +
        encodeURIComponent(code) + ".json";
    },
    OFF_SEARCH_URL: function (q) {
      return "https://world.openfoodfacts.org/cgi/search.pl?action=process&json=1" +
        "&search_simple=1&page_size=20&sort_by=unique_scans_n" +
        "&fields=code,product_name,brands,image_front_small_url,nutriments," +
        "serving_size,serving_quantity,nova_group,additives_tags,ingredients_text" +
        "&search_terms=" + encodeURIComponent(q);
    }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.FoodLib = API;
})(typeof self !== "undefined" ? self : this);
