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
│                             settings, and the cached-product mirror. Plus
│                             JSON export/import.
├── app.js                  UI wiring: tabs, camera scanning, rendering, the
│                             8-second lookup timeout, offline banner, and the
│                             manual-entry fallback path.
│
├── test_lib.js             Node tests: parsing, macros, GI watchlist, recipe import.
├── test_offline.js         Node tests: every lookup failure mode (timeout, offline,
│                             cache fallback, unknown barcode).
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
node test_lib.js       # 38 assertions: parsing, macros, GI watchlist, recipe import
node test_offline.js   # 29 assertions: timeout, offline, cache fallback, not-found
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
