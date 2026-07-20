/* SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 Robert Marchese
 */
/* test_features.js - meals, re-logging, history, and name search. */
const L = require("./lib.js");
let pass = 0, fail = 0;
function ok(n, c, x) { if (c) { pass++; console.log("  [OK]   " + n); } else { fail++; console.log("  [FAIL] " + n + (x ? " -> " + x : "")); } }
function close(a, b, tol) { return Math.abs(a - b) <= (tol || 0.05); }

console.log("\n-- guessMeal --");
ok("7am -> breakfast", L.guessMeal(7) === "breakfast");
ok("12 -> lunch", L.guessMeal(12) === "lunch");
ok("19 -> dinner", L.guessMeal(19) === "dinner");
ok("15 -> snack (between meals)", L.guessMeal(15) === "snack");
ok("23 -> snack", L.guessMeal(23) === "snack");
ok("2am -> snack", L.guessMeal(2) === "snack");

console.log("\n-- groupByMeal --");
const G = L.groupByMeal([
  { meal: "dinner", macros: { netCarb: 10, fat: 5, protein: 8, kcal: 137 } },
  { meal: "breakfast", macros: { netCarb: 4, fat: 10, protein: 12, kcal: 154 } },
  { meal: "breakfast", macros: { netCarb: 2, fat: 3, protein: 1, kcal: 39 } },
  { macros: { netCarb: 1, fat: 1, protein: 1, kcal: 17 } }   // pre-meals entry
]);
ok("three groups", G.length === 3, G.length);
ok("fixed order: breakfast first", G[0].meal === "breakfast", G.map(g => g.meal).join(","));
ok("dinner before other", G[1].meal === "dinner" && G[2].meal === "other");
ok("breakfast subtotal netCarb 6", close(G[0].totals.netCarb, 6));
ok("legacy entry lands in 'other'", G[2].entries.length === 1);
ok("empty groups omitted", !G.some(g => g.meal === "lunch" || g.meal === "snack"));
ok("empty input -> no groups", L.groupByMeal([]).length === 0);

console.log("\n-- scaleMacros --");
const base = { grams: 100, fat: 10, carb: 20, fiber: 5, protein: 8, netCarb: 15, kcal: 200 };
const s2 = L.scaleMacros(base, 150);
ok("fat scaled 1.5x", close(s2.fat, 15));
ok("netCarb recomputed from scaled carb/fiber", close(s2.netCarb, 22.5));
ok("kcal scaled", close(s2.kcal, 300));
ok("grams updated", s2.grams === 150);
const sNull = L.scaleMacros({ grams: 100, fat: 1, kcal: null }, 50);
ok("null kcal stays null (Atwater applies later)", sNull.kcal === null);
ok("zero new grams -> null", L.scaleMacros(base, 0) === null);
ok("missing old grams -> null", L.scaleMacros({ fat: 1 }, 50) === null);
ok("original untouched", base.fat === 10 && base.grams === 100);

console.log("\n-- recentFoods --");
const entries = [
  { name: "Eggs", code: "", loggedAt: "2026-07-18T08:00:00Z", macros: { grams: 100, netCarb: 1 } },
  { name: "Nutella", code: "3017620422003", loggedAt: "2026-07-19T09:00:00Z", macros: { grams: 15, netCarb: 8 } },
  { name: "eggs", code: "", loggedAt: "2026-07-20T08:00:00Z", macros: { grams: 120, netCarb: 1.2 } },
  { name: "Nutella", code: "3017620422003", loggedAt: "2026-07-17T09:00:00Z", macros: { grams: 30, netCarb: 16 } },
  { name: "Broken", code: "", loggedAt: "2026-07-20T10:00:00Z", macros: { grams: 0 } }
];
const rec = L.recentFoods(entries, 8);
ok("deduped to two items", rec.length === 2, rec.length);
ok("newest first", rec[0].name === "eggs", rec[0].name);
ok("name dedupe is case-insensitive", !rec.some(r => r.name === "Eggs"));
ok("barcode dedupe keeps newest portion", rec.filter(r => r.code === "3017620422003")[0].macros.grams === 15);
ok("zero-gram entries skipped", !rec.some(r => r.name === "Broken"));
ok("limit respected", L.recentFoods(entries, 1).length === 1);

console.log("\n-- dateRange / historyDays --");
const dr = L.dateRange("2026-07-20", 14);
ok("14 dates", dr.length === 14);
ok("oldest first", dr[0] === "2026-07-07", dr[0]);
ok("ends at endDate", dr[13] === "2026-07-20");
ok("crosses month boundary", L.dateRange("2026-07-03", 5)[0] === "2026-06-29", L.dateRange("2026-07-03", 5)[0]);
const hd = L.historyDays([
  { date: "2026-07-19", macros: { netCarb: 12, fat: 10, protein: 20, kcal: 218 } },
  { date: "2026-07-19", macros: { netCarb: 6, fat: 5, protein: 10, kcal: 109 } },
  { date: "2026-07-20", macros: { netCarb: 30, fat: 1, protein: 1, kcal: 133 } }
], dr);
ok("one slot per date", hd.length === 14);
ok("zero-filled day", hd[0].totals.count === 0 && hd[0].totals.netCarb === 0);
ok("summed day", close(hd[12].totals.netCarb, 18), hd[12].totals.netCarb);
ok("dates align", hd[12].date === "2026-07-19");

console.log("\n-- streakUnderBudget --");
function day(date, netCarb, count) { return { date, totals: { netCarb, count: count === undefined ? 1 : count } }; }
ok("no target -> 0", L.streakUnderBudget([day("d", 5)], null) === 0);
ok("simple streak of 3", L.streakUnderBudget(
  [day("1", 50), day("2", 10), day("3", 15), day("4", 20)], 20) === 3);
ok("over-budget day breaks it", L.streakUnderBudget(
  [day("1", 10), day("2", 50), day("3", 10)], 20) === 1);
ok("unlogged middle day breaks it", L.streakUnderBudget(
  [day("1", 10), day("2", 0, 0), day("3", 10)], 20) === 1);
ok("today-not-yet-logged is skipped, not a break", L.streakUnderBudget(
  [day("1", 10), day("2", 12), day("3", 0, 0)], 20) === 2);
ok("empty history -> 0", L.streakUnderBudget([], 20) === 0);
ok("exactly on budget counts", L.streakUnderBudget([day("1", 20)], 20) === 1);

console.log("\n-- normalizeSearchResults --");
const page = { products: [
  { code: "111", product_name: "Greek Yogurt", brands: "Fage", nova_group: 1,
    nutriments: { fat_100g: 5, carbohydrates_100g: 3.8, fiber_100g: 0, proteins_100g: 9, "energy-kcal_100g": 97 } },
  { code: "", product_name: "No barcode, dropped" },
  { code: "222", product_name: "Protein bar", ingredients_text: "maltodextrin, whey",
    nutriments: { carbohydrates_100g: 40, fiber_100g: 5 } }
] };
const sr = L.normalizeSearchResults(page);
ok("keeps only coded products", sr.length === 2, sr.length);
ok("normalized shape", close(sr[0].per100.carb, 3.8) && sr[0].nova === 1);
ok("GI flags computed on results", sr[1].flags.some(f => f.label === "Maltodextrin"));
ok("empty page -> []", L.normalizeSearchResults({ products: [] }).length === 0);
ok("garbage -> []", L.normalizeSearchResults(null).length === 0);

console.log("\n-- searchLocal --");
const foods = [
  { name: "Keto Sardine Cakes", brand: "Custom recipe", code: "" },
  { name: "Greek Yogurt", brand: "Custom", code: "111" }
];
const cached = [
  { name: "Greek Yogurt Full Fat", brand: "Fage", code: "111" },   // duplicate barcode
  { name: "Nutella", brand: "Ferrero", code: "3017620422003" }
];
const loc = L.searchLocal("yogurt", foods, cached);
ok("matches saved food", loc.some(h => h.kind === "food" && h.item.name === "Greek Yogurt"));
ok("cached duplicate of saved barcode dropped", !loc.some(h => h.kind === "cached"));
ok("brand matches too", L.searchLocal("ferrero", foods, cached).length === 1);
ok("case-insensitive", L.searchLocal("NUTELLA", foods, cached).length === 1);
ok("short query -> []", L.searchLocal("y", foods, cached).length === 0);
ok("no match -> []", L.searchLocal("pizza", foods, cached).length === 0);

console.log("\n-- searchProducts: offline-tolerant like lookupProduct --");
const timeoutErr = () => { const e = new Error("aborted"); e.name = "AbortError"; return Promise.reject(e); };
const tests = [];
function t(name, fn) { tests.push([name, fn]); }

t("online + results", async () => {
  const d = { isOnline: () => true, fetchJson: (u) => Promise.resolve(page) };
  const r = await L.searchProducts(d, "greek yogurt");
  ok("source=network", r.source === "network", r.source);
  ok("two products", r.products.length === 2);
  ok("no message", r.message === null);
});
t("online + zero hits -> actionable message", async () => {
  const d = { isOnline: () => true, fetchJson: () => Promise.resolve({ products: [] }) };
  const r = await L.searchProducts(d, "xzzy");
  ok("no error (server answered)", r.error === null);
  ok("suggests scanning instead", /barcode/i.test(r.message), r.message);
});
t("offline -> local matches, honest message", async () => {
  const d = { isOnline: () => false, fetchJson: () => { throw new Error("must not fetch"); },
              getLocal: (q) => Promise.resolve([{ name: "Nutella" }]) };
  const r = await L.searchProducts(d, "nutella");
  ok("source=local", r.source === "local", r.source);
  ok("error=offline", r.error === L.ERR.OFFLINE);
  ok("local result surfaced", r.products.length === 1);
  ok("message says device-only", /device/i.test(r.message), r.message);
});
t("timeout -> falls back to local", async () => {
  const d = { isOnline: () => true, fetchJson: timeoutErr, getLocal: () => Promise.resolve([]) };
  const r = await L.searchProducts(d, "nutella");
  ok("error=timeout", r.error === L.ERR.TIMEOUT, r.error);
  ok("still resolves with empty list", Array.isArray(r.products));
});
t("network error + getLocal missing -> still resolves", async () => {
  const d = { isOnline: () => true, fetchJson: () => Promise.reject(new Error("down")) };
  const r = await L.searchProducts(d, "nutella");
  ok("error=network", r.error === L.ERR.NETWORK, r.error);
  ok("empty products, no crash", r.products.length === 0);
});
t("getLocal throwing is survivable", async () => {
  const d = { isOnline: () => false, getLocal: () => Promise.reject(new Error("idb dead")) };
  const r = await L.searchProducts(d, "nutella");
  ok("degrades to empty offline result", r.error === L.ERR.OFFLINE && r.products.length === 0);
});
t("short query is a no-op", async () => {
  const d = { isOnline: () => true, fetchJson: () => { throw new Error("must not fetch"); } };
  const r = await L.searchProducts(d, "a");
  ok("no products, no error", r.products.length === 0 && r.error === null);
});
t("search URL is encoded", async () => {
  ok("spaces + specials encoded", L.OFF_SEARCH_URL("greek yogurt & more").indexOf("greek%20yogurt%20%26%20more") !== -1,
     L.OFF_SEARCH_URL("greek yogurt & more"));
});

(async () => {
  for (const [name, fn] of tests) { console.log("\n-- " + name + " --"); await fn(); }
  console.log("\n" + (fail ? "FAILED " + fail : "ALL PASSED") + "  (" + pass + " assertions)\n");
  process.exit(fail ? 1 : 0);
})();
