# Food Log — a no-paywall macro & processing tracker

A single-purpose PWA that does the thing no existing iOS app does in one place:
log food by barcode, track macros with a net-carb focus, and **flag ultra-processed
and high-glycemic ingredients** — with no subscription, no ads, and no upsell,
because the data source is free and the app has no backend.

## Install on your iPhone

**➡️ [https://bobm123.github.io/PWAFoodLog/](https://bobm123.github.io/PWAFoodLog/)**

Open that link in **Safari** on your iPhone, then tap **Share → Add to Home
Screen**. Launched from the home screen it runs full-screen, works offline, and
IndexedDB gets much stronger persistence. (The link is live once GitHub Pages is
enabled for the repo — see [Deploying](#deploying-required-for-camera-scanning).)

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
- **Search by name** on the Find tab — log "greek yogurt" without a barcode.
  Search is **local-first**: it queries a bundled on-device food database
  instantly and offline, and Open Food Facts is only contacted when you tap
  *"Search Open Food Facts"* — so normal use never touches the rate-limited
  search API. A live hit you open is cached like a scan for next time.
- **Bundled offline food database**: a subset of the most-scanned foods ships
  with the app and loads into IndexedDB on first launch, so search and barcode
  lookups for common items are instant and work with no signal. See
  [Offline food database](#offline-food-database-the-bundled-seed) for how it's
  built and refreshed.
- **Scan now, fill in later**: a barcode scanned while offline or unreachable is
  recorded to a pending queue; the moment you're back online the app quietly
  resolves it from Open Food Facts and caches it — without overwriting anything
  you entered by hand.
- **NOVA 1–4 processing badge** and **high-GI ingredient flags** on every product.
- **Meals**: every entry belongs to breakfast, lunch, dinner or a snack
  (defaulted from the time of day), and the diary groups entries by meal with
  per-meal subtotals. Entries from before meals existed appear under "Other".
- **Daily totals**: net carbs, fat, protein, calories, and a calorie split bar.
- **A `+` on the diary** opening an add sheet: pick the meal, scan a barcode,
  search by name, log a serving of a saved food, **quick-add** a one-off entry
  by typing its macros — or re-log any of your **recent items in one tap**.
- **Edit in place / log again**: fix an entry's portion (macros rescale
  proportionally) or meal without re-entering it, and repeat any past entry
  onto the day you're viewing.
- **History tab**: the last 14 or 30 days of net carbs and calories as
  charts, your net-carb budget drawn as a reference line with over-budget
  days in red, a days-under-budget streak, and averages over logged days.
  Tap any bar to open that day in the diary.
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
| Scan a barcode in the bundled database or one you've scanned before | Yes — resolved on-device, no network call |
| Search common foods by name | Yes — the bundled database is searched first |
| Meal grouping, edit portion, log again, recents | Yes |
| History charts and streak | Yes |
| Scan a barcode not in the database | Needs a connection (queued for later if offline) |
| Search Open Food Facts for items beyond the bundled set | Needs a connection (on explicit tap) |

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

## Offline food database (the bundled seed)

### Why

Open Food Facts rate-limits **search to 10 requests/min/IP** (and it's a heavy
endpoint), while barcode reads get 15/min. A phone browser can't hold the full
9 GB export, but it doesn't need to: food popularity is extremely long-tailed, so
a few tens of thousands of the most-scanned products cover the overwhelming
majority of real scans. That subset ships with the app, loads into IndexedDB on
first launch, and makes search and common barcodes **instant, offline, and free
of the rate limit**. Live Open Food Facts is kept only as an on-demand fallback
for the long tail.

### How it works at runtime

- On first launch (and whenever `seed/seed-meta.json`'s `version` changes) the app
  fetches `seed/products-us.ndjson.gz`, gunzips it in the browser
  (`DecompressionStream`), runs each line through the same `normalizeProduct()`
  the live API uses, and bulk-imports into the `products` store. Existing rows are
  never overwritten, so a fresher network/manual copy always wins. Re-imports are
  guarded by the stored `seedVersion`, so a reload never re-loads the same seed.
- **Search** (Find tab) is local-first: it scans an in-memory index of the
  on-device corpus and returns instantly. Open Food Facts is queried **only** when
  you tap *"Search Open Food Facts"*, so ordinary use never hits the search limit.
- **Barcode** lookups check the on-device database (seed + your own scans) first
  and only reach out when the item isn't already there.
- **Scan now, fill in later**: a barcode that fails for *connectivity* reasons
  (offline/timeout/unreachable — not a genuine "unknown to OFF") is added to a
  `pending` store. When the browser fires `online`, a throttled reconciler
  (spaced under the 15/min limit) resolves each pending code from Open Food Facts,
  caches it, and drops it from the queue. A genuine not-found is dropped too
  (retrying won't help). It updates only the product cache — never your logged
  entries or hand-entered foods.

Settings → *Offline food database* shows how many products are on the device, the
seed version, and how many scans are still waiting to be filled in.

### Building the full seed on your machine

The repo ships a small, clearly-labeled **sample** seed (~30 common foods) so the
feature works out of the box. Replace it with a real subset built from an Open
Food Facts export. The sandbox can't reach the dataset, so this runs on your
machine:

```bash
pip install duckdb

# 1) Download an export from https://world.openfoodfacts.org/data
#    The CSV export (tab-separated, .csv.gz) has the most stable schema.
#    DuckDB reads the .gz directly — no need to unzip the 9 GB file.

# 2) Build the seed (top 25k most-scanned US foods, ~a few MB gzipped):
cd foodlog-pwa/tools
python build_seed.py \
    --input /path/to/en.openfoodfacts.org.products.csv.gz \
    --output ../seed/products-us.ndjson.gz \
    --limit 25000 --country united-states

# 3) Commit the regenerated seed + its metadata, then push:
git add ../seed/products-us.ndjson.gz ../seed/seed-meta.json
git commit -m "Refresh offline food seed"
```

`build_seed.py` keeps rows that have a numeric barcode, a name, and some nutrition;
ranks them by `unique_scans_n`; keeps the top N; projects only the ~dozen fields
the app uses; and writes each product in Open Food Facts' `product` JSON shape so
the app needs no special-casing. Run it with `--peek` to print the input's columns
and a sample row, and see `--help` for all options (country, limit, Parquet/JSONL
input). Because `seed-meta.json`'s `version` (the build date) changes, every device
re-imports on its next launch.

> Tens of MB is fine on GitHub Pages, but a large seed committed to git bloats the
> repo over time; for anything beyond a few MB consider Git LFS for
> `seed/*.ndjson.gz`.

## Removing the CDN dependency

`index.html` loads the scanner from `vendor/html5-qrcode.min.js` and only falls back
to unpkg if that file is missing. To make the folder fully self-contained:

```bash
./fetch-vendor.sh          # or: powershell -File fetch-vendor.ps1
git add vendor/html5-qrcode.min.js && git commit -m "vendor scanner"
```

Commit the vendored file — a deployed copy without it silently falls back to the CDN.
After vendoring, the only external calls left are the Open Food Facts barcode
lookup and name search.

## Deploying (required for camera scanning)

iOS Safari only grants camera access over **HTTPS** (or `localhost`). Any free
static host works. GitHub Pages:

```bash
cd foodlog-pwa
git push                                   # push to github.com/bobm123/PWAFoodLog
# GitHub -> Settings -> Pages -> Source: Deploy from a branch, main, / (root)
```

Then open **[https://bobm123.github.io/PWAFoodLog/](https://bobm123.github.io/PWAFoodLog/)**
on your iPhone in Safari, tap **Share → Add to Home Screen**. Launched from the
home screen it runs full-screen and IndexedDB gets much better persistence
guarantees. (New here? First-time repo setup — `git init`, `git remote add
origin …`, `git branch -M main` — is only needed once; this repo already has it.)

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

## Project layout

```
foodlog-pwa/
├── index.html              App shell: markup for all four tabs, loads the scripts.
├── styles.css              All styling. Dark theme, no framework, no build step.
├── manifest.webmanifest    PWA metadata: name, icons, standalone display mode.
├── sw.js                   Service worker. Precaches the shell for offline use;
│                             Open Food Facts requests are network-first with a
│                             cache fallback.
├── icon-192.png            Home-screen icons referenced by the manifest.
├── icon-512.png
│
├── lib.js                  Pure logic. No DOM, no network, no side effects:
│                             - normalizeProduct()  Open Food Facts JSON -> internal shape
│                             - scanIngredients()   the high-GI / refined-carb watchlist
│                             - netCarbs(), macrosForGrams(), dailyTotals()
│                             - lookupProduct()     offline-tolerant lookup state machine
│                             - recipeFromAnalyzerJson()  import from the recipe analyzer
├── store.js                IndexedDB persistence: log entries, custom foods,
│                             settings, the cached-product mirror (incl. the
│                             bundled seed), and the pending-scan queue. Plus
│                             JSON export/import.
├── app.js                  UI wiring: tabs, camera scanning, rendering, the
│                             8-second lookup timeout, offline banner, local-first
│                             search, seed import, and the pending reconciler.
│
├── seed/                   The bundled offline food database.
│   ├── products-us.ndjson.gz   gzipped NDJSON, one OFF `product` per line.
│   └── seed-meta.json          {version, count, ...}; version drives re-import.
├── tools/
│   └── build_seed.py       DuckDB script to regenerate seed/ from an OFF export.
│
├── test_lib.js             Node tests: parsing, macros, GI watchlist, recipe import.
├── test_offline.js         Node tests: every lookup failure mode (timeout, offline,
│                             cache fallback, unknown barcode).
├── test_features.js        Node tests: meals, portion rescaling, recents, history
│                             totals and streak, and every name-search failure mode.
├── test_seed.js            Node tests: the bundled seed file is valid and every line
│                             normalizes + computes GI flags; local search over it.
├── smoke.js                Headless-browser end-to-end test (dev only; needs
│                             `npm i playwright`). Drives the real UI: add sheet,
│                             meal groups, edit/log-again, search, History charts.
├── smoke_seed.js           Headless test: first-run seed import, local-first search,
│                             local-first barcode (zero network), pending queue +
│                             online reconcile, version-guarded re-import.
│
├── serve.py                Local dev server on localhost (a secure context, so the
│                             camera and service worker both work).
├── fetch-vendor.sh         Download the scanner library into vendor/ so the app has
├── fetch-vendor.ps1          no CDN dependency. Run once, then commit the result.
├── vendor/                 Holds html5-qrcode.min.js once vendored. Empty by default;
│                             index.html falls back to the CDN when it is.
│
├── LICENSE                 Apache License 2.0 (this project's code).
├── NOTICE                  Attribution notices required by Apache-2.0 s4(d).
├── THIRD-PARTY-NOTICES.md  Every dependency, its licence, and the ODbL analysis.
├── .gitignore
└── README.md               You are here.
```

The split that matters is **`lib.js` has no dependencies on the browser**. Every
decision the app makes — what counts as a net carb, whether an ingredient is a
refined starch, what to do when a lookup times out — lives there and is covered by
tests that run under plain Node. `app.js` only moves data between `lib.js`,
`store.js`, and the DOM.

Run the tests with:

```bash
node test_lib.js        # 45 assertions: parsing, macros, GI watchlist, recipe import
node test_offline.js    # 29 assertions: timeout, offline, cache fallback, not-found
node test_features.js   # 69 assertions: meals, rescaling, recents, history, search
node test_seed.js       # 16 assertions: the bundled seed validates + normalizes
node smoke.js           # optional end-to-end run in headless Chromium (npm i playwright)
node smoke_seed.js      # optional end-to-end: seed import, local search, pending queue
```

## Adding to the watchlist

Edit `GI_WATCHLIST` in `lib.js`. Each entry is a regex, a display label, a severity
(`high` = behaves like glucose or worse; `moderate` = a real sugar around GI 50–70),
and a one-line note shown in the warning box.

## Standing on Open Food Facts

This app is a thin layer over [Open Food Facts](https://world.openfoodfacts.org/).
Every barcode you scan, every ingredient list it reads, every NOVA processing score
it shows, and the additive data behind the flags — all of it comes from their
database. Without it there would be nothing here to build on. It is a free, open,
non-profit project, independent of the food industry, and its product data is
contributed by volunteers, photographed and typed in one label at a time.

That is also why this app has no subscription and never will: the data isn't ours to
charge for.

**If you get any use out of this, please consider
[contributing to Open Food Facts](https://world.openfoodfacts.org/contribute).**
Money is only one way to help, and it isn't the most useful one for a database that
grows by people scanning things:

- **Add a missing product.** When a barcode comes back unknown in this app, that's an
  invitation. Their [iPhone app](https://apps.apple.com/app/open-food-facts/id588797948)
  scans the barcode and uploads photos of the label in about a minute, or you can
  [add it on the website](https://world.openfoodfacts.org/cgi/product.pl?type=search_or_add&action=display).
  The next person to scan that item finds it.
- **Complete a product that's already there.** A NOVA processing score can only be
  computed once a product has a category, an extracted ingredients list, and a filled-in
  nutrition table — the exact three fields this app reads. Plenty of entries have a
  label photo but none of them. There's a standing
  [queue of products to be completed](https://world.openfoodfacts.org/state/to-be-completed),
  and [instructions for helping](https://world.openfoodfacts.org/help-complete-products);
  cropping an ingredients list out of a photo takes seconds, and their OCR does most of it.
- **Improve data quality.** They run an ongoing
  [data quality effort](https://wiki.openfoodfacts.org/Quality) that meets monthly.
- **Translate.** The site, the app, and the ingredient/category taxonomies all need
  [translators](https://wiki.openfoodfacts.org/Translations).
- **Write code.** Everything is open source on
  [GitHub](https://github.com/openfoodfacts) — the Perl/MongoDB backend, the JSON API
  this app calls, the Flutter mobile app, and SDKs in many languages.
- **Tell someone.** Say hello on their [Slack](https://slack.openfoodfacts.org/) or
  just point a friend at the project.

And if you'd rather support them financially, they run an annual fundraiser that pays
for servers, the small permanent team, and staying independent of the food industry:
**[Donate to Open Food Facts](https://world.openfoodfacts.org/donate-to-open-food-facts).**

Product data is made available under the
[Open Database License](https://opendatacommons.org/licenses/odbl/1-0/).

## Licensing

**This project's code is Apache License 2.0** (see `LICENSE`), the same licence as
its only dependency, so a single licence text covers the whole tree.

| What | Licence | Shipped in this repo? |
|---|---|---|
| This app's code | Apache-2.0 | Yes |
| [html5-qrcode](https://github.com/mebjas/html5-qrcode) 2.3.8 (+ bundled ZXing-js) | Apache-2.0 | Only after `fetch-vendor.sh` |
| [Open Food Facts](https://world.openfoodfacts.org/) product data | [ODbL v1.0](https://opendatacommons.org/licenses/odbl/1-0/) | No — fetched at runtime |

### Why Apache-2.0 and ODbL don't conflict

The Open Database License governs **databases**, not code that reads them. Its
share-alike provision attaches to a *Derivative Database* you publicly use or
distribute. This app ships no Open Food Facts data: it queries their API on demand
and caches results in the user's own browser. That is neither a derivative database
nor a public distribution, so ODbL puts no condition on the source licence.

ODbL does require **attribution** for a "Produced Work" — anything generated from
the database, like the product card this app renders. That notice appears in the app
under *Settings → About the flags*, and in `NOTICE` here.

One forward-looking caveat: if you ever bundle an Open Food Facts data dump for fully
offline lookup, you would then be distributing a derivative database, and ODbL
share-alike would apply **to that data**. It still wouldn't relicense your code, but
the bundled subset would have to stay ODbL and carry its attribution.

### If you vendor the scanner

Apache-2.0 §4(a) says anyone you redistribute the library to must receive a copy of
its licence. `fetch-vendor.sh` downloads `vendor/html5-qrcode-LICENSE.txt` next to
the library for exactly this reason — commit both. Using the CDN fallback instead
means you aren't redistributing it, and the obligation doesn't arise.

Full detail, including the ZXing-js sub-dependency, is in
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md). None of this is legal advice; if
the stakes are commercial, have a lawyer read the licences rather than this README.

## Caveats

- Macro data is crowdsourced from Open Food Facts and varies in quality. Treat it as
  an estimate, not a food label.
- **Net carbs = total carbohydrate − fiber**, the US label convention. Products with
  EU labels already exclude fiber from carbohydrate, so their net carbs may read low.
- The GI figures in the notes are typical published ranges, not measurements of the
  specific product.
- This is a tracking tool, not medical or dietary advice.
