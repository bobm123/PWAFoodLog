/* Headless smoke test for the new features. Not shipped; dev-only. */
const { chromium } = require("playwright");
const { spawn } = require("child_process");

let pass = 0, fail = 0;
function ok(n, c, x) { if (c) { pass++; console.log("  [OK]   " + n); } else { fail++; console.log("  [FAIL] " + n + (x ? " -> " + x : "")); } }

(async () => {
  const server = spawn("python3", ["-m", "http.server", "8000"], { cwd: __dirname });
  await new Promise(r => setTimeout(r, 1200));

  const browser = await chromium.launch();
  // Block the service worker so page.route() sees the OFF requests.
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, serviceWorkers: "block"
  });
  const page = await context.newPage();
  const errors = [];
  const expected = /html5-qrcode|Failed to load resource/; // no vendor file or CDN in the sandbox
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error" && !expected.test(m.text())) errors.push(m.text()); });

  // Serve a fake OFF search response so the online path is testable hermetically.
  await page.route("**/cgi/search.pl**", route => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ products: [{
      code: "9999", product_name: "Test Greek Yogurt", brands: "TestBrand", nova_group: 1,
      ingredients_text: "milk, cultures",
      nutriments: { fat_100g: 5, carbohydrates_100g: 4, fiber_100g: 0, proteins_100g: 9, "energy-kcal_100g": 97 }
    }] })
  }));

  await page.goto("http://localhost:8000/");
  await page.waitForTimeout(600);
  ok("page loads with 5 tabs", await page.locator(".tab").count() === 5);

  // ---- quick add via the sheet, with a meal ----
  await page.click("#btnEmptyAdd");
  ok("sheet opens with a meal preselected", await page.locator("#mealSeg .seg-btn.active").count() === 1);
  ok("recents hidden when nothing logged", await page.locator("#recentWrap").isHidden());
  await page.click('#mealSeg .seg-btn[data-meal="breakfast"]');
  await page.click("#actQuick");
  await page.fill("#qName", "Eggs & butter");
  await page.fill("#qGrams", "120");
  await page.fill("#qFat", "20");
  await page.fill("#qCarb", "2");
  await page.fill("#qFiber", "0");
  await page.fill("#qProtein", "14");
  await page.click("#btnQuickAdd");
  await page.waitForTimeout(300);
  ok("entry appears", await page.locator("#entryList .item").count() === 1);
  ok("grouped under Breakfast", (await page.locator(".mealhead b").first().textContent()) === "Breakfast");
  ok("subtotal shown", /2\.0 g net/.test(await page.locator(".mealhead .sub").first().textContent()));
  ok("totals kcal 244 (Atwater)", (await page.locator("#tKcal").textContent()) === "244");

  // ---- edit portion in place: 120 g -> 60 g halves everything ----
  await page.click('#entryList button[data-edit]');
  await page.fill("#editGrams", "60");
  await page.click('#entryList button[data-saveedit]');
  await page.waitForTimeout(300);
  ok("edited kcal halves to 122", (await page.locator("#tKcal").textContent()) === "122");

  // ---- log again duplicates on the same day ----
  await page.click('#entryList button[data-again]');
  await page.waitForTimeout(300);
  ok("log again adds a row", await page.locator("#entryList .item").count() === 2);
  ok("totals doubled back to 244", (await page.locator("#tKcal").textContent()) === "244");

  // ---- recents now populated in the sheet ----
  await page.click("#fabAdd");
  await page.waitForTimeout(300);
  ok("recent list shows the item once (deduped)", await page.locator("#recentList .item").count() === 1);
  await page.click('#recentList button[data-recent]');
  await page.waitForTimeout(300);
  ok("recent tap logs a third row", await page.locator("#entryList .item").count() === 3);

  // ---- name search (local-first over the bundled seed) ----
  // Wait for the seed import to finish (seedVersion is set only after it does),
  // otherwise a large seed is still importing when we search.
  await page.waitForFunction(() => new Promise(res => {
    const r = indexedDB.open("foodlog");
    r.onsuccess = () => { try {
      const g = r.result.transaction("settings", "readonly").objectStore("settings").get("seedVersion");
      g.onsuccess = () => res(!!(g.result && g.result.value));
      g.onerror = () => res(false);
    } catch (e) { res(false); } };
    r.onerror = () => res(false);
  }), null, { timeout: 15000 });
  await page.click('.tab[data-tab="scan"]');
  await page.fill("#searchQuery", "greek yogurt");
  await page.click("#btnSearch");
  // First search builds the in-memory index over the whole seed; with the real
  // 25k database that can take ~1s, so wait for results rather than a fixed beat.
  await page.waitForFunction(
    () => document.querySelectorAll("#searchResults .srow").length > 0,
    null, { timeout: 8000 });
  ok("local-first search returns a seeded greek yogurt", await page.locator("#searchResults .srow").count() >= 1);
  await page.click('#searchResults .srow');
  await page.waitForTimeout(300);
  ok("tapping a hit renders the product card", /Greek Yogurt/i.test(await page.locator("#productCard").textContent()));
  ok("detail view hides the scan/search cards", await page.locator("#panel-scan > .card").first().isHidden());
  ok("back button present on the product page", await page.locator("#btnBackResults").count() === 1);
  ok("product card has a meal select", await page.locator("#portionMeal").count() === 1);
  // ---- portion × count: seeded Fage carries "1 cup (170g)" ----
  ok("unit select offers the label serving",
     /1 cup \(170 g\)/.test(await page.locator("#portionUnit").innerHTML()),
     await page.locator("#portionUnit").innerHTML());
  await page.selectOption("#portionMeal", "lunch");
  await page.fill("#portionCount", "2");
  await page.waitForTimeout(200);
  ok("live preview computes 2 servings = 340 g",
     /340 g/.test(await page.locator("#portionPreview").textContent()),
     await page.locator("#portionPreview").textContent());
  await page.click("#btnAddEntry");
  await page.waitForTimeout(300);
  ok("search result logged under Lunch", (await page.locator(".mealhead b").allTextContents()).includes("Lunch"));
  ok("diary row reads 2 × 1 cup", /2 × 1 cup/.test(await page.locator("#entryList").textContent()));

  // ---- offline search falls back to local matches ----
  await page.click('.tab[data-tab="scan"]');
  ok("cards restored after logging from the detail page", !(await page.locator("#panel-scan > .card").first().isHidden()));
  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  // navigator.onLine is read-only; emulate via context offline which updates it in Chromium.
  await page.fill("#searchQuery", "greek");
  await page.click("#btnSearch");
  await page.waitForTimeout(500);
  const st = await page.locator("#searchStatus").textContent();
  ok("offline search reads from the on-device database", /device/i.test(st), st);
  ok("offline local search finds a seeded product", await page.locator("#searchResults .srow").count() >= 1);
  // list -> detail -> back keeps the results intact
  await page.click('#searchResults .srow');
  await page.waitForTimeout(250);
  await page.click("#btnBackResults");
  await page.waitForTimeout(250);
  ok("back returns to the compact results list", await page.locator("#searchResults .srow").count() >= 1);
  ok("search card visible again after back", !(await page.locator("#panel-scan > .card").first().isHidden()));
  ok("online button hidden while offline", await page.locator("#btnSearchOnline").isHidden());
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  // ---- daily targets (calories/carbs/fat/protein) + water goal ----
  await page.click('.tab[data-tab="settings"]');
  await page.fill("#setCarbTarget", "20");
  await page.fill("#setKcal", "2000");
  await page.fill("#setFat", "150");
  await page.fill("#setProtein", "120");
  await page.fill("#setWater", "64");
  await page.click("#btnSaveSettings");
  await page.waitForTimeout(200);
  ok("targets saved confirmation", /saved/i.test(await page.locator("#settingsStatus").textContent()));

  // hero reflects the targets
  await page.click('.tab[data-tab="today"]');
  await page.waitForTimeout(300);
  ok("calorie target caption shows", /\/ 2000/.test(await page.locator("#tgtKcal").textContent()),
     await page.locator("#tgtKcal").textContent());
  ok("fat target caption shows", /\/ 150/.test(await page.locator("#tgtFat").textContent()));
  ok("protein goal bar has width", await page.evaluate(() => {
    const w = document.getElementById("barProtein").style.width; return w && w !== "0%";
  }));

  // ---- hydration ----
  ok("water starts at 0", (await page.locator("#waterOz").textContent()) === "0");
  await page.click('.wbtn[data-water="16"]');
  await page.click('.wbtn[data-water="8"]');
  await page.waitForTimeout(200);
  ok("water adds to 24 oz", (await page.locator("#waterOz").textContent()) === "24");
  await page.click('.wbtn[data-water="-8"]');
  await page.waitForTimeout(150);
  ok("water subtracts to 16 oz", (await page.locator("#waterOz").textContent()) === "16");
  ok("water goal label shows 64", (await page.locator("#waterGoalLbl").textContent()) === "64");
  ok("water bar has width", await page.evaluate(() => {
    const w = document.getElementById("barWater").style.width; return w && w !== "0%";
  }));

  // ---- history ----
  await page.click('.tab[data-tab="history"]');
  await page.waitForTimeout(400);
  ok("carb chart renders bars", await page.locator("#carbChart rect").count() > 10);
  ok("kcal chart renders", await page.locator("#kcalChart svg").count() === 1);
  ok("carb goal line labeled", /goal 20 g/.test(await page.locator("#carbChart").innerHTML()));
  ok("calorie goal line labeled", /goal 2000/.test(await page.locator("#kcalChart").innerHTML()));
  ok("streak line mentions the target", /20 g/.test(await page.locator("#streakLine").textContent()));
  const stats = await page.locator("#histStats .tot").count();
  ok("four stat tiles", stats === 4, stats);
  ok("days logged 1/14", /1\/14/.test(await page.locator("#histStats").textContent()));
  await page.click('#panel-history .seg-btn[data-range="30"]');
  await page.waitForTimeout(300);
  ok("30-day range renders", /1\/30/.test(await page.locator("#histStats").textContent()));

  // tap today's bar -> back to diary
  await page.locator('#carbChart rect.bar').last().click();
  await page.waitForTimeout(300);
  ok("bar tap lands on the diary", await page.locator("#panel-today.active").count() === 1);
  ok("diary still shows the four entries", await page.locator("#entryList .item").count() === 4);

  ok("no page errors", errors.length === 0, errors.join(" | "));

  await browser.close();
  server.kill();
  console.log("\n" + (fail ? "FAILED " + fail : "ALL PASSED") + "  (" + pass + " assertions)\n");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
