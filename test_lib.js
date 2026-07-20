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

console.log("\n" + (fail ? "FAILED " + fail : "ALL PASSED") + "  (" + pass + " assertions)\n");
process.exit(fail ? 1 : 0);
