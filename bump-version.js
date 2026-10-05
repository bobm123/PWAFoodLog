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
  process.exit(1);
}

var targets = [
  { file: "lib.js", re: /(var APP_VERSION = ")[^"]+(")/ },
  { file: "sw.js",  re: /(var APP_VERSION = ")[^"]+(")/ }
];

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
