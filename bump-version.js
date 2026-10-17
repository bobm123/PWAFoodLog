/* SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 Robert Marchese
 */
/*
 * bump-version.js - set the app version in the two places it must appear.
 *
 *   node bump-version.js 1.0.2
 *
 * lib.js holds APP_VERSION (shown in Settings -> About). sw.js repeats it as a
 * literal, because a browser only installs a new service worker when sw.js
 * itself changes byte-for-byte -- importing the value would leave the file
 * identical between releases and installed copies would never update.
 *
 * Idempotent: running it twice with the same version is a no-op.
 */
var fs = require("fs");
var path = require("path");

var version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || "")) {
  console.error("usage: node bump-version.js <major.minor.patch>");
  console.error("");
  console.error("  patch  1.3.0 -> 1.3.1   bug fix, no new surface");
  console.error("  minor  1.3.1 -> 1.4.0   new feature or UI");
  console.error("  major  1.4.0 -> 2.0.0   breaking change (old exports stop importing)");
  process.exit(1);
}

/**
 * Catch a version that skips or goes backwards.
 *
 * Easy mistakes: bumping 1.3.0 -> 1.3.2 (a gap, so a device that missed one
 * can't tell what it has), or shipping a feature as a patch. A warning
 * rather than an error -- there are legitimate reasons to jump -- but it has
 * to be said out loud.
 */
function checkStep(from, to) {
  if (!from) return;
  var a = from.split(".").map(Number), b = to.split(".").map(Number);
  var ok =
    (b[0] === a[0] && b[1] === a[1] && b[2] === a[2] + 1) ||   // patch
    (b[0] === a[0] && b[1] === a[1] + 1 && b[2] === 0) ||      // minor
    (b[0] === a[0] + 1 && b[1] === 0 && b[2] === 0);           // major
  if (ok) return;
  var back = b[0] < a[0] ||
    (b[0] === a[0] && (b[1] < a[1] || (b[1] === a[1] && b[2] <= a[2])));
  console.error("! " + from + " -> " + to + (back ? " goes backwards." : " skips a step."));
  console.error("  Expected one of: " +
    [a[0] + "." + a[1] + "." + (a[2] + 1),
     a[0] + "." + (a[1] + 1) + ".0",
     (a[0] + 1) + ".0.0"].join(", "));
  console.error("");
}

var targets = [
  { file: "lib.js", re: /(var APP_VERSION = ")[^"]+(")/ },
  { file: "sw.js",  re: /(var APP_VERSION = ")[^"]+(")/ }
];

// Read the version we are moving from, for the step check below.
var currentVersion = null;
try {
  var probe = fs.readFileSync(path.join(__dirname, "lib.js"), "utf8");
  var pm = /var APP_VERSION = "([^"]+)"/.exec(probe);
  if (pm) currentVersion = pm[1];
} catch (e) { /* first run, or lib.js missing */ }
if (currentVersion && currentVersion !== version) checkStep(currentVersion, version);

var changed = 0;
targets.forEach(function (t) {
  var p = path.join(__dirname, t.file);
  var src = fs.readFileSync(p, "utf8");
  if (!t.re.test(src)) {
    console.error("! " + t.file + ": no APP_VERSION line found");
    process.exit(1);
  }
  var out = src.replace(t.re, "$1" + version + "$2");
  if (out === src) {
    console.log("= " + t.file + " already at " + version);
    return;
  }
  fs.writeFileSync(p, out);
  changed++;
  console.log("+ " + t.file + " -> " + version);
});

console.log(changed ? "\nBumped to " + version + ". Commit, push, deploy."
                    : "\nAlready at " + version + "; nothing to do.");
