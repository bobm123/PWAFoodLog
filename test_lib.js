/* SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 Robert Marchese
 */
const L = require("./lib.js");
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  [OK]   " + name); }
  else { fail++; console.log("  [FAIL] " + name + (extra ? "  -> " + extra : "")); }
}
function close(a, b, tol) { return Math.abs(a - b) <= (tol || 0.05); }

console.log("\n-- normalizeProduct on real OFF Nutella response --");
// Values confirmed from the live API for barcode 3017620422003.
const nutella = {
  code: "3017620422003", status: 1,
  product: {
    product_name: "Nutella", brands: "Ferrero",
    nova_group: 4,
    additives_tags: ["en:e322", "en:e322i"],
    ingredients_text: "Sugar, palm oil, hazelnuts 13%, skimmed milk powder 8.7%, fat-reduced cocoa 7.4%, emulsifier: lecithins (soya), vanillin.",
    serving_size: "15 g", serving_quantity: "15",
    nutriments: {
      "fat_100g": 30.9, "carbohydrates_100g": 57.5, "fiber_100g": 3.67525,
      "proteins_100g": 6.3, "sugars_100g": 56.3, "energy-kcal_100g": 539
    }
  }
};
const p = L.normalizeProduct(nutella);
ok("name parsed", p.name === "Nutella", p.name);
ok("nova_group = 4 (ultra-processed)", p.nova === 4, p.nova);
ok("additives stripped of en: prefix", p.additives[0] === "E322", p.additives.join(","));
ok("per100 carbs", close(p.per100.carb, 57.5));
ok("per100 fiber", close(p.per100.fiber, 3.675));
ok("serving grams coerced from string", p.servingGrams === 15, p.servingGrams);

console.log("\n-- net carbs --");
ok("57.5 carb - 3.675 fiber = 53.82", close(L.netCarbs(57.5, 3.67525), 53.82));
ok("never negative", L.netCarbs(2, 5) === 0);

console.log("\n-- macrosForGrams: one 15 g serving of Nutella --");
const m = L.macrosForGrams(p.per100, 15);
ok("fat 4.64 g", close(m.fat, 4.635));
ok("netCarb 8.07 g", close(m.netCarb, 8.074));
ok("kcal 80.85", close(m.kcal, 80.85, 0.1));

console.log("\n-- GI watchlist: the whole point of the app --");
const mal = L.scanIngredients("Water, maltodextrin, modified corn starch, dextrose, salt.");
const labels = mal.map(f => f.label);
ok("flags maltodextrin", labels.includes("Maltodextrin"), labels.join("|"));
ok("flags modified starch", labels.includes("Modified starch"), labels.join("|"));
ok("flags dextrose", labels.includes("Dextrose"), labels.join("|"));
ok("all three are 'high' severity", mal.slice(0,3).every(f => f.severity === "high"));
ok("high severity sorted first", mal[0].severity === "high");

// Nutella has sugar but NOT maltodextrin - guard against false positives.
const nf = p.flags.map(f => f.label);
ok("Nutella: no maltodextrin false-positive", !nf.includes("Maltodextrin"), nf.join("|"));

const clean = L.scanIngredients("Sardines, water, salt.");
ok("clean label -> zero flags", clean.length === 0, JSON.stringify(clean));

// "corn syrup solids" must not double-match the plain corn syrup rule
const css = L.scanIngredients("corn syrup solids").map(f => f.label);
ok("corn syrup solids matched once", css.length === 1 && css[0] === "Corn syrup solids", css.join("|"));

console.log("\n-- dailyTotals --");
const tot = L.dailyTotals([
  { macros: { fat: 10, carb: 20, fiber: 5, protein: 8, netCarb: 15, kcal: 200 } },
  { macros: { fat: 5,  carb: 10, fiber: 2, protein: 4, netCarb: 8,  kcal: 100 } }
]);
ok("fat summed", close(tot.fat, 15));
ok("netCarb summed", close(tot.netCarb, 23));
ok("kcal summed", close(tot.kcal, 300));
ok("split sums to exactly 100%", close(tot.split.fat + tot.split.carb + tot.split.protein, 100, 0.001),
   (tot.split.fat + tot.split.carb + tot.split.protein).toFixed(3));
ok("label kcal (300) preserved for counting", close(tot.kcal, 300));
ok("macroKcal is Atwater sum (275), not label", close(tot.macroKcal, 275));
ok("split uses macroKcal denominator", close(tot.split.fat, 135/275*100));
ok("kcal estimated when null", close(L.dailyTotals([{macros:{fat:10,netCarb:0,protein:0,kcal:null}}]).kcal, 90));

console.log("\n-- recipeFromAnalyzerJson (keto sardine cakes, real numbers) --");
const r = L.recipeFromAnalyzerJson({
  title: "Keto Savory Sardine Cakes", servings: 4,
  per_serving: { fat: 29.5, carb: 5.775, fiber: 1.175, protein: 25.2, net_carb: 4.6, kcal: 386, grams: 192.5 }
});
ok("name carried", r.name === "Keto Savory Sardine Cakes");
ok("serving grams", close(r.servingGrams, 192.5));
ok("round-trips back to per-serving fat", close(L.macrosForGrams(r.per100, r.servingGrams).fat, 29.5, 0.01));
ok("round-trips back to per-serving netCarb", close(L.macrosForGrams(r.per100, r.servingGrams).netCarb, 4.6, 0.01));
ok("treated as unprocessed (nova 1)", r.nova === 1);

console.log("\n-- unknown barcode --");
ok("status 0 -> null", L.normalizeProduct({ status: 0 }) === null);
ok("garbage -> null", L.normalizeProduct(null) === null);

console.log("\n-- quickEntryMacros: one-off hand-typed diary entry --");
const q = L.quickEntryMacros(150, { fat: 12, carb: 9, fiber: 3, protein: 20 });
ok("grams carried", q.grams === 150);
ok("netCarb = carb - fiber", close(q.netCarb, 6));
ok("kcal null so Atwater is used later", q.kcal === null);
ok("totals estimate kcal (12*9 + 6*4 + 20*4 = 212)",
   close(L.dailyTotals([{ macros: q }]).kcal, 212));
const qz = L.quickEntryMacros(100, {});
ok("empty macros -> all zeros, no NaN", qz.fat === 0 && qz.netCarb === 0 && !isNaN(qz.protein));
const qn = L.quickEntryMacros(100, { carb: 2, fiber: 9 });
ok("fiber > carb never goes negative", qn.netCarb === 0);
const qs = L.quickEntryMacros("150", { fat: "10" });
ok("string inputs coerced", qs.grams === 150 && qs.fat === 10);

console.log("\n-- barcodeVariants (UPC-A vs EAN-13 leading zero) --");
const v12 = L.barcodeVariants("012345678905");
ok("12-digit UPC tries padded 13-digit", v12.length === 2 && v12[1] === "0012345678905", v12.join("|"));
const v13 = L.barcodeVariants("0012345678905");
ok("13-digit w/ leading 0 tries stripped", v13.includes("012345678905"), v13.join("|"));
const v8 = L.barcodeVariants("20161512");
ok("EAN-8 left alone", v8.length === 1, v8.join("|"));
ok("nutella EAN-13 untouched", L.barcodeVariants("3017620422003").length === 1);

console.log("\n-- foodFromProduct: save a scanned product for re-logging --");
const prod = L.normalizeProduct(nutella);
const pf = L.foodFromProduct(prod);
ok("id keyed by barcode (idempotent re-save)", pf.id === "product:3017620422003", pf.id);
ok("type is product", pf.type === "product");
ok("name + brand carried", pf.name === "Nutella" && pf.brand === "Ferrero");
ok("code carried", pf.code === "3017620422003");
ok("serving grams from product (15 g)", close(pf.servingGrams, 15));
ok("per100 preserved so logging matches the card", close(pf.per100.carb, 57.5) && close(pf.per100.fiber, 3.675));
ok("nova + flags carried", pf.nova === 4 && Array.isArray(pf.flags));
ok("logging a serving round-trips macros", close(L.macrosForGrams(pf.per100, pf.servingGrams).fat, 4.635, 0.01));
const pf2 = L.foodFromProduct({ name: "No Barcode Item", per100: { carb: 10 } });
ok("no-barcode falls back to a name slug", pf2.id === "product:no-barcode-item", pf2.id);
ok("missing serving defaults to 100 g", pf2.servingGrams === 100);

console.log("\n-- pendingProductFood: offline barcode capture --");
const pp = L.pendingProductFood("1234567890");
ok("pending flag set", pp.pending === true);
ok("keyed by barcode (same id as the resolved product)", pp.id === "product:1234567890");
ok("code carried, zero macros until filled", pp.code === "1234567890" && pp.per100.carb === 0);
ok("has a placeholder name", /1234567890/.test(pp.name));

console.log("\n-- nutritionMissing: empty table vs real zeros (the A1 duplicate bug) --");
// A real crowdsourced failure mode: ingredients present, nutrition table EMPTY.
const a1dupe = L.normalizeProduct({
  code: "0054400000092", status: 1,
  product: { product_name: "Original Sauce", brands: "A.1.", nova_group: 4,
    ingredients_text: "Tomato puree, vinegar, corn syrup, salt, raisin paste",
    nutriments: {} }
});
ok("empty nutriments -> nutritionMissing", a1dupe.nutritionMissing === true);
ok("hasNutrition false for the empty record", L.hasNutrition(a1dupe) === false);
ok("GI flags still computed from ingredients", a1dupe.flags.some(f => f.label === "Glucose/corn syrup"));
// Water: explicit zeros are DATA, not absence. Must not warn.
const water = L.normalizeProduct({
  code: "0011110000001", status: 1,
  product: { product_name: "Spring Water",
    nutriments: { "energy-kcal_100g": 0, fat_100g: 0, carbohydrates_100g: 0, proteins_100g: 0 } }
});
ok("explicit zeros -> nutrition present", water.nutritionMissing === false);
ok("hasNutrition true for water", L.hasNutrition(water) === true);
ok("nutella record has nutrition", L.hasNutrition(p) === true);
// legacy cached objects (no flag): zero-macro heuristic
ok("legacy all-zero object -> treated as missing", L.hasNutrition({ per100: { fat: 0, carb: 0, protein: 0, kcal: 0 } }) === false);
ok("legacy nonzero object -> fine", L.hasNutrition({ per100: { fat: 0, carb: 3, protein: 0, kcal: 15 } }) === true);
ok("null -> false", L.hasNutrition(null) === false);

console.log("\n-- productWithNutrition: correct-from-label (A1: 1 tbsp = 17 g, 3 g carb, 15 kcal) --");
const fixed = L.productWithNutrition(a1dupe, 17, { kcal: 15, fat: 0, carb: 3, fiber: 0, protein: 0 });
ok("per100 carb ~17.6", close(fixed.per100.carb, 17.647, 0.01), fixed.per100.carb);
ok("per100 kcal ~88.2", close(fixed.per100.kcal, 88.235, 0.01), fixed.per100.kcal);
ok("serving grams recorded", fixed.servingGrams === 17);
ok("flag cleared + marked corrected", fixed.nutritionMissing === false && fixed.corrected === true);
ok("hasNutrition true after fix", L.hasNutrition(fixed) === true);
ok("identity preserved (name/code/nova/flags)", fixed.code === a1dupe.code && fixed.name === "Original Sauce" &&
   fixed.nova === 4 && fixed.flags.length === a1dupe.flags.length);
ok("original object untouched", a1dupe.nutritionMissing === true && a1dupe.per100.carb === 0);
const m17 = L.macrosForGrams(fixed.per100, 17);
ok("one tbsp logs 3.0 g net carbs", close(m17.netCarb, 3, 0.01), m17.netCarb);
ok("one tbsp logs 15 kcal", close(m17.kcal, 15, 0.05), m17.kcal);
// kcal blank -> Atwater estimate from macros
const atw = L.productWithNutrition(a1dupe, 17, { kcal: "", fat: 0, carb: 3, fiber: 0, protein: 0 });
ok("blank kcal -> Atwater (3*4=12 per serving)", close(L.macrosForGrams(atw.per100, 17).kcal, 12, 0.05));
ok("bad serving weight -> null", L.productWithNutrition(a1dupe, 0, { carb: 3 }) === null);

console.log("\n-- parseCount: portions the way people type them --");
ok("plain integer", L.parseCount("2") === 2);
ok("decimal", L.parseCount("0.5") === 0.5);
ok("simple fraction", close(L.parseCount("1/2"), 0.5));
ok("mixed number", close(L.parseCount("1 1/2"), 1.5));
ok("three quarters", close(L.parseCount("3/4"), 0.75));
ok("unicode half", close(L.parseCount("½"), 0.5));
ok("one-and-a-half unicode", close(L.parseCount("1½"), 1.5));
ok("number passthrough", L.parseCount(2.5) === 2.5);
ok("zero rejected", L.parseCount("0") === 0);
ok("negative rejected", L.parseCount("-1") === 0);
ok("garbage rejected", L.parseCount("a lot") === 0);
ok("blank rejected", L.parseCount("") === 0 && L.parseCount(null) === 0);
ok("divide-by-zero fraction rejected", L.parseCount("1/0") === 0);

console.log("\n-- portion display + labels --");
ok("2 x egg", L.portionDisplay(2, "1 egg") === "2 × 1 egg");
ok("fractional count formats compactly", L.portionDisplay(0.5, "1/6 of recipe") === "0.5 × 1/6 of recipe");
ok("thirds round to 2dp", L.formatCount(4 / 3) === "1.33");
ok("strip gram parenthetical", L.shortPortionLabel("1 egg (50 g)") === "1 egg");
ok("strip compact grams", L.shortPortionLabel("1 cup (170g)") === "1 cup");
ok("label without grams unchanged", L.shortPortionLabel("1 tbsp") === "1 tbsp");
ok("empty label falls back", L.shortPortionLabel("") === "serving");

console.log("\n-- recipe import: servings -> '1/N of recipe' portion --");
const shak = L.recipeFromAnalyzerJson({
  title: "Huevos Shakshukos", servings: 6,
  per_serving: { grams: 235, kcal: 174, fat: 9, carb: 12, fiber: 3, protein: 10 },
  ingredients: [{ name: "eggs" }, { name: "refried beans" }]
});
ok("servings=6 -> 1/6 of recipe label", shak.servingLabel === "1/6 of recipe (235 g)", shak.servingLabel);
ok("no servings -> plain serving label",
   L.recipeFromAnalyzerJson({ title: "X", per_serving: { grams: 100, fat: 1, carb: 1, fiber: 0, protein: 1, kcal: 17 } })
     .servingLabel === "1 serving (100 g)");

console.log("\n-- recipe text parsing (OCR-tolerant) --");
const NDB = require("./nutrition-db.js").DB;
const ADB = require("./additives-db.js").DB;

// Vulgar fractions: iOS Live Text emits these, and dropping one turns a
// quantity into a 5 g pinch -- a confidently wrong number, not a visible error.
ok("bare vulgar fraction", L.normalizeFractions("\u00be cup sugar") === "3/4 cup sugar",
   L.normalizeFractions("\u00be cup sugar"));
ok("mixed number keeps a space", L.normalizeFractions("1\u215b ounces") === "1 1/8 ounces",
   L.normalizeFractions("1\u215b ounces"));
ok("fraction slash normalized", L.normalizeFractions("1\u20442") === "1/2",
   L.normalizeFractions("1\u20442"));
ok("plain text untouched", L.normalizeFractions("2 large eggs") === "2 large eggs");

// The quantity must actually survive into grams.
const sugarLine = L.parseIngredientLine("\u00be cup sugar", NDB);
ok("vulgar fraction yields an amount", sugarLine.amount === 0.75, sugarLine.amount);
ok("unit recognised", sugarLine.unitKind === "volume" && sugarLine.unitWord === "cup");
ok("matched to the table", sugarLine.dbKey === "sugar", sugarLine.dbKey);

// "tbs" is in analyze_recipe.py; omitting it silently dropped almond flour.
const tbs = L.parseIngredientLine("3 tbs. almond flour", NDB);
ok("'tbs.' is a volume unit", tbs.unitKind === "volume", tbs.unitKind + "/" + tbs.unitWord);
ok("almond flour resolves", tbs.dbKey === "almond flour", tbs.dbKey);

// OCR wraps a narrow column mid-ingredient; the tail has no quantity.
const wrapped = L.recipeLines([
  "Title",
  "3 tablespoons good-quality",
  "freeze-dried coffee",
  "2 large eggs"
].join("\n"));
ok("wrapped line is stitched", wrapped[0] === "3 tablespoons good-quality freeze-dried coffee",
   JSON.stringify(wrapped[0]));
ok("next ingredient stays separate", wrapped[1] === "2 large eggs", JSON.stringify(wrapped[1]));

const aside = L.recipeLines(["Title", "4 original Heath Bars", "(1 1/8 ounces each)"].join("\n"));
ok("parenthetical aside joins the line above",
   aside.length === 1 && /Heath Bars \(1 1\/8 ounces each\)/.test(aside[0]), JSON.stringify(aside));

// Bullets from a scraped page.
const bullets = L.recipeLines(["Title", "\u2022 2 large eggs", "\u2022 1 cup milk"].join("\n"));
ok("bulleted lines are kept", bullets.length === 2, JSON.stringify(bullets));
const bulletItem = L.parseIngredientLine("\u2022 2 large eggs", NDB);
ok("bullet stripped before parsing", bulletItem.dbKey === "egg", bulletItem.dbKey);

// Full analysis must match analyze_recipe.py, which is the reference.
const FISHCAKES = [
  "Keto Savory Sardine Cakes",
  "",
  "Ingredients:",
  "2 8 oz. cans of sardines",
  "3 eggs",
  "1 medium Onion",
  "3 tbs. almond flour",
  "Dill",
  "",
  "Preparation:",
  "Mix and fry."
].join("\n");
const fc = L.analyzeRecipeText(FISHCAKES, 4, NDB);
ok("title read from the first line", fc.title === "Keto Savory Sardine Cakes", fc.title);
ok("prep section ignored", fc.rows.every(r => !/mix and fry/i.test(r.name)));
ok("nothing unresolved in a clean recipe", fc.unresolved.length === 0,
   JSON.stringify(fc.unresolved));
ok("quantity-less ingredient is assumed, not dropped",
   fc.rows.some(r => r.name === "Dill" && r.assumed === true),
   JSON.stringify(fc.rows.map(r => r.name)));

// An ingredient the table doesn't know must surface, not vanish: a silent
// drop is what makes the per-serving numbers quietly wrong. (Heath bars were
// the example here until they were added to the table.)
const HEATH = [
  "Coffee Heath Bar Crunch",
  "4 sprigs galangal root",
  "2 large eggs",
  "\u00be cup sugar"
].join("\n");
const h = L.analyzeRecipeText(HEATH, 8, NDB);
ok("unknown ingredient is reported", h.unresolved.length === 1, JSON.stringify(h.unresolved));
ok("reported with a reason", h.unresolved[0].reason === "not-in-table", h.unresolved[0].reason);
ok("known ingredients still counted", h.rows.length === 2, h.rows.length);
ok("sugar counted by volume, not as a pinch",
   h.rows.some(r => r.dbKey === "sugar" && r.grams > 100),
   JSON.stringify(h.rows.map(r => r.dbKey + ":" + Math.round(r.grams))));

// Saveable record.
const rfood = L.foodFromRecipeAnalysis(fc);
ok("recipe food has an id", /^recipe:/.test(rfood.id), rfood.id);
ok("serving label names the fraction", /^1\/4 of recipe/.test(rfood.servingLabel), rfood.servingLabel);
ok("per100 is derived from the serving", rfood.per100.protein > 0);
ok("name can be overridden",
   L.foodFromRecipeAnalysis(fc, "My Cakes").name === "My Cakes");
ok("empty analysis yields nothing", L.foodFromRecipeAnalysis(null) === null);


console.log("\n-- stated per-item sizes --");
// "4 Heath Bars (1 1/8 ounces each)" is 128 g, but the table's generic bar is
// 39 g -- trusting the table overstates it by 22%. A size the line states for
// itself always wins.
ok("ounces each", Math.abs(L.eachSizeGrams("4 original Heath Bars (1 1/8 ounces each)") - 31.9) < 0.5,
   L.eachSizeGrams("4 original Heath Bars (1 1/8 ounces each)"));
ok("oz each", Math.abs(L.eachSizeGrams("2 cans (14 oz each) tomatoes") - 396.9) < 0.5);
ok("grams each", L.eachSizeGrams("3 bars (50 g each) chocolate") === 50);
ok("no 'each' means no per-item size", L.eachSizeGrams("2 cans (14 oz) tomatoes") === null);
ok("plain count is unaffected", L.eachSizeGrams("4 Heath Bars") === null);
ok("a volume is unaffected", L.eachSizeGrams("1 1/2 cups flour") === null);

const BARS = L.analyzeRecipeText(
  ["Candy", "4 original Heath Bars (1 1/8 ounces each)"].join("\n"), 1, NDB);
ok("stated size beats the table default",
   Math.abs(BARS.rows[0].grams - 127.6) < 1, BARS.rows[0] && BARS.rows[0].grams);

// Ingredients the Heath Bar page needed.
ok("table knows toffee bars", L.matchIngredient("Heath Bars", NDB) === "toffee candy bar",
   L.matchIngredient("Heath Bars", NDB));
ok("table knows instant coffee",
   L.matchIngredient("freeze-dried coffee", NDB) === "instant coffee",
   L.matchIngredient("freeze-dried coffee", NDB));
// Granules are light; a water-like density would turn 3 tbsp into ~44 g.
const COFFEE = L.analyzeRecipeText(
  ["X", "3 tablespoons freeze-dried coffee"].join("\n"), 1, NDB);
ok("instant coffee uses a granule density",
   COFFEE.rows[0].grams < 10, COFFEE.rows[0] && COFFEE.rows[0].grams);


console.log("\n-- unresolved gate (what to ask the user) --");
// Across a 91-recipe corpus, ~90% of unmatched lines were page furniture.
// Listing those would bury the few real misses, so only food-shaped lines
// reach the user.
[
  "1/4 cup mirin",
  "2 Tbs. capers, rinsed",
  "3 quarts water",
  "1 lemon grass stalk, smashed",
  "1 (21 ounce) can cherry pie filling",
  "4 radishes, trimmed and sliced thin"
].forEach(function (t) {
  ok("asks about: " + t.slice(0, 34), L.worthAsking(t) === true, t);
});

[
  "AT A GLANCE", "PREP", "FROM OUR SPONSORS", "15 mins. to 20 mins.",
  "58 COMMENTS", "20 Photos \u00b7 Updated 9 months ago", "6 servings",
  "4 of 5", "77mg", "12%DV", "294kcal", "2/1/14, 3:45 PM",
  "____________", "http://example.com/recipe", "cook (at) example.com",
  "6RXUFHKWWSGHHSVRXWKGLVKFRP", "2. Recipes to Make Now"
].forEach(function (t) {
  ok("ignores: " + t.slice(0, 34), L.worthAsking(t) === false, t);
});

// A generic modifier must not be enough to claim a match: sharing "powder"
// once made every unknown "<x> powder" resolve to baking powder and quietly
// contribute its macros.
["chili powder", "wasabi powder", "protein powder", "curry powder"].forEach(function (t) {
  ok("no false match: " + t, L.matchIngredient(t, NDB) === null, L.matchIngredient(t, NDB));
});
["baking powder", "cocoa powder", "vanilla extract", "ice water", "dried oregano"]
  .forEach(function (t) {
    ok("still matches: " + t, !!L.matchIngredient(t, NDB), t);
  });

// Ingredients the corpus asked for most often.
["water", "vanilla extract", "baking soda", "baking powder", "yeast",
 "oregano", "basil", "ginger", "nutmeg", "buttermilk"].forEach(function (k) {
  ok("table has " + k, !!NDB[k], k);
});

// Garbage in, honest answer out: a scanned page with a junk text layer
// extracts as fragments, each looking like an unresolved ingredient. Better
// to say "couldn't read this" than to ask a hundred questions.
const JUNK = ["Recipe", "0c/ (D!9", "0q", "3.X0a", "30(D", "3<", "0)qJ", "9aF.",
              "3E-.P", "1- -_!v"].join("\n");
const junkResult = L.analyzeRecipeText(JUNK, 4, NDB);
ok("junk text flagged unusable", junkResult.unusable === true,
   junkResult.rows.length + " resolved / " + junkResult.unresolved.length + " asked");

const CLEAN = ["Scones", "2 cups flour", "1/2 cup sugar", "2 large eggs",
               "1 cup milk", "1/2 teaspoon salt", "2 teaspoons baking powder"].join("\n");
const cleanResult = L.analyzeRecipeText(CLEAN, 8, NDB);
ok("a clean recipe is not flagged", cleanResult.unusable === false);
ok("clean recipe resolves everything", cleanResult.unresolved.length === 0,
   JSON.stringify(cleanResult.unresolved));

// Furniture is dropped, not silently counted as food.
const NOISY = ["Biscuits", "AT A GLANCE", "PREP", "20 mins.", "2 cups flour",
               "FROM OUR SHOP", "1/2 cup butter"].join("\n");
const noisy = L.analyzeRecipeText(NOISY, 4, NDB);
ok("furniture goes to ignored", noisy.ignored.length > 0, noisy.ignored.length);
ok("furniture is not asked about", noisy.unresolved.length === 0,
   JSON.stringify(noisy.unresolved));
ok("real ingredients still resolve", noisy.rows.length === 2,
   JSON.stringify(noisy.rows.map(function (r) { return r.dbKey; })));


console.log("\n-- foodWithEdits --");
const EDIT_BASE = {
  id: "product:1", type: "product", name: "Original Sauce", brand: "", code: "1",
  servingGrams: 100, servingLabel: "1 serving (100 g)",
  per100: { fat: 1, carb: 2, fiber: 1, protein: 3, sugars: 0, kcal: 30 },
  nova: null, additives: [], ingredientsText: "", flags: [], image: "x.jpg"
};
const renamed = L.foodWithEdits(EDIT_BASE, { name: "  A1 Sauce  " });
ok("renames and trims", renamed.name === "A1 Sauce", renamed.name);
ok("leaves macros alone", renamed.per100.carb === 2);
ok("leaves barcode and image alone", renamed.code === "1" && renamed.image === "x.jpg");
ok("marks the record edited", renamed.edited === true);
ok("does not mutate the original", EDIT_BASE.name === "Original Sauce");

ok("empty name is rejected", L.foodWithEdits(EDIT_BASE, { name: "   " }) === null);
ok("null food is rejected", L.foodWithEdits(null, { name: "x" }) === null);

const novaSet = L.foodWithEdits(EDIT_BASE, { nova: "4" });
ok("accepts a NOVA score", novaSet.nova === 4, novaSet.nova);
ok("rejects out-of-range NOVA", L.foodWithEdits(EDIT_BASE, { nova: "9" }).nova === null);
ok("blank NOVA clears to null", L.foodWithEdits(EDIT_BASE, { nova: "" }).nova === null);

// Typing ingredients is what makes the GI flags work -- they must re-derive.
const withIng = L.foodWithEdits(EDIT_BASE, { ingredientsText: "tomato puree, maltodextrin, salt" });
ok("stores the ingredients", /maltodextrin/.test(withIng.ingredientsText));
ok("recomputes GI flags from the new text", withIng.flags.length > 0, withIng.flags.length);
ok("flags the high-GI hit", withIng.flags.some(f => /maltodextrin/i.test(f.label)),
   JSON.stringify(withIng.flags.map(f => f.label)));
const cleared = L.foodWithEdits(withIng, { ingredientsText: "" });
ok("clearing ingredients clears the flags", cleared.flags.length === 0);

const regrammed = L.foodWithEdits(EDIT_BASE, { servingGrams: 17 });
ok("updates serving grams", regrammed.servingGrams === 17);
ok("refreshes an auto-generated label", regrammed.servingLabel === "1 serving (17 g)", regrammed.servingLabel);
const custom = L.foodWithEdits(
  Object.assign({}, EDIT_BASE, { servingLabel: "2 scoops (34.5 g)" }), { servingGrams: 40 });
ok("keeps a hand-written label", custom.servingLabel === "2 scoops (34.5 g)", custom.servingLabel);
ok("ignores a zero serving", L.foodWithEdits(EDIT_BASE, { servingGrams: 0 }).servingGrams === 100);

ok("untouched fields stay untouched", L.foodWithEdits(EDIT_BASE, {}).name === "Original Sauce");

console.log("\n-- run-together ingredient lines --");
// Some documents collapse the whole list onto one line. As a single item it
// is far too long to look like an ingredient, so it was dropped and the
// recipe appeared to contain nothing at all.
const RUN = L.splitRunTogether(
  "1 pound Maryland jumbo lump crab meat 1 tablespoon fresh parsley 3 teaspoons Old Bay");
ok("splits into each ingredient", RUN.length === 3, JSON.stringify(RUN));
ok("first piece intact", RUN[0] === "1 pound Maryland jumbo lump crab meat", RUN[0]);
ok("last piece intact", RUN[2] === "3 teaspoons Old Bay", RUN[2]);

// A bracketed amount describes the ingredient already named.
ok("bracketed weight is not a split point",
   L.splitRunTogether("2 cups unbleached all-purpose flour (10 ounces), plus more").length === 1);
ok("bracketed aside with a mixed number stays whole",
   L.splitRunTogether("1 1/2 cups fresh blueberries (about 7 1/2 ounces), picked over").length === 1);
// A mixed number is one quantity: splitting inside it produced "1" / "1/2 cups".
ok("mixed numbers are not split mid-number",
   L.splitRunTogether("2 1/2 cups flour 1 1/2 cups sugar").length === 2,
   JSON.stringify(L.splitRunTogether("2 1/2 cups flour 1 1/2 cups sugar")));
ok("an ordinary ingredient is left alone",
   L.splitRunTogether("1 large onion, chopped into 4 pieces and set aside").length === 1);
ok("a short line is never split", L.splitRunTogether("2 large eggs").length === 1);

// Fragments the split leaves behind, and yields, are not worth asking about.
ok("yield is not an ingredient", L.worthAsking("12 biscuits") === false);
ok("purpose-only tail is ignored", L.worthAsking("1 tablespoon for sprinkling") === false);
ok("a real ingredient still asks",
   L.worthAsking("1 tablespoon kirsch (cherry brandy)") === true);


console.log("\n-- entry times (CGM correlation) --");
const STAMP = new Date(2026, 9, 17, 7, 42).toISOString();
ok("time renders", /7:42/.test(L.entryTime({ loggedAt: STAMP })), L.entryTime({ loggedAt: STAMP }));
ok("time input value", L.entryTimeValue({ loggedAt: STAMP }) === "07:42",
   L.entryTimeValue({ loggedAt: STAMP }));
ok("no stamp renders empty", L.entryTime({}) === "");
ok("no stamp has no input value", L.entryTimeValue({}) === "");

// Built from local parts, not Date.parse: parsing "...T07:42" as UTC would
// shift a breakfast by hours and ruin the comparison against a CGM trace.
const ISO = L.isoFromDateAndTime("2026-10-17", "07:42");
ok("date+time round-trips to the same clock time",
   L.entryTimeValue({ loggedAt: ISO }) === "07:42", ISO);
ok("rejects a bad time", L.isoFromDateAndTime("2026-10-17", "25:00") === null);
ok("rejects a bad date", L.isoFromDateAndTime("nope", "07:42") === null);

const SPAN = L.timeRange([
  { loggedAt: new Date(2026, 9, 17, 7, 42).toISOString() },
  { loggedAt: new Date(2026, 9, 17, 7, 55).toISOString() }
]);
ok("range spans first to last", /7:42/.test(SPAN.text) && /7:55/.test(SPAN.text), SPAN.text);
ok("single entry shows one time",
   L.timeRange([{ loggedAt: STAMP }]).text.indexOf("\u2013") === -1,
   L.timeRange([{ loggedAt: STAMP }]).text);
ok("untimed entries give no range", L.timeRange([{}, {}]) === null);
ok("meal inferred from a time", L.mealForTime("07:42") === "breakfast", L.mealForTime("07:42"));
ok("evening is dinner", L.mealForTime("19:10") === "dinner", L.mealForTime("19:10"));

console.log("\n-- generic foods --");
// The nutrition table doubles as a generic-food database, so an egg or an
// apple can be logged without hunting down a supermarket barcode.
const EGGS = L.searchGenericFoods("egg", NDB);
ok("finds the generic egg", EGGS.length > 0 && EGGS[0]._key === "egg",
   EGGS.length ? EGGS[0]._key : "(none)");
ok("marked generic", EGGS[0]._generic === true);
ok("offers small/medium/large",
   EGGS[0]._portions.map(function (p) { return p.label; }).join(",") ===
   "1 small,1 medium,1 large",
   JSON.stringify(EGGS[0]._portions));
ok("portion weights are real", EGGS[0]._portions[2].grams === 50, EGGS[0]._portions[2].grams);
ok("carries per-100g macros", EGGS[0].per100.protein > 10, EGGS[0].per100.protein);

ok("exact match ranks first", L.searchGenericFoods("apple", NDB)[0]._key === "apple",
   L.searchGenericFoods("apple", NDB)[0]._key);
ok("multi-word query works",
   L.searchGenericFoods("chicken breast", NDB)[0]._key === "chicken breast");
ok("a one-letter query is ignored", L.searchGenericFoods("e", NDB).length === 0);
// Word-boundary matching: "apple" must not be swamped by unrelated entries
// that merely contain the letters.
ok("no bare-substring noise",
   L.searchGenericFoods("egg", NDB).every(function (g) { return /egg/.test(g._key); }),
   JSON.stringify(L.searchGenericFoods("egg", NDB).map(function (g) { return g._key; })));
// "" duplicates a named size for eggs (both 50 g); keep the named one.
ok("duplicate portion weights are collapsed",
   new Set(EGGS[0]._portions.map(function (p) { return p.grams; })).size ===
   EGGS[0]._portions.length);


console.log("\n-- meal schedules --");
// "Breakfast/lunch/dinner" means nothing to someone eating OMAD, so a
// schedule is a list of named time slots and grouping is derived from each
// entry's timestamp. Nothing stored on the entry is rewritten.
function atTime(h, mi) {
  return {
    loggedAt: new Date(2026, 9, 17, h, mi).toISOString(),
    meal: "lunch",
    macros: { grams: 100, fat: 1, carb: 2, fiber: 0, protein: 1, netCarb: 2, kcal: 20 }
  };
}
const DAY = [atTime(7, 42), atTime(13, 15), atTime(18, 30), atTime(21, 30)];

ok("default schedule is usable", L.DEFAULT_SCHEDULE.length >= 3);
ok("presets exist", Object.keys(L.SCHEDULE_PRESETS).length >= 4,
   Object.keys(L.SCHEDULE_PRESETS).join(","));

const CLASSIC = L.groupBySchedule(DAY, L.SCHEDULE_PRESETS.classic.slots);
ok("classic splits the day up", CLASSIC.length === 4,
   CLASSIC.map(function (g) { return g.label; }).join(","));
ok("breakfast first", CLASSIC[0].label === "Breakfast", CLASSIC[0].label);

const OMAD = L.groupBySchedule(DAY, L.SCHEDULE_PRESETS.omad.slots);
ok("OMAD collapses the same entries", OMAD.length < CLASSIC.length,
   OMAD.map(function (g) { return g.label + "(" + g.entries.length + ")"; }).join(","));
ok("the meal slot is named", OMAD.some(function (g) { return g.label === "Meal"; }));

const HOBBIT = L.groupBySchedule(DAY, L.SCHEDULE_PRESETS.hobbit.slots);
ok("hobbit naming applies", HOBBIT.some(function (g) { return g.label === "Luncheon"; }),
   HOBBIT.map(function (g) { return g.label; }).join(","));

// The whole point: changing the schedule must not touch the data.
ok("entries keep their stored meal name",
   DAY.every(function (e) { return e.meal === "lunch"; }));
ok("entries keep their timestamp",
   L.entryTimeValue(DAY[0]) === "07:42", L.entryTimeValue(DAY[0]));

// Slot lookup.
ok("time lands in the right slot",
   L.slotForTime("13:15", L.SCHEDULE_PRESETS.classic.slots).label === "Lunch",
   L.slotForTime("13:15", L.SCHEDULE_PRESETS.classic.slots).label);
ok("before the first slot falls to the last",
   L.slotForTime("01:00", L.SCHEDULE_PRESETS.classic.slots).label === "Evening",
   L.slotForTime("01:00", L.SCHEDULE_PRESETS.classic.slots).label);

// A corrupt or empty setting must never leave the diary unable to group.
ok("empty schedule falls back", L.normalizeSchedule([]).length > 0);
ok("invalid times are dropped",
   L.normalizeSchedule([{ id: "a", label: "A", start: "99:99" }]).length ===
   L.DEFAULT_SCHEDULE.length);
ok("slots are sorted by start time",
   L.normalizeSchedule([
     { id: "b", label: "Late", start: "20:00" },
     { id: "a", label: "Early", start: "06:00" }
   ])[0].label === "Early");

// An untimed entry can't be placed by clock, so it must still show up.
const MIXED = L.groupBySchedule([atTime(8, 0), { meal: "lunch", macros: { grams: 1, netCarb: 0, kcal: 0 } }],
                                L.SCHEDULE_PRESETS.classic.slots);
ok("untimed entries are not lost",
   MIXED.reduce(function (n, g) { return n + g.entries.length; }, 0) === 2,
   JSON.stringify(MIXED.map(function (g) { return g.label + ":" + g.entries.length; })));


console.log("\n-- extraction whitespace and titles --");
// PDF and web extraction emit separators that look like spaces but are not
// matched by \\s: one U+2028 inside an ingredient list stopped the
// run-together splitter firing, so a whole recipe resolved to nothing.
// 37 of 91 corpus files carried at least one of these.
ok("U+00A0 becomes a space",
   L.normalizeWhitespace("a\u00a0b") === "a b");
ok("U+202F becomes a space",
   L.normalizeWhitespace("a\u202fb") === "a b");
ok("U+2028 becomes a newline",
   L.normalizeWhitespace("a\u2028b") === "a\nb");
ok("zero-width space is removed",
   L.normalizeWhitespace("a\u200bb") === "ab");
ok("ordinary text is untouched",
   L.normalizeWhitespace("2 cups flour") === "2 cups flour");

// The real failure: a line glued together with a U+2028 in the middle.
const GLUED = "Soup\n1 pound crab meat\u20281 tablespoon parsley 3 teaspoons Old Bay";
const GL = L.recipeLines(GLUED);
ok("a U+2028 no longer hides the ingredients", GL.length >= 2,
   JSON.stringify(GL));

// "First non-empty line" names a printed web page after its date.
ok("a print date is not the title",
   L.recipeTitle("3/8/2017\nBlueberry Scones") === "Blueberry Scones",
   L.recipeTitle("3/8/2017\nBlueberry Scones"));
ok("a URL is not the title",
   L.recipeTitle("https://example.com/r/1\nChicken Soup") === "Chicken Soup");
ok("a page marker is not the title",
   L.recipeTitle("1/3\nBeef Stew") === "Beef Stew",
   L.recipeTitle("1/3\nBeef Stew"));
ok("a normal title still wins",
   L.recipeTitle("Keto Sardine Cakes\n2 eggs") === "Keto Sardine Cakes");
ok("all-furniture falls back rather than going blank",
   L.recipeTitle("3/8/2017") === "3/8/2017");


console.log("\n-- my shops (store filtering) --");
// Searching "italian sausage" returned 91 products from chains all over the
// country; the one in your hand was somewhere down the list. Picking the
// shops near you cuts that to a few. Geographic, not behavioural -- tick
// another chain when you travel.
ok("presets cover the usual chains", L.STORE_PRESETS.length >= 15,
   L.STORE_PRESETS.length);
ok("a store carries its own labels",
   L.STORE_PRESETS.filter(function (s) { return s.id === "safeway"; })[0]
     .brands.indexOf("signature select") !== -1);

// Brand data is inconsistent: a mojibake apostrophe split Trader Joe's into
// two entries (1400 + 272 products) that are really one brand.
ok("apostrophe variants fold together",
   L.brandKey("Trader Joe\u2019s") === L.brandKey("Trader Joe\ufffds"),
   L.brandKey("Trader Joe\u2019s"));
ok("case and punctuation fold", L.brandKey("  H-E-B ") === "h e b", L.brandKey("  H-E-B "));
ok("a product can list several brands",
   L.productBrandKeys({ brand: "Nutella, Ferrero" }).length === 2);

const ROWS = [
  { name: "Premio Hot Italian Sausage", brand: "Premio" },
  { name: "Signature Select Sausage", brand: "Signature select" },
  { name: "Kroger Italian sausage", brand: "Kroger" },
  { name: "Unbranded Torta", brand: "" },
  { name: "Egg", brand: "Generic", _generic: true },
  { name: "My Sausage Bake", brand: "Recipe", type: "recipe" },
  { name: "A saved food", brand: "Chobani", _saved: true }
];

ok("nothing chosen leaves the list alone",
   L.filterToStores(ROWS, []).length === ROWS.length);

const SAFE = L.filterToStores(ROWS, ["safeway"]);
ok("a house brand is kept",
   SAFE.some(function (r) { return r.brand === "Signature select"; }));
ok("another chain is dropped",
   !SAFE.some(function (r) { return r.brand === "Premio"; }));
// 11% of the bundled seed has an empty brand field, so keeping all of those
// would leak ~10,000 products past the filter.
ok("an unbranded database product is dropped",
   !SAFE.some(function (r) { return r.name === "Unbranded Torta"; }));
// The filter is about shops, not about your own data.
ok("generic foods are never hidden", SAFE.some(function (r) { return r._generic; }));
ok("recipes are never hidden", SAFE.some(function (r) { return r.type === "recipe"; }));
ok("saved foods are never hidden", SAFE.some(function (r) { return r._saved; }));

const BOTH = L.filterToStores(ROWS, ["safeway", "kroger"]);
ok("two shops keep both their brands",
   BOTH.filter(function (r) {
     return !r._generic && !r._saved && r.type !== "recipe";
   }).length === 2,
   JSON.stringify(BOTH.map(function (r) { return r.brand; })));


console.log("\n-- steak and whole-muscle cuts --");
// "ground beef" was the only beef in the table, and it is a poor stand-in for
// a steak: over a 10 oz portion the trim and fat difference is real.
ok("a steak cut is searchable by name",
   L.searchGenericFoods("ribeye", NDB).length === 1);
// Butchers and recipes spell it both ways.
ok("the two-word spelling finds it too",
   L.searchGenericFoods("rib eye", NDB).length === 1);
ok("\"steak\" offers the cuts, not mince",
   L.searchGenericFoods("steak", NDB).length >= 4);

// The pork catch-all used to claim "pork chop" as an alias, which would have
// shadowed the chop's own leaner figures.
const CHOP = L.searchGenericFoods("pork chop", NDB);
ok("pork chop resolves to its own entry",
   CHOP.length === 1 && CHOP[0].name.toLowerCase() === "pork chop",
   JSON.stringify(CHOP.map(function (c) { return c.name; })));

// An alias claimed by two entries makes matching depend on key order.
(function () {
  const seen = {}, dups = [];
  Object.keys(NDB).forEach(function (k) {
    [k].concat(NDB[k].aliases || []).forEach(function (a) {
      a = String(a).toLowerCase();
      if (seen[a]) dups.push(a);
      seen[a] = k;
    });
  });
  ok("no alias is claimed twice", dups.length === 0, dups.join(", "));
})();

// The weight-based form is what real recipes and a "10 oz ribeye" use.
const CUTS = [
  ["10 oz ribeye", "ribeye", 284],
  ["2 lb chuck roast, cubed", "chuck roast", 907],
  ["8 oz sirloin", "sirloin steak", 227],
  ["1.5 lbs chicken thighs", "chicken thigh", 680]
];
CUTS.forEach(function (c) {
  const row = L.analyzeRecipeText("T" + "\n\n" + c[0], 1, NDB).rows[0];
  ok(c[0] + " resolves by weight",
     row && row.dbKey === c[1] && Math.round(row.grams) === c[2],
     row ? row.dbKey + " " + Math.round(row.grams) + "g" : "unresolved");
});

// Prime runs fatter than the choice-grade figures stored here; the entry is a
// starting point the user can override, not a claim about their steak.
ok("a 10 oz ribeye lands in a sane calorie range", (function () {
  const row = L.analyzeRecipeText("T" + "\n\n10 oz ribeye", 1, NDB).rows[0];
  const kcal = row.fat * 9 + row.protein * 4 + row.netCarb * 4;
  return kcal > 500 && kcal < 900;
})());


console.log("\n-- count-style gram weights --");
// Two bugs made a counted ingredient almost weightless, so a recipe built on
// eggs or chicken breasts reported a fraction of its real calories.
//
//   "2 eggs"         -> the count word IS the food name, so no unit parsed
//                       and the number was read as 2 GRAMS.
//   "4 slices ham"   -> parsed fine, but every table key is singular, so
//                       "slices" found nothing and fell back to a 5 g pinch.
const COUNTED = [
  ["2 eggs", 100],
  ["1 egg", 50],
  ["3 chicken breasts", 510],
  ["4 slices ham", 112],
  ["1 slice ham", 28],
  ["2 sausage links", 80],
  ["2 ribeye steaks", 680],
  ["6 chicken wings", 270],
  ["2 lamb chops", 200],
  ["3 cloves garlic", 9],
  ["2 slices bread", 56],
  ["4 stalks celery", 160],
  ["4 salmon fillets", 680]
];
COUNTED.forEach(function (c) {
  const row = L.analyzeRecipeText("T" + "\n\n" + c[0], 1, NDB).rows[0];
  ok(c[0] + " weighs its items", row && Math.round(row.grams) === c[1],
     row ? Math.round(row.grams) + "g, want " + c[1] + "g" : "unresolved");
});

// A measure is not a countable item. These share the same units map, so a
// careless fallback would read "2 flour" as 2 cups and "3 salt" as 3 pinches.
ok("a bare number on flour is still grams",
   Math.round(L.analyzeRecipeText("T" + "\n\n200 flour", 1, NDB).rows[0].grams) === 200);
ok("a bare number on salt is still grams",
   Math.round(L.analyzeRecipeText("T" + "\n\n50 sugar", 1, NDB).rows[0].grams) === 50);
// Volume and mass paths must be untouched by the count fix.
ok("1 cup flour is unchanged",
   Math.round(L.analyzeRecipeText("T" + "\n\n1 cup flour", 1, NDB).rows[0].grams) === 125);
ok("10 oz ribeye is unchanged",
   Math.round(L.analyzeRecipeText("T" + "\n\n10 oz ribeye", 1, NDB).rows[0].grams) === 284);

console.log("\n-- matcher rejects fragments --");
// Text mangled out of a PDF is full of stray fragments. A one- or two-letter
// word, or a word naming a cut rather than a food, must not claim a match:
// a single "t" was pulling in a 283 g steak and adding it to the totals.
["t", "ny", "bone", "t bone", "meat", "of meat to", "steak", "chop", "roast",
 "boneless", "lean", "loin", "-r t"].forEach(function (junk) {
  ok(JSON.stringify(junk) + " matches nothing",
     L.matchIngredient(junk, NDB) === null, L.matchIngredient(junk, NDB));
});

// ...while the real names those words came from still resolve. A candidate is
// normalised like the input now, so a hyphenated alias is reachable at all.
[["t-bone steak", "strip steak"], ["bone-in pork chop", "pork chop"],
 ["boneless skinless chicken thigh", "chicken thigh"],
 ["lean ground beef", "ground beef lean"], ["new york strip", "strip steak"],
 ["beef stew meat", "chuck roast"], ["ribeye steak", "ribeye"],
 ["sirloin steak", "sirloin steak"], ["lamb chop", "lamb chop"]].forEach(function (c) {
  ok(c[0] + " resolves", L.matchIngredient(c[0], NDB) === c[1],
     L.matchIngredient(c[0], NDB));
});

[["top sirloin", "sirloin steak"], ["sirloin tip", "sirloin steak"],
 ["greek yogurt full fat", "greek yogurt full fat"],
 ["full fat greek yogurt", "greek yogurt full fat"]].forEach(function (c) {
  ok(c[0] + " survives the position-word guard",
     L.matchIngredient(c[0], NDB) === c[1], L.matchIngredient(c[0], NDB));
});

// Page furniture used to match baking soda at 5 g a line, silently padding
// the totals of any recipe printed from a web page.
// "Top of Form" matched via the "top sirloin" alias and "Full Recipe List"
// via "greek yogurt full fat" -- a printed web page leaves both markers, and
// each quietly added an ingredient to the totals.
["page 1 of 2", "bottom of form", "top of form", "full recipe list",
 "join thousands of fans on facebook"]
  .forEach(function (junk) {
  ok(JSON.stringify(junk) + " is not an ingredient",
     L.matchIngredient(junk, NDB) === null, L.matchIngredient(junk, NDB));
});


console.log("\n-- ingredient list boundaries --");
// A cookbook page extracted from a PDF has no "Ingredients" heading: the
// sections are ALL-CAPS, the steps are numbered, and a nutrition panel plus
// book marketing follows. The collector used to run to the end of the file,
// so the method and the related-recipe links scored as food -- "4 quarts
// water to boil in Dutch oven" entered one recipe as 3784 g of water.
const PAGE = [
  "Black Rice Bowls with Salmon",
  "Serves 4",
  "RICE AND DRESSING",
  "1 1/2 cups black rice",
  "1/4 cup rice vinegar",
  "SALMON AND VEGETABLES",
  "4 (4- to 6-ounce) skin-on salmon fillets",
  "1 avocado, halved, pitted, and sliced thin",
  "1. FOR THE RICE: Bring 4 quarts water to boil in Dutch oven over heat.",
  "2. Whisk vinegar and mirin together in small bowl until smooth.",
  "PER SERVING",
  "Cal 540; Total Fat 18g; Sat Fat 2.5g",
  "BUY THE BOOK",
  "Full Recipe List",
  "Chocolate-Avocado Pudding",
  "Sign up for our cooking newsletter",
  "Top of Form"
].join("\n");

const LINES = L.recipeLines(PAGE);
ok("the numbered method is not collected",
   !LINES.some(function (l) { return /Dutch oven|Whisk vinegar/.test(l); }),
   LINES.filter(function (l) { return /Dutch oven|Whisk/.test(l); }).join(" | "));
ok("the nutrition panel is not collected",
   !LINES.some(function (l) { return /^Cal 540|PER SERVING/.test(l); }));
ok("trailing marketing is not collected",
   !LINES.some(function (l) { return /BUY THE BOOK|newsletter|Top of Form|Recipe List/i.test(l); }),
   LINES.join(" | "));
ok("an ALL-CAPS sub-heading is not an ingredient",
   !LINES.some(function (l) { return /^(RICE AND DRESSING|SALMON AND VEGETABLES)$/.test(l); }));
// The real list must survive all of that.
ok("the ingredients themselves are kept",
   LINES.some(function (l) { return /black rice/.test(l); }) &&
   LINES.some(function (l) { return /salmon fillets/.test(l); }) &&
   LINES.some(function (l) { return /avocado/.test(l); }),
   LINES.join(" | "));

// The document states 540 kcal per serving, which the parser no longer reads
// as an ingredient -- so it is an independent check on the arithmetic.
const BOWL = L.analyzeRecipeText(PAGE, 4, NDB);
ok("per-serving lands near the figure the page states",
   Math.abs(BOWL.perServing.kcal - 540) < 120,
   Math.round(BOWL.perServing.kcal) + " vs 540");

// A numbered line is only a step when it reads like one: an ingredient list
// is sometimes numbered too, and a short "1. Dough" is a sub-heading.
ok("a numbered ingredient is still an ingredient",
   L.recipeLines("Cake\n1. 2 cups flour\n2. 3 eggs")
    .some(function (l) { return /flour/.test(l); }));
// A capital is required after the number, so "2 eggs" is never a step.
ok("a quantity line is never read as a step",
   L.recipeLines("Cake\n2 eggs\n1 cup milk").length === 2);

// An ALL-CAPS line carrying a digit may be a real ingredient, so the heading
// rule must not touch it. Measured over the corpus: of 179 distinct ALL-CAPS
// lines none carried a unit, but a shouted ingredient list is still possible.
ok("a shouted ingredient is kept",
   L.recipeLines("Cake\n2 CUPS FLOUR\n1 TSP SALT").length === 2,
   JSON.stringify(L.recipeLines("Cake\n2 CUPS FLOUR\n1 TSP SALT")));

// The explicit-header path is how 57 of the 89 corpus files parse; the new
// boundaries must not disturb it.
const HEADERED = L.recipeLines(
  ["Shortbread", "Ingredients", "2 cups flour", "1 cup butter",
   "Instructions", "Cream the butter and sugar together until light."].join("\n"));
ok("an explicit Ingredients section still works",
   HEADERED.length === 2 && /flour/.test(HEADERED[0]), JSON.stringify(HEADERED));


console.log("\n-- additive ovals --");
// Open Food Facts gives bare codes ("en:e322"), which mean nothing to someone
// holding the jar in a shop. Each becomes an oval with a detail card behind it.
const LEC = L.additiveInfo("en:e322");
ok("a tag resolves to a named additive",
   LEC && LEC.code === "E322" && LEC.name === "Lecithin" && LEC.known);
ok("the card has a role and a description",
   LEC.role === "Emulsifier" && LEC.detail.length > 20, LEC.role);

// Roman-numeral sub-variants name a specific salt or isomer. They share the
// parent's description and have no Wikipedia article, so they fold onto it.
ok("e322i folds onto E322", L.additiveCode("en:e322i") === "E322");
ok("e500ii folds onto E500", L.additiveCode("en:e500ii") === "E500");
ok("E450III folds onto E450", L.additiveCode("E450III") === "E450");
// ...but a trailing letter that is PART of the code must survive.
ok("E150C keeps its letter", L.additiveCode("en:e150c") === "E150C");
ok("E160A keeps its letter", L.additiveCode("en:e160a") === "E160A");
ok("E927A keeps its letter", L.additiveCode("e927a") === "E927A");

ok("a non-E-number tag is ignored", L.additiveCode("en:palm-oil") === "");
ok("an empty tag is ignored", L.additiveInfo("") === null);

// An unknown code must still be shown: a shopper can look it up even if we
// have no description, so it gets the E-number index rather than vanishing.
const UNK = L.additiveInfo("en:e1510");
ok("an unknown code still resolves", UNK && UNK.code === "E1510" && !UNK.known);
ok("an unknown code links to the E-number index",
   UNK.url === L.E_NUMBER_WIKI, UNK.url);

// Every link must point at a real article. These titles were checked against
// the Wikipedia API -- guessing would send a shopper to a 404 mid-aisle.
ok("a known additive links to its own article",
   LEC.url === "https://en.wikipedia.org/wiki/Lecithin", LEC.url);
ok("a redirect-prone name uses the verified title",
   L.additiveInfo("en:e133").url ===
     "https://en.wikipedia.org/wiki/Brilliant_blue_FCF",
   L.additiveInfo("en:e133").url);
ok("a plural-named additive uses the singular article",
   L.additiveInfo("en:e500").url ===
     "https://en.wikipedia.org/wiki/Sodium_carbonate",
   L.additiveInfo("en:e500").url);
// No link may contain a space: those break when pasted.
(function () {
  const bad = [];
  Object.keys(ADB).forEach(function (code) {
    const u = L.additiveInfo("en:" + code.toLowerCase()).url;
    if (/\s/.test(u) || !/^https:\/\/en\.wikipedia\.org\//.test(u)) bad.push(code);
  });
  ok("every additive link is a well-formed wikipedia url", bad.length === 0,
     bad.join(", "));
})();

// The product card renders this list directly.
const OVALS = L.additiveList({ additives: ["en:e322", "en:e322i", "en:e1510", "en:e330"] });
ok("variants collapse to one oval", OVALS.length === 3,
   JSON.stringify(OVALS.map(function (o) { return o.code; })));
ok("named additives sort before unknown ones",
   OVALS[OVALS.length - 1].code === "E1510",
   JSON.stringify(OVALS.map(function (o) { return o.code; })));
ok("a product with no additives yields no ovals",
   L.additiveList({ additives: [] }).length === 0);
ok("a product missing the field is handled", L.additiveList({}).length === 0);

// The table is the thing a card reads; a malformed row would render blank.
(function () {
  const bad = [];
  Object.keys(ADB).forEach(function (code) {
    const r = ADB[code];
    if (!/^E\d+[A-Z]*$/.test(code)) bad.push(code + " (code)");
    else if (!Array.isArray(r) || r.length < 3 || r.length > 4) bad.push(code + " (shape)");
    else if (r.slice(0, 3).some(function (x) { return typeof x !== "string" || !x; }))
      bad.push(code + " (empty field)");
  });
  ok("every table row is well-formed", bad.length === 0, bad.join(", "));
})();


// A script the page loads but the worker does not precache works online and
// breaks offline -- the failure only shows up on a phone in a shop.
(function () {
  const fs = require("fs");
  const html = fs.readFileSync("index.html", "utf8");
  const sw = fs.readFileSync("sw.js", "utf8");
  const srcs = (html.match(/<script src="([^"]+)"/g) || [])
    .map(function (m) { return m.replace(/.*src="/, "").replace(/"$/, ""); })
    .filter(function (u) { return !/^https?:/.test(u); });
  const missing = srcs.filter(function (u) {
    return sw.indexOf('"./' + u + '"') === -1;
  });
  ok("every local script is precached by the service worker",
     missing.length === 0, missing.join(", "));
})();

// The Foods tab shows many foods at once, so the open additive card is keyed
// "<owner>|<code>" -- a bare code would open the same card on every row that
// shares an additive, and tapping E338 on one cola would light up the other.
// That key is only unique because a saved food's id is.
ok("a saved food id is derived from its barcode",
   L.foodFromProduct({ code: "5449000214799", name: "Coke Zero" }).id ===
     "product:5449000214799");
ok("two different products get different ids",
   L.foodFromProduct({ code: "5449000214799", name: "A" }).id !==
   L.foodFromProduct({ code: "5449000000996", name: "B" }).id);
// A code never contains the separator, so "<id>|<code>" cannot be ambiguous.
(function () {
  const bad = Object.keys(ADB).filter(function (c) { return c.indexOf("|") !== -1; });
  ok("no additive code contains the key separator", bad.length === 0, bad.join(", "));
})();
// Saving a product must carry the codes through, or the Foods tab has
// nothing to show.
ok("a saved food keeps its additives",
   L.foodFromProduct({ code: "1", name: "x", additives: ["E330", "E322"] })
     .additives.length === 2);

console.log("\n-- app version --");
ok("APP_VERSION is semver", /^\d+\.\d+\.\d+$/.test(L.APP_VERSION), L.APP_VERSION);

// sw.js repeats the version as a literal so that the file itself changes on
// every release -- that byte change is the only thing that makes a browser
// install a new worker. Two copies can drift, so assert they match.
const swSrc = require("fs").readFileSync(require("path").join(__dirname, "sw.js"), "utf8");
const swVer = (swSrc.match(/var APP_VERSION = "([^"]+)"/) || [])[1];
ok("sw.js declares a version", !!swVer, swVer);
ok("sw.js version matches lib.js", swVer === L.APP_VERSION,
   "sw.js=" + swVer + " lib.js=" + L.APP_VERSION);

console.log("\n" + (fail ? "FAILED " + fail : "ALL PASSED") + "  (" + pass + " assertions)\n");
process.exit(fail ? 1 : 0);
