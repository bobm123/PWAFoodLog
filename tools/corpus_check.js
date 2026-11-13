/* SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 Robert Marchese
 *
 * Run every extracted recipe through the real analyzer and compare two runs.
 *
 * The unit tests prove a rule does what it says on a handful of lines. This
 * says what it does to 89 real pastes, which is where parser changes actually
 * go wrong: a 1.8.x change that looked right in tests moved 51 of 89 files,
 * nearly all for the worse, and only this caught it.
 *
 *   node tools/corpus_check.js snap <extracted_dir> before.json
 *   ...make the change...
 *   node tools/corpus_check.js snap <extracted_dir> after.json
 *   node tools/corpus_check.js diff before.json after.json
 *
 * Get <extracted_dir> from tools/corpus_extract.py. Servings are unknown per
 * file, so every recipe is analyzed at 8: the absolute kcal is meaningless,
 * only the change between two runs matters.
 *
 * Compares by INGREDIENT NAME, never by row index -- comparing rows[i] across
 * lists of different lengths reports a flood of false changes.
 */
const fs = require("fs");
const path = require("path");
const L = require("../lib.js");
const NDB = require("../nutrition-db.js");

const SERVINGS = 8;

function snap(dir, outFile) {
  const out = {};
  const files = fs.readdirSync(dir).filter(f => /\.txt$/i.test(f));
  for (const f of files) {
    let a;
    try {
      a = L.analyzeRecipeText(fs.readFileSync(path.join(dir, f), "utf8"),
                              SERVINGS, NDB.DB);
    } catch (e) {
      out[f] = { err: String(e && e.message || e) };
      continue;
    }
    // Sum by ingredient: a recipe may legitimately list one twice.
    const ing = {};
    for (const r of a.rows) {
      const k = r.dbKey || r.name;
      ing[k] = (ing[k] || 0) + Math.round(r.grams);
    }
    out[f] = {
      kcal: a.perServing ? Math.round(a.perServing.kcal) : 0,
      grams: a.perServing ? Math.round(a.perServing.grams) : 0,
      rows: a.rows.length,
      flag: !!a.lostIngredients,
      unusable: !!a.unusable,
      ing: ing
    };
  }
  fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
  console.log("snapshot of " + files.length + " files -> " + outFile);
}

function diff(beforeFile, afterFile) {
  const a = JSON.parse(fs.readFileSync(beforeFile, "utf8"));
  const b = JSON.parse(fs.readFileSync(afterFile, "utf8"));
  const changed = [];
  let same = 0;

  for (const f of Object.keys(a)) {
    const x = a[f], y = b[f];
    if (!y) { changed.push({ f: f, note: "missing from " + afterFile }); continue; }
    const keys = new Set([...Object.keys(x.ing || {}), ...Object.keys(y.ing || {})]);
    const deltas = [];
    for (const k of keys) {
      const g0 = (x.ing || {})[k] || 0, g1 = (y.ing || {})[k] || 0;
      if (g0 !== g1) deltas.push("     " + k + ": " + g0 + "g -> " + g1 + "g");
    }
    if (!deltas.length && x.kcal === y.kcal && x.flag === y.flag &&
        x.unusable === y.unusable) { same++; continue; }
    changed.push({ f: f, x: x, y: y, deltas: deltas });
  }

  console.log("unchanged: " + same + " of " + Object.keys(a).length);
  console.log("changed:   " + changed.length + "\n");
  for (const c of changed) {
    console.log("## " + c.f);
    if (c.note) { console.log("   " + c.note); continue; }
    console.log("   kcal/srv " + c.x.kcal + " -> " + c.y.kcal +
      (c.x.flag !== c.y.flag ? "   flag " + c.x.flag + " -> " + c.y.flag : "") +
      (c.x.unusable !== c.y.unusable
        ? "   unusable " + c.x.unusable + " -> " + c.y.unusable : ""));
    c.deltas.forEach(d => console.log(d));
  }
  // A changed file is not a failure -- it is the thing to read. Exit 0 so the
  // command can be chained; the count above is the signal.
}

const [mode, ...rest] = process.argv.slice(2);
if (mode === "snap" && rest.length === 2) snap(rest[0], rest[1]);
else if (mode === "diff" && rest.length === 2) diff(rest[0], rest[1]);
else {
  console.log("usage:\n" +
    "  node tools/corpus_check.js snap <extracted_dir> <out.json>\n" +
    "  node tools/corpus_check.js diff <before.json> <after.json>");
  process.exit(2);
}
