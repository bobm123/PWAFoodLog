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
    if (code === "2222222222") {
      // The A1-duplicate failure mode: ingredients + NOVA present, but an
      // EMPTY nutrition table. The app must warn, not show believable zeros.
      return route.fulfill({ contentType:"application/json", body: JSON.stringify({
        status:1, code, product:{ product_name:"Steak Sauce Dupe", brands:"CondimentCo",
          nova_group:4, serving_size:"1 tbsp (17g)", serving_quantity:"17",
          ingredients_text:"Tomato puree, vinegar, corn syrup, salt",
          nutriments:{} } }) });
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

  // ---- portion picker: serving named in details, fractions accepted ----
  ok("serving shown in details", /20 fl oz \(591 g\)/.test(await page.locator("#productCard").textContent()),
     (await page.locator("#productCard").textContent()).slice(0, 300));
  await page.fill("#portionCount", "1/2");
  await page.waitForTimeout(200);
  ok("fraction count previews half a bottle (~296 g)",
     /29[56] g/.test(await page.locator("#portionPreview").textContent()),
     await page.locator("#portionPreview").textContent());

  // ---- Save Product: keep a scanned product in the frequent-foods list ----
  await page.click("#btnSaveProduct");
  await page.waitForTimeout(200);
  ok("Save product confirms", /saved|updated/i.test(await page.locator("#scanStatus").textContent()));
  const savedProduct = await page.evaluate(() => new Promise(res => {
    const r = indexedDB.open("foodlog");
    r.onsuccess = () => { const g = r.result.transaction("foods","readonly").objectStore("foods").get("product:0049000042566");
      g.onsuccess = () => res(g.result ? { name: g.result.name, type: g.result.type } : null); g.onerror = () => res(null); };
  }));
  ok("saved product lands in Foods, keyed by barcode", savedProduct && savedProduct.type === "product", JSON.stringify(savedProduct));

  // ---- zero-nutrition guard: a record with an EMPTY nutrition table ----
  await page.fill("#manualCode", "2222222222");
  await page.click("#btnLookup");
  await page.waitForTimeout(500);
  ok("nutrition-less record warns instead of showing believable zeros",
     await page.locator(".nofacts").count() === 1);
  ok("warn box explains the zeros aren't real",
     /aren't real/i.test(await page.locator(".nofacts").textContent()));

  // correct it from the label: 1 tbsp = 17 g, 3 g carb, 15 kcal
  await page.click("#btnFixNutrition");
  ok("fix form opens with serving pre-filled", (await page.inputValue("#fxGrams")) === "17");
  await page.fill("#fxCarb", "3");
  await page.fill("#fxKcal", "15");
  await page.click("#btnApplyFix");
  await page.waitForTimeout(400);
  ok("card re-renders with corrected macros (17.6 g/100g)",
     /17\.6/.test(await page.locator("#productCard").textContent()),
     (await page.locator("#productCard").textContent()).slice(0, 200));
  ok("warning gone after the fix", await page.locator(".nofacts").count() === 0);
  const correctedCache = await page.evaluate(() => new Promise(res => {
    const r = indexedDB.open("foodlog");
    r.onsuccess = () => { const g = r.result.transaction("products","readonly").objectStore("products").get("2222222222");
      g.onsuccess = () => res(g.result ? { carb: g.result.product.per100.carb, corrected: !!g.result.product.corrected } : null);
      g.onerror = () => res(null); };
  }));
  ok("corrected copy cached under the barcode", correctedCache && correctedCache.corrected && correctedCache.carb > 17,
     JSON.stringify(correctedCache));

  // re-scan the same barcode: resolves locally with the user's numbers, no API call
  let fixCalls = 0;
  const counter = req => { if (/openfoodfacts\.org\/api\/v2\/product/.test(req.url())) fixCalls++; };
  page.on("request", counter);
  await page.fill("#manualCode", "2222222222");
  await page.click("#btnLookup");
  await page.waitForTimeout(400);
  page.off("request", counter);
  ok("re-scan uses the corrected copy (no network)", fixCalls === 0, "calls=" + fixCalls);
  ok("re-scan shows corrected values", /17\.6/.test(await page.locator("#productCard").textContent()));

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
  ok("offline scan offers Save for later", await page.locator("#btnSaveLater").count() === 1);

  // ---- Save for later: capture the barcode as a placeholder food ----
  await page.click("#btnSaveLater");
  await page.waitForTimeout(200);
  const placeholder = await page.evaluate(() => new Promise(res => {
    const r = indexedDB.open("foodlog");
    r.onsuccess = () => { const g = r.result.transaction("foods","readonly").objectStore("foods").get("product:1111111111");
      g.onsuccess = () => res(g.result ? { pending: !!g.result.pending, name: g.result.name } : null); g.onerror = () => res(null); };
  }));
  ok("offline barcode saved as a pending placeholder food", placeholder && placeholder.pending === true, JSON.stringify(placeholder));

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
  // the saved placeholder food should now carry real nutrition
  const filled = await page.evaluate(() => new Promise(res => {
    const r = indexedDB.open("foodlog");
    r.onsuccess = () => { const g = r.result.transaction("foods","readonly").objectStore("foods").get("product:1111111111");
      g.onsuccess = () => res(g.result ? { pending: !!g.result.pending, name: g.result.name, carb: g.result.per100.carb } : null); g.onerror = () => res(null); };
  }));
  ok("saved placeholder filled in with real nutrition", filled && !filled.pending && filled.carb > 0, JSON.stringify(filled));

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
