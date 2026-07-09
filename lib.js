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
      flags: scanIngredients(p.ingredients_text || "")
    };
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
    return {
      id: "recipe:" + (json.title || "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      type: "recipe",
      name: json.title || "Untitled recipe",
      brand: "Custom recipe",
      servingGrams: grams,
      servingLabel: "1 serving (" + Math.round(grams) + " g)",
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

  var API = {
    GI_WATCHLIST: GI_WATCHLIST,
    NOVA_LABELS: NOVA_LABELS,
    scanIngredients: scanIngredients,
    normalizeProduct: normalizeProduct,
    netCarbs: netCarbs,
    macrosForGrams: macrosForGrams,
    estimateKcal: estimateKcal,
    dailyTotals: dailyTotals,
    recipeFromAnalyzerJson: recipeFromAnalyzerJson,
    barcodeVariants: barcodeVariants,
    OFF_URL: function (code) {
      return "https://world.openfoodfacts.org/api/v2/product/" +
        encodeURIComponent(code) + ".json";
    }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.FoodLib = API;
})(typeof self !== "undefined" ? self : this);
