# Food Log — a no-paywall macro & processing tracker

A single-purpose PWA that does the thing no existing iOS app does in one place:
log food by barcode, track macros with a net-carb focus, and **flag ultra-processed
and high-glycemic ingredients** — with no subscription, no ads, and no upsell,
because the data source is free and the app has no backend.

## Why this exists

The free-tier landscape is split in two:

- **Cronometer / FatSecret / MyNetDiary** keep barcode scanning and custom recipes
  free, but tell you nothing about processing or glycemic load.
- **Open Food Facts** knows the NOVA processing score and the full ingredient list,
  but is a product scanner, not a food diary.

This app is the intersection. It reads the free
[Open Food Facts](https://world.openfoodfacts.org) API and layers a diary on top.

### The maltodextrin problem

Nutrition panels hide fast carbs. **Maltodextrin has a glycemic index of about
85–105** — higher than table sugar (65) and comparable to pure glucose (100) — yet
under FDA rules it is *not* counted as "added sugar." Modified starches, glucose
syrup, dextrose and rice syrup behave the same way.

Open Food Facts' `additives_tags` field only lists **E-numbers**, and maltodextrin
has none — so it never appears there. This app therefore scans the raw
`ingredients_text` against its own watchlist (`GI_WATCHLIST` in `lib.js`) and marks
each hit `high` or `moderate` severity with a short explanation.

## Features

- **Barcode scanning** with the phone camera, plus manual barcode entry as a fallback.
  12-digit UPC-A codes are automatically retried as 13-digit EAN-13.
- **NOVA 1–4 processing badge** and **high-GI ingredient flags** on every product.
- **Daily totals**: net carbs, fat, protein, calories, and a calorie split bar.
- **Optional net-carb budget** (Settings) with an over-budget warning.
- **Custom foods and recipes**, including direct import of
  `analyze_recipe.py --json` output from the sibling `keto-recipe-analyzer` skill.
- **Offline capable**: app shell is precached; previously scanned products resolve
  from cache.
- **Your data stays on your device** (IndexedDB). Export/import JSON to back up
  or move between devices. There is no server and no account.

## Deploying (required for camera scanning)

iOS Safari only grants camera access over **HTTPS** (or `localhost`). Any free
static host works. GitHub Pages:

```bash
cd foodlog-pwa
git init && git add . && git commit -m "Food Log PWA"
git branch -M main
git remote add origin git@github.com:<you>/foodlog.git
git push -u origin main
# GitHub -> Settings -> Pages -> Source: main branch, / (root)
```

Then open `https://<you>.github.io/foodlog/` on your iPhone, tap **Share →
Add to Home Screen**. Launched from the home screen it runs full-screen and
IndexedDB gets much better persistence guarantees.

Netlify or Cloudflare Pages work identically — drag the folder in.

### Local testing (no camera)

```bash
python3 -m http.server 8000
# then browse to http://localhost:8000
```

Camera scanning works on `localhost` in Chrome; on a phone you need real HTTPS.
Use the manual barcode box to test lookups without a camera. Try `3017620422003`
(Nutella — NOVA 4) or any packaged item in your kitchen.

## Importing a recipe from the analyzer

```bash
cd ../keto-recipe-analyzer/scripts
python3 analyze_recipe.py ../../FishCakes-Keto.txt --servings 4 --json
```

Copy the JSON, paste it into **Foods → Import from the recipe analyzer**. It becomes
a food you can log by the serving. The importer converts per-serving macros into a
per-100 g block so recipes and packaged products are handled identically.

## Files

| File | Purpose |
|---|---|
| `lib.js` | Pure logic: OFF normalization, net carbs, GI watchlist, totals. No DOM, no network. |
| `store.js` | IndexedDB persistence + JSON export/import. |
| `app.js` | UI wiring, barcode scanning, rendering. |
| `sw.js` | Service worker: offline shell, network-first product cache. |
| `test_lib.js` | Node unit tests for `lib.js` (`node test_lib.js`). |

Run the tests with:

```bash
node test_lib.js    # 38 assertions
```

## Adding to the watchlist

Edit `GI_WATCHLIST` in `lib.js`. Each entry is a regex, a display label, a severity
(`high` = behaves like glucose or worse; `moderate` = a real sugar around GI 50–70),
and a one-line note shown in the warning box.

## Caveats

- Macro data is crowdsourced from Open Food Facts and varies in quality. Treat it as
  an estimate, not a food label.
- **Net carbs = total carbohydrate − fiber**, the US label convention. Products with
  EU labels already exclude fiber from carbohydrate, so their net carbs may read low.
- The GI figures in the notes are typical published ranges, not measurements of the
  specific product.
- This is a tracking tool, not medical or dietary advice.
