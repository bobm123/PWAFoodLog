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

console.log("\n" + (fail ? "FAILED " + fail : "ALL PASSED") + "  (" + pass + " assertions)\n");
process.exit(fail ? 1 : 0);
