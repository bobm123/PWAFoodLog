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

## Behaviour with a weak or absent connection

The app is offline-first. Everything except *new* barcode lookups works with no
network at all:

| Action | Offline? |
|---|---|
| Open the app (installed to home screen) | Yes — shell is precached |
| Log foods, edit portions, delete entries | Yes |
| Daily totals, calorie split, net-carb budget | Yes |
| Custom foods and imported recipes | Yes |
| Export / import JSON | Yes |
| Scan a barcode you've scanned before | Yes — served from the on-device product cache |
| Scan a **new** barcode | Needs a connection |

Lookups are bounded by an **8-second timeout** (`LOOKUP_TIMEOUT_MS` in `app.js`)
via `AbortController`, because `fetch()` has no timeout of its own and will
otherwise hang for minutes on a weak signal. Every failure resolves to a specific,
actionable message rather than a spinner:

- **Offline, product cached** → serves the saved copy, marked "Saved copy — not refreshed".
- **Offline, nothing cached** → "You're offline and this barcode isn't saved on this
  device. Enter it by hand below."
- **Timed out / unreachable** → falls back to the cached copy if there is one,
  otherwise offers **Retry** and **Enter it by hand**.
- **Barcode genuinely unknown to Open Food Facts** → offers manual entry (no Retry,
  since retrying won't help).

A banner appears whenever the browser reports it is offline. When you enter a food
by hand you can attach the barcode that failed; it is then cached locally, so
scanning that item again resolves instantly, even with no signal.

## Removing the CDN dependency

`index.html` loads the scanner from `vendor/html5-qrcode.min.js` and only falls back
to unpkg if that file is missing. To make the folder fully self-contained:

```bash
./fetch-vendor.sh          # or: powershell -File fetch-vendor.ps1
git add vendor/html5-qrcode.min.js && git commit -m "vendor scanner"
```

Commit the vendored file — a deployed copy without it silently falls back to the CDN.
After vendoring, the only external call left is the Open Food Facts lookup itself.

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

### Local testing

```bash
python3 serve.py          # http://localhost:8000, no-store headers
```

`localhost` is a secure context, so the camera scanner and service worker both work
there. Opening `index.html` as a `file://` URL does **not** work: service workers
don't register and the camera is blocked.

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
| `test_lib.js` | Node unit tests for parsing/macros (`node test_lib.js`). |
| `test_offline.js` | Node unit tests for every lookup failure mode (`node test_offline.js`). |
| `serve.py` | Local dev server on `localhost` (secure context). |
| `fetch-vendor.sh` / `.ps1` | Vendor the scanner library to drop the CDN dependency. |

Run the tests with:

```bash
node test_lib.js       # 38 assertions: parsing, macros, GI watchlist, recipe import
node test_offline.js   # 29 assertions: timeout, offline, cache fallback, not-found
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
