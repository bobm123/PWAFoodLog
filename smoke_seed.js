const { chromium } = require("playwright");
const { spawn } = require("child_process");
(async () => {
  const server = spawn("python3", ["-m", "http.server", "8151"], { cwd: __dirname });
  await new Promise(r => setTimeout(r, 1600));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errors = [];
  const expected = /html5-qrcode|Failed to load resource/;
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error" && !expected.test(m.text())) errors.push(m.text()); });

  let pass = 0, fail = 0;
  const ok = (n,c,x)=>{ if(c){pass++;console.log("  [OK]   "+n);}else{fail++;console.log("  [FAIL] "+n+(x?" -> "+x:""));} };

  // route OFF: barcode + search. We'll toggle behavior per-test via a flag on window.
  await page.route("**/api/v2/product/**", (route) => {
    const url = route.request().url();
    const code = url.split("/product/")[1].split(".json")[0];
    if (code === "0049000042566" || code === "00049000042566") {
      // a seeded item - but we assert seed answers WITHOUT network, so this
      // should never be hit for seeded codes.
      return route.fulfill({ contentType:"application/json", body: JSON.stringify({ status:0 }) });
    }
    if (code === "1111111111") {
      return route.fulfill({ contentType:"application/json", body: JSON.stringify({
        status:1, code, product:{ product_name:"Enriched Later Bar", brands:"NetBrand",
          nutriments:{ "energy-kcal_100g":200, carbohydrates_100g:20, fiber_100g:2, proteins_100g:10, fat_100g:8 } } }) });
    }
    return route.fulfill({ contentType:"application/json", body: JSON.stringify({ status:0 }) });
  });

  await page.goto("http://localhost:8151/");
  // wait for seed import (first run)
  await page.waitForFunction(async () => {
    return await new Promise(res => {
      const r = indexedDB.open("foodlog");
      r.onsuccess = () => { try {
        const tx = r.result.transaction("products","readonly");
        const c = tx.objectStore("products").count();
        c.onsuccess = () => res(c.result >= 30);
        c.onerror = () => res(false);
      } catch(e){ res(false); } };
      r.onerror = () => res(false);
    });
  }, null, { timeout: 8000 });
  ok("seed imported ~30 products into IndexedDB on first run", true);

  // ---- local-first name search (no online button needed) ----
  await page.click('.tab[data-tab="scan"]');
  await page.fill("#searchQuery", "yogurt");
  await page.click("#btnSearch");
  await page.waitForTimeout(300);
  ok("local search returns a seeded match", await page.locator("#searchResults .item").count() >= 1);
  ok("status says matches are on-device", /on this device/i.test(await page.locator("#searchStatus").textContent()));
  ok("online button is offered (online)", !(await page.locator("#btnSearchOnline").isHidden()));

  // pick a result -> product card, log it
  await page.click('#searchResults .item');
  await page.waitForTimeout(200);
  ok("search hit opens a product card", /net carbs/i.test(await page.locator("#productCard").textContent()));

  // ---- local-first BARCODE: seeded code resolves with NO network ----
  let offCalls = 0;
  page.on("request", req => { if (/openfoodfacts\.org\/api\/v2\/product/.test(req.url())) offCalls++; });
  await page.fill("#manualCode", "0049000042566");   // Coca-Cola, in the seed
  await page.click("#btnLookup");
  await page.waitForTimeout(400);
  ok("seeded barcode renders a product", /Coca-Cola/i.test(await page.locator("#productCard").textContent()));
  ok("seeded barcode made ZERO network calls", offCalls === 0, "calls="+offCalls);

  // ---- offline search still works from the seed ----
  await ctx.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await page.fill("#searchQuery", "peanut");
  await page.click("#btnSearch");
  await page.waitForTimeout(300);
  ok("offline local search finds seeded item", await page.locator("#searchResults .item").count() >= 1);
  ok("online button hidden while offline", await page.locator("#btnSearchOnline").isHidden());

  // ---- pending queue: scan unknown code while offline -> enqueued ----
  await page.fill("#manualCode", "1111111111");
  await page.click("#btnLookup");
  await page.waitForTimeout(300);
  const pendingCount = await page.evaluate(() => new Promise(res => {
    const r = indexedDB.open("foodlog");
    r.onsuccess = () => { const c = r.result.transaction("pending","readonly").objectStore("pending").count();
      c.onsuccess = () => res(c.result); c.onerror = () => res(-1); };
  }));
  ok("offline unknown scan enqueued as pending", pendingCount === 1, "pending="+pendingCount);
  ok("offline scan offers manual entry", /enter it by hand/i.test(await page.locator("#productCard").textContent()));

  // ---- come back online -> reconciler fills it in and clears pending ----
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(1500);
  const pendingAfter = await page.evaluate(() => new Promise(res => {
    const r = indexedDB.open("foodlog");
    r.onsuccess = () => { const c = r.result.transaction("pending","readonly").objectStore("pending").count();
      c.onsuccess = () => res(c.result); };
  }));
  ok("reconciler cleared the pending code once online", pendingAfter === 0, "pending="+pendingAfter);
  const nowCached = await page.evaluate(() => new Promise(res => {
    const r = indexedDB.open("foodlog");
    r.onsuccess = () => { const g = r.result.transaction("products","readonly").objectStore("products").get("1111111111");
      g.onsuccess = () => res(!!g.result); g.onerror = () => res(false); };
  }));
  ok("enriched product now in the cache", nowCached);

  // ---- version guard: reload does NOT re-import (same seed version) ----
  const before = await page.evaluate(() => new Promise(res => {
    const r = indexedDB.open("foodlog");
    r.onsuccess = () => { const c = r.result.transaction("products","readonly").objectStore("products").count();
      c.onsuccess = () => res(c.result); };
  }));
  await page.reload();
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => new Promise(res => {
    const r = indexedDB.open("foodlog");
    r.onsuccess = () => { const c = r.result.transaction("products","readonly").objectStore("products").count();
      c.onsuccess = () => res(c.result); };
  }));
  ok("no duplicate import on reload (version-guarded)", after === before, before+" -> "+after);

  // ---- Settings shows the DB line ----
  await page.click('.tab[data-tab="settings"]');
  await page.waitForTimeout(300);
  ok("settings shows product count", /products on this device/i.test(await page.locator("#dbLine").textContent()),
     await page.locator("#dbLine").textContent());

  ok("no unexpected page errors", errors.length === 0, errors.join(" | "));

  await browser.close(); server.kill();
  console.log("\n" + (fail?"FAILED "+fail:"ALL PASSED") + "  ("+pass+" checks)\n");
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
