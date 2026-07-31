/* SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 Robert Marchese
 */
/* test_seed.js - the bundled seed file is valid and app-consumable. */
const L = require("./lib.js");
const fs = require("fs");
const zlib = require("zlib");

let pass = 0, fail = 0;
function ok(n, c, x) { if (c) { pass++; console.log("  [OK]   " + n); } else { fail++; console.log("  [FAIL] " + n + (x ? " -> " + x : "")); } }

console.log("\n-- seed-meta.json --");
const meta = JSON.parse(fs.readFileSync(__dirname + "/seed/seed-meta.json", "utf8"));
ok("has a version string", typeof meta.version === "string" && meta.version.length > 0, meta.version);
ok("declares its file", typeof meta.file === "string" && /\.ndjson\.gz$/.test(meta.file), meta.file);
ok("count is a positive integer", Number.isInteger(meta.count) && meta.count > 0, meta.count);

console.log("\n-- products-us.ndjson.gz --");
const text = zlib.gunzipSync(fs.readFileSync(__dirname + "/seed/" + meta.file)).toString("utf8");
const lines = text.split("\n").filter(function (l) { return l.trim(); });
ok("line count matches meta.count", lines.length === meta.count, lines.length + " vs " + meta.count);

// Every line must parse AND normalize through the app's own normalizeProduct,
// because that is exactly what the loader does on the device.
let normalized = [], badLines = 0, codes = {};
lines.forEach(function (line) {
  let raw;
  try { raw = JSON.parse(line); } catch (e) { badLines++; return; }
  const p = L.normalizeProduct({ status: 1, code: raw.code, product: raw });
  if (!p || !p.code) { badLines++; return; }
  normalized.push(p);
  codes[p.code] = (codes[p.code] || 0) + 1;
});
ok("every line is valid JSON that normalizes", badLines === 0, badLines + " bad");
ok("all codes numeric", normalized.every(function (p) { return /^\d+$/.test(p.code); }));
ok("no duplicate barcodes", Object.keys(codes).every(function (c) { return codes[c] === 1; }));
ok("every product has a name", normalized.every(function (p) { return p.name && p.name.length; }));
// A small tail legitimately has all-zero macros -- water, diet sodas, and other
// calorie-free items. Assert the vast majority carry real nutrition (which
// catches a broken/empty build) while allowing that honest zero-macro tail.
const zeroMacro = normalized.filter(function (p) {
  const m = p.per100; return ![m.fat, m.carb, m.protein, m.kcal].some(function (v) { return v > 0; });
});
ok("nearly all products have real nutrition (zero-macro tail is small)",
   zeroMacro.length <= normalized.length * 0.1,
   zeroMacro.length + "/" + normalized.length + " all-zero macros");

console.log("\n-- flags are computed from the seed's ingredients --");
// The seed carries ingredients_text so the app's whole point (GI flags) works.
const withIngredients = normalized.filter(function (p) { return p.ingredientsText; });
ok("most products carry an ingredient list", withIngredients.length >= normalized.length * 0.6,
   withIngredients.length + "/" + normalized.length);
const anyFlagged = normalized.some(function (p) { return p.flags && p.flags.length; });
ok("at least one product trips the GI watchlist", anyFlagged);
// find a specific high-GI hit to prove the pipeline end-to-end
const hfcs = normalized.filter(function (p) {
  return (p.flags || []).some(function (f) { return f.severity === "high"; });
});
ok("a high-severity flag exists in the seed", hfcs.length > 0, hfcs.length + " high-flagged");

console.log("\n-- searchLocal over the seed corpus --");
// searchLocal is the pure primitive the in-app index mirrors.
const hits = L.searchLocal("yogurt", [], normalized);
ok("substring search finds a seeded item", hits.length >= 1, hits.map(h => h.item.name).join("|"));
ok("search is case-insensitive", L.searchLocal("YOGURT", [], normalized).length === hits.length);
ok("2-char minimum enforced", L.searchLocal("y", [], normalized).length === 0);
ok("no-match returns empty", L.searchLocal("zzzznope", [], normalized).length === 0);

console.log("\n" + (fail ? "FAILED " + fail : "ALL PASSED") + "  (" + pass + " assertions)\n");
process.exit(fail ? 1 : 0);
