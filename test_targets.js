/* SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 Robert Marchese
 */
/* test_targets.js - macro targets + hydration pure logic. */
const L = require("./lib.js");
let pass = 0, fail = 0;
function ok(n, c, x) { if (c) { pass++; console.log("  [OK]   " + n); } else { fail++; console.log("  [FAIL] " + n + (x ? " -> " + x : "")); } }
function close(a, b, t) { return Math.abs(a - b) <= (t || 0.001); }

console.log("\n-- macroProgress --");
const none = L.macroProgress(50, 0);
ok("no target -> hasTarget false", none.hasTarget === false);
ok("no target -> pct 0, remaining null", none.pct === 0 && none.remaining === null);
ok("no target when blank/undefined", L.macroProgress(50).hasTarget === false);

const half = L.macroProgress(1000, 2000);
ok("1000/2000 -> 50%", close(half.pct, 50));
ok("under target -> not over", half.over === false);
ok("remaining 1000", close(half.remaining, 1000));

const over = L.macroProgress(2200, 2000);
ok("over target -> over true", over.over === true);
ok("over target -> pct clamped to 100", over.pct === 100);
ok("remaining negative when over", close(over.remaining, -200));

const exact = L.macroProgress(2000, 2000);
ok("exactly on target -> not over", exact.over === false);
ok("exactly on target -> 100%", close(exact.pct, 100));

ok("zero consumed -> 0%", L.macroProgress(0, 2000).pct === 0);
ok("string inputs coerced", close(L.macroProgress("50", "100").pct, 50));
ok("negative consumed clamps pct to 0", L.macroProgress(-10, 100).pct === 0);

console.log("\n-- hydration: addOz --");
ok("adds", L.addOz(16, 8) === 24);
ok("subtracts", L.addOz(24, -8) === 16);
ok("never goes negative", L.addOz(4, -8) === 0);
ok("from zero", L.addOz(0, 8) === 8);
ok("string coercion", L.addOz("16", "8") === 24);
ok("garbage delta -> unchanged (>=0)", L.addOz(16, undefined) === 16);
ok("garbage current -> delta (>=0)", L.addOz(undefined, 8) === 8);

console.log("\n-- hydration defaults --");
ok("default goal is 64 oz", L.WATER_GOAL_DEFAULT === 64);
ok("presets are 8/12/16", L.WATER_PRESETS.join(",") === "8,12,16");

console.log("\n" + (fail ? "FAILED " + fail : "ALL PASSED") + "  (" + pass + " assertions)\n");
process.exit(fail ? 1 : 0);
