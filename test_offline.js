const L = require("./lib.js");
let pass = 0, fail = 0;
function ok(n, c, x) { if (c) { pass++; console.log("  [OK]   " + n); } else { fail++; console.log("  [FAIL] " + n + (x ? " -> " + x : "")); } }

const PRODUCT_JSON = {
  code: "3017620422003", status: 1,
  product: { product_name: "Nutella", brands: "Ferrero", nova_group: 4,
    additives_tags: ["en:e322"], ingredients_text: "Sugar, palm oil.",
    nutriments: { fat_100g: 30.9, carbohydrates_100g: 57.5, fiber_100g: 3.6, proteins_100g: 6.3 } }
};
const NOT_FOUND = { status: 0 };

function deps(o) {
  const calls = { fetched: [], cachedPuts: [] };
  return [{
    isOnline: () => o.online !== false,
    fetchJson: (url) => { calls.fetched.push(url); return o.fetch(url); },
    getCached: (code) => Promise.resolve(o.cache && o.cache[code] ? o.cache[code] : null),
    putCached: (code, p) => { calls.cachedPuts.push(code); return o.putFails ? Promise.reject(new Error("quota")) : Promise.resolve(); }
  }, calls];
}
const timeoutErr = () => { const e = new Error("aborted"); e.name = "AbortError"; return Promise.reject(e); };
const netErr = () => Promise.reject(new Error("Failed to fetch"));

const tests = [];
function t(name, fn) { tests.push([name, fn]); }

t("online + found -> network, cached", async () => {
  const [d, c] = deps({ fetch: () => Promise.resolve(PRODUCT_JSON) });
  const r = await L.lookupProduct(d, "3017620422003");
  ok("source=network", r.source === "network", r.source);
  ok("product returned", r.product && r.product.name === "Nutella");
  ok("not stale", r.stale === false);
  ok("no error", r.error === null);
  ok("written to cache", c.cachedPuts.length === 1, c.cachedPuts.join());
});

t("online + 12-digit UPC needs padded variant", async () => {
  const [d, c] = deps({ fetch: (u) => Promise.resolve(u.includes("0012345678905") ? PRODUCT_JSON : NOT_FOUND) });
  const r = await L.lookupProduct(d, "012345678905");
  ok("found on second variant", r.source === "network", r.source);
  ok("tried both variants", c.fetched.length === 2, c.fetched.length);
});

t("online + genuinely unknown barcode -> not-found", async () => {
  const [d] = deps({ fetch: () => Promise.resolve(NOT_FOUND) });
  const r = await L.lookupProduct(d, "3017620422003");
  ok("error=not-found", r.error === L.ERR.NOT_FOUND, r.error);
  ok("no product", r.product === null);
  ok("has actionable message", /enter it by hand/i.test(r.message), r.message);
});

t("TIMEOUT + cached copy -> serves stale, warns", async () => {
  const cached = L.normalizeProduct(PRODUCT_JSON);
  const [d] = deps({ fetch: timeoutErr, cache: { "3017620422003": cached } });
  const r = await L.lookupProduct(d, "3017620422003");
  ok("source=cache", r.source === "cache", r.source);
  ok("marked stale", r.stale === true);
  ok("product usable", r.product.name === "Nutella");
  ok("message mentions saved copy", /saved copy/i.test(r.message), r.message);
});

t("TIMEOUT + no cache -> timeout error, never hangs", async () => {
  const [d] = deps({ fetch: timeoutErr });
  const r = await L.lookupProduct(d, "3017620422003");
  ok("error=timeout", r.error === L.ERR.TIMEOUT, r.error);
  ok("message mentions signal", /signal/i.test(r.message), r.message);
});

t("network failure + no cache -> network error", async () => {
  const [d] = deps({ fetch: netErr });
  const r = await L.lookupProduct(d, "3017620422003");
  ok("error=network", r.error === L.ERR.NETWORK, r.error);
});

t("OFFLINE + cached -> serves cache, no network call", async () => {
  const cached = L.normalizeProduct(PRODUCT_JSON);
  const [d, c] = deps({ online: false, fetch: () => { throw new Error("must not fetch"); }, cache: { "3017620422003": cached } });
  const r = await L.lookupProduct(d, "3017620422003");
  ok("source=cache", r.source === "cache", r.source);
  ok("offline flag set", r.offline === true);
  ok("no error (usable)", r.error === null);
  ok("network never touched", c.fetched.length === 0);
});

t("OFFLINE + nothing cached -> offline error, core app unaffected", async () => {
  const [d, c] = deps({ online: false, fetch: () => { throw new Error("must not fetch"); } });
  const r = await L.lookupProduct(d, "3017620422003");
  ok("error=offline", r.error === L.ERR.OFFLINE, r.error);
  ok("offline flag", r.offline === true);
  ok("no fetch attempted", c.fetched.length === 0);
  ok("tells user to enter by hand", /by hand/i.test(r.message), r.message);
});

t("cache write failure must not sink a good lookup", async () => {
  const [d] = deps({ fetch: () => Promise.resolve(PRODUCT_JSON), putFails: true });
  const r = await L.lookupProduct(d, "3017620422003");
  ok("still returns product", r.product && r.product.name === "Nutella");
  ok("source=network", r.source === "network");
});

t("getCached throwing is survivable", async () => {
  const d = { isOnline: () => false, fetchJson: () => Promise.reject(new Error("x")),
              getCached: () => Promise.reject(new Error("idb dead")), putCached: () => Promise.resolve() };
  const r = await L.lookupProduct(d, "3017620422003");
  ok("degrades to offline error", r.error === L.ERR.OFFLINE, r.error);
});

t("lookupProduct never rejects", async () => {
  const d = { isOnline: () => true, fetchJson: () => Promise.reject(new Error("boom")),
              getCached: () => Promise.reject(new Error("boom")), putCached: () => Promise.reject(new Error("boom")) };
  let rejected = false;
  await L.lookupProduct(d, "123456789012").catch(() => { rejected = true; });
  ok("resolved, not rejected", rejected === false);
});

(async () => {
  for (const [name, fn] of tests) { console.log("\n-- " + name + " --"); await fn(); }
  console.log("\n" + (fail ? "FAILED " + fail : "ALL PASSED") + "  (" + pass + " assertions)\n");
  process.exit(fail ? 1 : 0);
})();
