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

  // App version, shown in Settings -> About. This is the single source of
  // truth: sw.js builds its cache name from it, so bumping this is what makes
  // installed copies pick up a new release. Bump it on every deploy.
  var APP_VERSION = "1.2.0";

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
  // ------------------------------------------------- recipe text parsing
  // A port of keto-recipe-analyzer/scripts/analyze_recipe.py so a recipe can
  // be analyzed on the phone, offline, from text the user pasted (typically
  // via iOS Live Text off a cookbook page). The ingredient table lives in
  // nutrition-db.js, generated from the same nutrition_db.py the script uses.
  //
  // Deliberately more forgiving than the Python version: OCR output is messier
  // than a hand-typed .txt -- vulgar fractions, lines that wrap mid-ingredient,
  // and parenthetical asides all show up routinely.

  var MASS = { g: 1, gram: 1, grams: 1, kg: 1000,
               oz: 28.35, ounce: 28.35, ounces: 28.35,
               lb: 453.6, lbs: 453.6, pound: 453.6, pounds: 453.6 };

  // Keep in step with VOLUME in analyze_recipe.py -- a unit missing here is an
  // ingredient silently dropped from the totals.
  var VOLUME = { ml: 1, milliliter: 1, milliliters: 1, l: 1000, liter: 1000, liters: 1000,
                 tsp: 4.93, teaspoon: 4.93, teaspoons: 4.93,
                 tbs: 14.79, tbsp: 14.79, tablespoon: 14.79, tablespoons: 14.79,
                 cup: 236.6, cups: 236.6,
                 floz: 29.57, fl: 29.57,
                 pint: 473, pints: 473, quart: 946, quarts: 946, qt: 946 };

  var COUNT_WORDS = ["medium", "large", "small", "clove", "cloves", "can", "cans",
                     "slice", "slices", "strip", "sprig", "bunch", "stalk",
                     "stick", "fillet", "breast", "piece", "pieces", "pinch",
                     "lemon", "head"];

  var WORD_NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
                   six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
                   half: 0.5, quarter: 0.25 };

  // OCR emits real glyphs, not "3/4". Left alone the quantity is dropped and
  // the ingredient silently becomes a pinch -- a confidently wrong number.
  var VULGAR = {
    "\u00bc": "1/4", "\u00bd": "1/2", "\u00be": "3/4",
    "\u2150": "1/7", "\u2151": "1/9", "\u2152": "1/10",
    "\u2153": "1/3", "\u2154": "2/3",
    "\u2155": "1/5", "\u2156": "2/5", "\u2157": "3/5", "\u2158": "4/5",
    "\u2159": "1/6", "\u215a": "5/6",
    "\u215b": "1/8", "\u215c": "3/8", "\u215d": "5/8", "\u215e": "7/8"
  };

  /** Vulgar fractions to ASCII; "1" + U+215B becomes "1 1/8" so it parses. */
  function normalizeFractions(text) {
    var out = "";
    for (var i = 0; i < String(text).length; i++) {
      var ch = String(text).charAt(i);
      if (VULGAR[ch]) {
        if (out && /\d$/.test(out)) out += " ";
        out += VULGAR[ch];
      } else if (ch === "\u2044") {
        out += "/";
      } else {
        out += ch;
      }
    }
    return out;
  }

  var SECTION_STOP = /^\s*(preparation|method|instructions?|directions?|steps?)\b/i;
  var SECTION_START = /^\s*(ingredients?|for the .+)\s*:?\s*$/i;

  function normalizeUnit(word) {
    var w = String(word || "").toLowerCase().replace(/^[.,]+|[.,]+$/g, "");
    if (MASS[w] !== undefined) return { kind: "mass", word: w };
    if (VOLUME[w] !== undefined) return { kind: "volume", word: w };
    if (COUNT_WORDS.indexOf(w) !== -1) return { kind: "count", word: w };
    return null;
  }

  /** Consume leading numeric tokens: "2", "1/2", "2 1/2", "3.5", "two". */
  function parseQuantity(tokens) {
    var amount = 0, used = 0, got = false;
    for (var i = 0; i < tokens.length; i++) {
      var low = String(tokens[i]).toLowerCase().replace(/^[.,]+|[.,]+$/g, "");
      var frac = /^(\d+)\/(\d+)$/.exec(low);
      if (frac) { amount += Number(frac[1]) / Number(frac[2]); got = true; used++; continue; }
      if (/^\d+(\.\d+)?$/.test(low)) {
        if (got) break;        // "2 8 oz" is not 10
        amount += Number(low); got = true; used++; continue;
      }
      if (!got && WORD_NUM[low] !== undefined) {
        amount += WORD_NUM[low]; got = true; used++; continue;
      }
      break;
    }
    if (!got) return { amount: null, rest: tokens };
    return { amount: amount, rest: tokens.slice(used) };
  }

  // Words that describe a form, not a food. "chili powder" and "baking powder"
  // share only "powder"; matching on that alone made every unknown "<x> powder"
  // resolve to baking powder and silently enter the totals with its macros.
  var GENERIC_WORDS = {
    powder: 1, extract: 1, fresh: 1, dried: 1, ground: 1, chopped: 1, minced: 1,
    grated: 1, sliced: 1, whole: 1, raw: 1, cooked: 1, canned: 1, frozen: 1,
    large: 1, medium: 1, small: 1, plain: 1, pure: 1, light: 1, dark: 1,
    sauce: 1, juice: 1, oil: 1, syrup: 1, milk: 1, cream: 1, flour: 1,
    seed: 1, seeds: 1, leaf: 1, leaves: 1, paste: 1, puree: 1, mix: 1,
    unsalted: 1, salted: 1, sweet: 1, hot: 1, cold: 1, warm: 1, instant: 1
  };

  /** Fuzzy-match free text to a table key. */
  function matchIngredient(name, db) {
    var n = String(name || "").toLowerCase().replace(/[^a-z ]/g, " ")
              .replace(/\s+/g, " ").trim();
    if (!n) return null;
    var words = n.split(" ");
    var best = null, bestScore = 0;
    for (var key in db) {
      if (!Object.prototype.hasOwnProperty.call(db, key)) continue;
      var cands = [key].concat(db[key].aliases || []);
      for (var c = 0; c < cands.length; c++) {
        var cand = cands[c];
        if (!cand) continue;
        var cw = cand.split(" ");
        var score;
        if (n.indexOf(cand) !== -1) {
          score = 100 + cand.length;
        } else {
          var overlap = 0, specific = 0;
          for (var k = 0; k < cw.length; k++) {
            if (words.indexOf(cw[k]) === -1) continue;
            overlap++;
            if (!GENERIC_WORDS[cw[k]]) specific++;
          }
          // Require at least one word that actually names a food. Without
          // this, sharing "powder" or "fresh" is enough to claim a match.
          if (!overlap || !specific) continue;
          score = 10 * overlap - (cw.length - overlap);
        }
        if (score > bestScore) { bestScore = score; best = key; }
      }
    }
    return bestScore > 0 ? best : null;
  }

  function toGrams(amount, unitKind, unitWord, rec) {
    rec = rec || {};
    if (unitKind === "mass") return amount * MASS[unitWord];
    if (unitKind === "volume") return amount * VOLUME[unitWord] * (rec.density || 1);
    if (unitKind === "count") {
      var units = rec.units || {};
      if (units[unitWord] !== undefined) return amount * units[unitWord];
      if (units[""] !== undefined) return amount * units[""];
      return null;
    }
    return null;
  }

  var CONTAINER = /^\s*(\d+)\s+([\d.]+)\s*(oz|ounces?|g|grams?|lb|lbs|pounds?)\.?\s+(cans?|tins?|jars?|packages?|pkgs?|boxes?)\b(.*)/i;

  // Boilerplate that survives extraction from a printed web page: nav, timing
   // blocks, nutrition panels, pagination, sharing links. Measured across a
  // 91-recipe corpus, 87% of unmatched lines were this rather than food, so
  // asking the user to resolve them would bury the few that matter.
  var PAGE_FURNITURE = new RegExp(
    "^(" +
    "at a glance|prep|bake|cook|total|yield|serves?|servings?|makes|" +
    "print|share|save|pin it|email|shopping list|from our|advertisement|" +
    "ingredients?|instructions?|directions?|method|preparation|steps?|" +
    "notes?|tips?|variations?|equipment|before you begin|why this recipe works|" +
    "nutrition|calories|watch|video|photos?|comments?|reviews?|rate this|" +
    "updated|published|copyright|all rights reserved" +
    ")\\b", "i");

  /**
   * Does this unmatched line deserve the user's attention?
   *
   * A silently dropped ingredient makes the totals quietly wrong, so real
   * misses must surface. But page furniture outnumbers them roughly 7:1, and
   * a list of "FROM OUR SPONSORS" and "15 mins. to 20 mins." teaches people
   * to dismiss the whole prompt. Only lines that look like food get through.
   */
  function worthAsking(raw) {
    var t = String(raw || "").trim();
    if (!t) return false;
    if (PAGE_FURNITURE.test(t)) return false;
    if (/^https?:\/\//i.test(t) || /\S+@\S+\.\w/.test(t)) return false;
    if (/^[_\-=.*\u2022\s]+$/.test(t)) return false;            // rules/dividers
    if (/\d\s*%\s*DV|\b\d+\s*(mg|mcg|kcal|cal)\b/i.test(t)) return false; // nutrition panel
    if (/^\d+\s*(of|\/)\s*\d+$/.test(t)) return false;         // "4 of 5", page numbers
    if (/^\d+[\/.\-]\d+[\/.\-]\d+/.test(t)) return false;      // a date
    if (/^\d+\s*(mins?|minutes?|hrs?|hours?|seconds?|secs?)\b/i.test(t)) return false;
    if (/^\d+\s*(degrees?|\u00b0)/i.test(t)) return false;
    // "58 COMMENTS", "20 Photos - Updated 9 months ago", "6 servings":
    // a number attached to page metadata, not an amount of food.
    if (/^\d+\s*(comments?|reviews?|photos?|votes?|ratings?|stars?|likes?|shares?)\b/i.test(t)) return false;
    if (/^\d+\s*(servings?|serves|portions?)\b/i.test(t)) return false;
    if (/\bupdated\b|\bago\b|\bposted\b/i.test(t)) return false;
    // An address written to dodge scrapers: "name (at) example.com".
    if (/\(at\)|\(dot\)/i.test(t)) return false;
    // "2. Recipes to Make Now" -- a numbered contents entry. A real
    // ingredient does not put a period straight after its quantity.
    if (/^\d+\.\s+[A-Z]/.test(t)) return false;
    // Mojibake from a broken font encoding ("6RXUFHKWWS..."): English runs
    // about 35-45% vowels, gibberish far less. Ratio, not position -- an
    // earlier positional test threw out "2 Tbs. capers, rinsed".
    var letters = t.replace(/[^A-Za-z]/g, "");
    if (letters.length > 12) {
      var vowels = letters.replace(/[^aeiouAEIOU]/g, "").length;
      if (vowels / letters.length < 0.22) return false;
    }

    // What remains should read like an ingredient: a quantity, and short.
    var words = t.split(/\s+/).length;
    if (words > 14) return false;
    return /^[\u2022\u00b7\u25cf\u25aa*\-]?\s*(\d|a\s|an\s|one\s|two\s|three\s|half\s)/i
      .test(normalizeFractions(t));
  }

  /**
   * Is this line prose rather than an ingredient?
   *
   * Extracted web pages carry headnotes, tips and URLs alongside the list.
   * The fuzzy matcher will happily find "butter" inside a paragraph about
   * grating butter and bill it as a 5 g pinch, so every sentence becomes a
   * phantom ingredient and the totals drift. Ingredient lines are short and
   * start with a quantity; prose is long and reads like a sentence.
   */
  function looksLikeProse(text) {
    var t = String(text || "").trim();
    if (!t) return true;
    if (/^https?:\/\//i.test(t)) return true;             // a bare URL
    var words = t.split(/\s+/).length;
    var startsWithQty = /^[\u2022\u00b7\u25cf\u25aa*\-]?\s*(\d|a\s|an\s|one\s|two\s|three\s|half\s)/i
      .test(normalizeFractions(t));
    // Generous: a quantity buys a lot of latitude ("1 1/2 cups blueberries
    // (about 7 1/2 ounces), picked over (see note)" is a real ingredient).
    if (startsWithQty) return words > 25;
    // Without a quantity, only a short phrase is plausible ("Dill", "Salt").
    if (words > 6) return true;
    // A sentence ending in a period, with a verb-ish shape, is prose.
    return /[.!?]$/.test(t) && words > 3;
  }

  // "(1 1/8 ounces each)", "(14 oz each)", "(400 g each)" -- a per-item size
  // stated in the line itself.
  var EACH_SIZE = /\((?:about\s+)?([\d.]+(?:\s+\d+\/\d+)?|\d+\/\d+)\s*(oz|ounces?|g|grams?|lb|lbs|pounds?)\.?\s*(?:each|apiece)\)/i;

  /**
   * A per-item weight the recipe states for itself, in grams, or null.
   *
   * "4 original Heath Bars (1 1/8 ounces each)" is 127.6 g, but the table's
   * generic bar is 39 g, so trusting the table would overstate it by 22%.
   * When the line says how big each one is, that beats any default.
   */
  function eachSizeGrams(text) {
    var m = EACH_SIZE.exec(normalizeFractions(String(text || "")));
    if (!m) return null;
    var qty = parseQuantity(m[1].trim().split(/\s+/));
    if (qty.amount === null || !(qty.amount > 0)) return null;
    var unit = normalizeUnit(m[2]);
    if (!unit || unit.kind !== "mass") return null;
    return qty.amount * MASS[unit.word];
  }

  /** Parse one ingredient line. Returns null when it isn't one. */
  function parseIngredientLine(line, db) {
    db = db || {};
    var raw = normalizeFractions(String(line || "").trim());
    if (!raw) return null;
    raw = raw.replace(/^[\u2022\u00b7\u25cf\u25aa*\-]\s*/, "").trim();
    if (!raw) return null;
    if (looksLikeProse(raw)) return null;

    var cm = CONTAINER.exec(raw);
    if (cm) {
      var grams = Number(cm[1]) * Number(cm[2]) *
                  (MASS[cm[3].toLowerCase().replace(/\.$/, "")] || 28.35);
      var cname = cm[5].replace(/^[\s.,]+|[\s.,]+$/g, "").replace(/^of\s+/i, "");
      return { raw: raw, amount: grams, unitKind: "mass", unitWord: "g",
               name: cname, dbKey: matchIngredient(cname, db) };
    }

    var tokens = raw.replace(/(\d)([a-zA-Z])/g, "$1 $2").split(/\s+/);
    var q = parseQuantity(tokens);
    var amount = q.amount, rest = q.rest;
    var unitKind = null, unitWord = null;

    if (amount === null) {
      var nu0 = normalizeUnit(tokens[0]);
      if (nu0 && nu0.kind === "count") {
        amount = 1; unitKind = nu0.kind; unitWord = nu0.word; rest = tokens.slice(1);
      } else {
        rest = tokens;                      // no quantity: "salt to taste"
      }
    }
    if (amount !== null && !unitKind && rest.length) {
      var nu = normalizeUnit(rest[0]);
      if (nu) { unitKind = nu.kind; unitWord = nu.word; rest = rest.slice(1); }
    }

    var name = rest.join(" ").replace(/^[\s.,]+|[\s.,]+$/g, "");
    if (!name) return null;
    return { raw: raw, amount: amount, unitKind: unitKind, unitWord: unitWord,
             name: name, dbKey: matchIngredient(name, db) };
  }

  // A line that is nothing but a number: "16", "1 1/2", "1/2", "2.5".
  var QTY_ONLY = /^\s*\d+(\s*\d+\/\d+|\/\d+|\.\d+)?\s*$/;

  // A line that opens with a measurement word. Pairing this with QTY_ONLY is
  // what separates a real stranded quantity from a date, a page number or a
  // numbered preparation step -- all of which are also "just a number".
  var STARTS_WITH_UNIT = new RegExp(
    "^\\s*(cups?|tablespoons?|teaspoons?|tbsp|tbs|tsp|ounces?|oz|pounds?|lbs?|" +
    "grams?|g|kg|ml|liters?|l|cloves?|large|medium|small|slices?|cans?|tins?|" +
    "jars?|sticks?|pints?|quarts?|sprigs?|stalks?|heads?|bunch(es)?|pinch(es)?|" +
    "strips?|pieces?|fillets?|breasts?|packages?)\\b", "i");

  /**
   * Rejoin a quantity that print layout stranded on its own line.
   *
   * Recipe sites' print CSS lays ingredients out as two columns, and PDF text
   * extraction reads them top-to-bottom, so "16 tablespoons butter" arrives as
   * "16" then "tablespoons butter".
   *
   * The guard matters: dates ("6/28/2020"), page numbers ("1/6") and numbered
   * steps ("1" then "Cook the turkey...") are all a bare number too. Requiring
   * the NEXT line to begin with a unit is what tells them apart -- without it
   * this would turn preparation steps into ingredients.
   */
  function joinStrandedQuantities(lines) {
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var ln = String(lines[i]).trim();
      var next = i + 1 < lines.length ? String(lines[i + 1]).trim() : "";
      if (ln && next && QTY_ONLY.test(normalizeFractions(ln)) &&
          STARTS_WITH_UNIT.test(next)) {
        out.push(normalizeFractions(ln).trim() + " " + next);
        i++;                                  // consume the unit line too
        continue;
      }
      out.push(ln);
    }
    return out;
  }

  /**
   * Join a line that is the tail of the one above: no leading quantity, and
   * the previous line either dangles on a modifier or this one is an aside.
   * OCR of a narrow column splits "3 tablespoons good-quality freeze-dried
   * coffee" in two, and the continuation carries no quantity of its own.
   */
  function stitchWrapped(lines) {
    var DANGLE = /[-,]$|\b(good-quality|fresh|freshly|finely|coarsely|ripe|large|small|medium|of|or|and)$/i;
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var ln = String(lines[i]).trim();
      var prev = out.length ? out[out.length - 1] : null;
      var startsWithQty = /^[\u2022\u00b7\u25cf\u25aa*\-]?\s*(\d|a\s|an\s|one\s|two\s|three\s|half\s)/i
        .test(normalizeFractions(ln));
      var isAside = /^\(/.test(ln);
      if (prev && !startsWithQty && (isAside || DANGLE.test(prev))) {
        out[out.length - 1] = prev.replace(/[-,]$/, "") + " " + ln;
      } else {
        out.push(ln);
      }
    }
    return out;
  }

  /** Pull ingredient lines out of pasted recipe text. */
  function recipeLines(text) {
    var lines = String(text || "").split(/\r?\n/);
    var collecting = false, sawHeader = false, out = [], i, ln;

    for (i = 0; i < lines.length; i++) {
      ln = lines[i];
      if (SECTION_STOP.test(ln)) { collecting = false; continue; }
      if (SECTION_START.test(ln)) { collecting = true; sawHeader = true; continue; }
      if (collecting && ln.trim()) out.push(ln.trim());
    }

    // A header is only worth trusting if something followed it. Recipe sites'
    // print stylesheets often emit the ingredient VALUES at the top of the
    // document and leave a bare "INGREDIENTS" heading further down, directly
    // followed by "INSTRUCTIONS" -- so collecting strictly inside the section
    // yields nothing while the real list sits above, discarded as preamble.
    if (!sawHeader || !out.length) {
      out = [];
      var started = false;
      for (i = 0; i < lines.length; i++) {
        ln = lines[i];
        if (!ln.trim()) continue;
        if (SECTION_STOP.test(ln)) break;
        if (!started) { started = true; continue; }   // skip the title
        out.push(ln.trim());
      }
    }
    return stitchWrapped(joinStrandedQuantities(out));
  }

  /** First non-empty line, which is the title in every layout we handle. */
  function recipeTitle(text) {
    var lines = String(text || "").split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i].trim();
      if (ln && !SECTION_START.test(ln)) return ln;
    }
    return "";
  }

  /**
   * Analyze pasted recipe text against the ingredient table.
   *
   * Returns resolved rows AND the lines it could not resolve, because a
   * dropped ingredient makes the totals quietly wrong -- the caller is
   * expected to make the user deal with them before saving.
   */
  function analyzeRecipeText(text, servings, db) {
    db = db || {};
    servings = Number(servings) > 0 ? Number(servings) : 4;
    var lines = recipeLines(text);
    var rows = [], unresolved = [];
    var total = { fat: 0, carb: 0, fiber: 0, protein: 0, grams: 0 };

    for (var i = 0; i < lines.length; i++) {
      var item = parseIngredientLine(lines[i], db);
      if (!item) { continue; }
      var rec = item.dbKey ? db[item.dbKey] : null;

      // Nothing in the table to measure against: the user has to supply it.
      if (!rec) {
        unresolved.push({ raw: item.raw, name: item.name, reason: "not-in-table" });
        continue;
      }

      var grams = null;
      // A size the line states for each item wins over the table's default.
      var each = eachSizeGrams(item.raw);
      if (each !== null && item.amount !== null && !item.unitKind) {
        grams = item.amount * each;
      } else if (item.unitKind) {
        grams = toGrams(item.amount, item.unitKind, item.unitWord, rec);
      } else if (item.amount !== null) {
        grams = (rec.units && rec.units[""] !== undefined)
          ? item.amount * rec.units[""]
          : item.amount;                 // bare number: treat as grams
      }

      // "Dill", "Salt to taste" -- a real ingredient with no stated amount.
      // Matching analyze_recipe.py, assume a 5 g pinch and mark it, rather
      // than dropping it (which would understate) or demanding a number for
      // something that genuinely has none.
      var assumed = false;
      if (grams === null || !(grams > 0)) {
        grams = 5;
        assumed = true;
      }

      var f = grams / 100;
      var row = {
        name: item.name, dbKey: item.dbKey, grams: grams, assumed: assumed,
        fat: rec.fat * f, carb: rec.carb * f,
        fiber: rec.fiber * f, protein: rec.protein * f
      };
      row.netCarb = netCarbs(row.carb, row.fiber);
      rows.push(row);
      total.fat += row.fat; total.carb += row.carb;
      total.fiber += row.fiber; total.protein += row.protein;
      total.grams += grams;
    }

    total.netCarb = netCarbs(total.carb, total.fiber);
    total.kcal = total.fat * 9 + total.netCarb * 4 + total.protein * 4;

    var per = {};
    ["fat", "carb", "fiber", "protein", "netCarb", "kcal", "grams"].forEach(function (k) {
      per[k] = total[k] / servings;
    });

    // Split the misses: things the user should fix, and noise to ignore.
    var needsInput = [], ignored = [];
    for (var u = 0; u < unresolved.length; u++) {
      (worthAsking(unresolved[u].raw) ? needsInput : ignored).push(unresolved[u]);
    }

    // When most of what we found is unreadable, the honest answer is "this
    // didn't work" -- not a hundred questions. A scanned page with a junk
    // text layer extracts as fragments like "0c/ (D!9", each of which looks
    // like an unresolved ingredient on its own.
    var looked = rows.length + needsInput.length;
    var unusable = looked >= 6 && rows.length / looked < 0.25;

    return {
      title: recipeTitle(text),
      servings: servings,
      rows: rows,
      unresolved: needsInput,     // what to put in front of the user
      ignored: ignored,           // page furniture, dropped silently
      // The caller should ask for the ingredients to be pasted directly
      // rather than presenting the unresolved list.
      unusable: unusable,
      total: total,
      perServing: per
    };
  }

  /** Turn an analyzeRecipeText result into a saveable food record. */
  function foodFromRecipeAnalysis(a, nameOverride) {
    if (!a || !(a.perServing.grams > 0)) return null;
    var name = String(nameOverride || a.title || "Recipe").trim();
    if (!name) return null;
    var g = a.perServing.grams;
    var k = 100 / g;
    return {
      id: "recipe:" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      type: "recipe",
      name: name,
      brand: "Recipe",
      code: "",
      servingGrams: g,
      servingLabel: "1/" + a.servings + " of recipe (" + Math.round(g) + " g)",
      per100: {
        fat: a.perServing.fat * k,
        carb: a.perServing.carb * k,
        fiber: a.perServing.fiber * k,
        protein: a.perServing.protein * k,
        sugars: 0,
        kcal: a.perServing.kcal * k
      },
      nova: null,
      additives: [],
      ingredientsText: a.rows.map(function (r) { return r.name; }).join(", "),
      flags: scanIngredients(a.rows.map(function (r) { return r.name; }).join(", ")),
      image: ""
    };
  }

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
  /**
   * Apply user edits to a saved food.
   *
   * Open Food Facts product names are frequently unhelpful ("Original Sauce"
   * for A1), and roughly half of a large seed carries no ingredient list or
   * NOVA score at all -- so the user has to be able to supply both. Editing
   * the ingredients re-runs the GI watchlist, which is the whole point of
   * typing them in.
   *
   * Only the fields present in `edits` are touched; everything else on the
   * food (macros, barcode, image) is left exactly as it was. Returns null if
   * the name would end up empty -- a nameless food is unfindable.
   */
  function foodWithEdits(food, edits) {
    if (!food) return null;
    edits = edits || {};
    var out = Object.assign({}, food);

    if (edits.name !== undefined) {
      var nm = String(edits.name).trim();
      if (!nm) return null;
      out.name = nm;
    }
    if (edits.brand !== undefined) out.brand = String(edits.brand).trim();

    if (edits.servingGrams !== undefined) {
      var g = num(edits.servingGrams);
      if (g > 0) {
        out.servingGrams = g;
        // Keep the printed label honest when it was just "<n> g"; a label the
        // user wrote themselves ("2 scoops (34.5 g)") is left alone.
        if (!out.servingLabel || /^\s*1 serving \(|^\s*[\d.]+\s*g\s*$/.test(out.servingLabel)) {
          out.servingLabel = "1 serving (" + Math.round(g) + " g)";
        }
      }
    }
    if (edits.servingLabel !== undefined) {
      var lab = String(edits.servingLabel).trim();
      if (lab) out.servingLabel = lab;
    }

    if (edits.nova !== undefined) {
      var n = parseInt(edits.nova, 10);
      out.nova = (n >= 1 && n <= 4) ? n : null;
    }

    if (edits.ingredientsText !== undefined) {
      var txt = String(edits.ingredientsText).trim();
      out.ingredientsText = txt;
      // The flags ARE the ingredients, re-derived. Re-scan rather than keeping
      // whatever was computed from the old text.
      out.flags = txt ? scanIngredients(txt) : [];
    }

    out.edited = true;
    return out;
  }

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
      flags: p.flags || [],
      // Open Food Facts hosts the photo; keeping the URL lets a saved food
      // show the same thumbnail the scan did. It needs a connection to load,
      // so every use has to tolerate it not appearing.
      image: p.image || ""
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
  // ------------------------------------------------------- entry times
  // Entries have always carried loggedAt, but nothing showed or edited it.
  // Correlating what you ate against a CGM trace needs the actual clock time,
  // and logging something you forgot yesterday needs it to be settable.

  /** "7:42 AM" in the device's locale, or "" when there's no timestamp. */
  function entryTime(entry) {
    var iso = entry && entry.loggedAt;
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  /** "07:42" for an <input type="time">, or "" when there's no timestamp. */
  function entryTimeValue(entry) {
    var iso = entry && entry.loggedAt;
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return String(d.getHours()).padStart(2, "0") + ":" +
           String(d.getMinutes()).padStart(2, "0");
  }

  /**
   * Combine a YYYY-MM-DD date with an HH:MM clock time into an ISO stamp.
   *
   * Built from local parts rather than Date.parse so the result is the user's
   * wall-clock time: "2026-10-17T07:42" parsed as UTC would shift a morning
   * meal by hours and quietly ruin the CGM correlation.
   */
  function isoFromDateAndTime(dateStr, timeStr) {
    var dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ""));
    var tm = /^(\d{1,2}):(\d{2})$/.exec(String(timeStr || ""));
    if (!dm || !tm) return null;
    var h = Number(tm[1]), mi = Number(tm[2]);
    if (!(h >= 0 && h < 24) || !(mi >= 0 && mi < 60)) return null;
    var d = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), h, mi, 0, 0);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  /**
   * Earliest and latest times in a set of entries, as display strings.
   * Returns null when nothing is timestamped.
   */
  function timeRange(entries) {
    var stamps = (entries || [])
      .map(function (e) { return e && e.loggedAt; })
      .filter(Boolean)
      .map(function (iso) { return new Date(iso); })
      .filter(function (d) { return !isNaN(d.getTime()); })
      .sort(function (a, b) { return a - b; });
    if (!stamps.length) return null;
    var first = stamps[0], last = stamps[stamps.length - 1];
    var fmtT = function (d) {
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    };
    var a = fmtT(first), b = fmtT(last);
    return { from: a, to: b, text: a === b ? a : a + "\u2013" + b };
  }

  /** Meal label implied by a clock time, for an entry logged onto a past day. */
  function mealForTime(timeStr) {
    var tm = /^(\d{1,2}):(\d{2})$/.exec(String(timeStr || ""));
    if (!tm) return null;
    return guessMeal(Number(tm[1]));
  }

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
  // ----------------------------------------------------- generic foods
  // The nutrition table is already a generic-food database: per-100 g macros
  // plus typical weights for count units, so "egg" knows a large one is 50 g
  // and a small 38 g. Surfacing it in search means a plain apple or chicken
  // breast can be logged without hunting for "EGGS - Kroger - 36 oz".

  /** Prettier label for a count unit: "" is the plain item. */
  function unitLabel(u) {
    return u === "" ? "1 item" : "1 " + u;
  }

  /**
   * Generic foods matching a query, as product-shaped rows the search list
   * can render alongside barcoded hits.
   *
   * Each row carries the portion choices the table knows about, so the UI can
   * offer small/medium/large rather than demanding grams.
   */
  function searchGenericFoods(query, db) {
    var q = String(query || "").toLowerCase().trim();
    if (q.length < 2 || !db) return [];
    var out = [];
    for (var key in db) {
      if (!Object.prototype.hasOwnProperty.call(db, key)) continue;
      var rec = db[key];
      var names = [key].concat(rec.aliases || []);
      // Match on a word boundary, not a bare substring: "apple" should not
      // drag in cider vinegar, and "egg" should not pull in eggplant unless
      // the word really starts there.
      var hit = names.some(function (n) {
        var ln = String(n).toLowerCase();
        return ln === q || ln.split(/[^a-z]+/).some(function (w) { return w.indexOf(q) === 0; });
      });
      if (!hit) continue;

      // Portion choices: named count units first, then a sane gram default.
      var units = rec.units || {};
      var portions = [], seenGrams = {};
      Object.keys(units).forEach(function (u) {
        // "" is the generic fallback and usually duplicates a named size
        // ("1 item" 50 g alongside "1 large" 50 g) -- keep the named one.
        if (u === "" && Object.keys(units).length > 1) return;
        if (seenGrams[units[u]]) return;
        seenGrams[units[u]] = true;
        portions.push({ label: unitLabel(u), grams: units[u] });
      });
      portions.sort(function (a, b) { return a.grams - b.grams; });

      var serving = portions.length ? portions[0].grams : 100;
      out.push({
        code: "",
        name: key.charAt(0).toUpperCase() + key.slice(1),
        brand: "Generic",
        image: "",
        per100: {
          fat: rec.fat, carb: rec.carb, fiber: rec.fiber,
          protein: rec.protein, sugars: 0,
          kcal: rec.fat * 9 + Math.max(0, rec.carb - rec.fiber) * 4 + rec.protein * 4
        },
        servingSize: portions.length ? portions[0].label : "",
        servingGrams: serving,
        nova: null,
        additives: [],
        ingredientsText: "",
        flags: [],
        _generic: true,
        _key: key,
        _portions: portions
      });
    }
    // Shortest name first: a query for "egg" should offer "Egg" before
    // "Eggplant", and an exact match before anything else.
    out.sort(function (a, b) {
      var ae = a._key === q ? 0 : 1, be = b._key === q ? 0 : 1;
      if (ae !== be) return ae - be;
      return a._key.length - b._key.length;
    });
    return out.slice(0, 12);
  }

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
  /**
   * Is this an Amazon ASIN rather than a real product barcode?
   *
   * Amazon prints its own Code 128 label on goods it repackages, carrying an
   * ASIN ("X001RJOO83") instead of the manufacturer's UPC/EAN. Open Food
   * Facts is keyed on GTINs, so it answers "no code or invalid code" -- which
   * the app would otherwise report as a plain "not in Open Food Facts",
   * implying the entry might simply be missing and worth retrying later. It
   * never will be: there is no GTIN to find.
   *
   * B0... is the usual retail form; X00... is assigned to items that have no
   * manufacturer barcode of their own, which is exactly the case here.
   */
  function isAmazonCode(code) {
    return /^(B0[A-Z0-9]{8}|X00[A-Z0-9]{7})$/i.test(String(code || "").trim());
  }

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
    NOT_FOUND: "not-found", // reached the server; barcode genuinely unknown
    NOT_A_GTIN: "not-a-gtin" // scanned something that isn't a product barcode
  };

  var ERR_MESSAGE = {
    offline: "You're offline and this barcode isn't saved on this device. Enter it by hand below.",
    timeout: "Open Food Facts didn't respond. Check your signal, or enter it by hand.",
    network: "Couldn't reach Open Food Facts. Check your signal, or enter it by hand.",
    "not-found": "This barcode isn't in Open Food Facts. Enter it by hand below.",
    "not-a-gtin": "That's an Amazon item code, not a product barcode - no food " +
                  "database can look it up. Enter the nutrition by hand below; " +
                  "the code is saved, so scanning this pack again will find it."
  };

  function isTimeoutError(err) {
    return !!err && (err.name === "AbortError" || err.timeout === true);
  }

  /**
   * Did the server answer "no such product"? Open Food Facts replies 404 for
   * an unknown barcode, which the fetch helper surfaces as a thrown error --
   * without this, a perfectly clear "not in the database" looks identical to
   * a dropped connection, and the UI tells the user to check their signal.
   */
  function isNotFoundError(err) {
    return !!err && err.notFound === true;
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
    // No point asking Open Food Facts about an Amazon item code, and a bare
    // "not found" would misrepresent why it failed.
    if (isAmazonCode(code)) {
      return Promise.resolve({
        product: null, source: null, stale: false, offline: false,
        error: ERR.NOT_A_GTIN, message: ERR_MESSAGE[ERR.NOT_A_GTIN]
      });
    }
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
        // 404 == the server was reached and this barcode isn't in it. Treat it
        // exactly like a status-0 body: move on to the next variant, and if
        // none match, report NOT_FOUND rather than a network failure.
        if (isNotFoundError(err)) return attempt();
        return fromCache(isTimeoutError(err) ? ERR.TIMEOUT : ERR.NETWORK);
      });
    }
    return attempt();
  }

  var API = {
    APP_VERSION: APP_VERSION,
    ERR: ERR,
    ERR_MESSAGE: ERR_MESSAGE,
    isTimeoutError: isTimeoutError,
    isNotFoundError: isNotFoundError,
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
    normalizeFractions: normalizeFractions,
    parseIngredientLine: parseIngredientLine,
    matchIngredient: matchIngredient,
    toGrams: toGrams,
    eachSizeGrams: eachSizeGrams,
    recipeLines: recipeLines,
    looksLikeProse: looksLikeProse,
    worthAsking: worthAsking,
    joinStrandedQuantities: joinStrandedQuantities,
    recipeTitle: recipeTitle,
    analyzeRecipeText: analyzeRecipeText,
    foodFromRecipeAnalysis: foodFromRecipeAnalysis,
    foodFromProduct: foodFromProduct,
    foodWithEdits: foodWithEdits,
    pendingProductFood: pendingProductFood,
    parseCount: parseCount,
    formatCount: formatCount,
    portionDisplay: portionDisplay,
    shortPortionLabel: shortPortionLabel,
    barcodeVariants: barcodeVariants,
    isAmazonCode: isAmazonCode,
    MEALS: MEALS,
    MEAL_LABELS: MEAL_LABELS,
    guessMeal: guessMeal,
    groupByMeal: groupByMeal,
    entryTime: entryTime,
    entryTimeValue: entryTimeValue,
    isoFromDateAndTime: isoFromDateAndTime,
    timeRange: timeRange,
    mealForTime: mealForTime,
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
    searchGenericFoods: searchGenericFoods,
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
