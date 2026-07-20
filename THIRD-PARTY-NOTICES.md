# Third-party notices

A complete accounting of everything this project uses that it did not write,
and the licence each carries. Verified against upstream sources.

## Software

| Component | Version | Licence | Distributed with this repo? |
|---|---|---|---|
| [html5-qrcode](https://github.com/mebjas/html5-qrcode) | 2.3.8 | Apache-2.0 | Only after `fetch-vendor.sh`, into `vendor/` |
| [ZXing-js](https://github.com/zxing-js/library) (bundled inside html5-qrcode) | — | Apache-2.0 | Same as above |

`html5-qrcode` declares `"license": "Apache-2.0"` and has **no runtime
dependencies**. Its distributed bundle incorporates the ZXing-js port, which is
also Apache-2.0. So the entire scanner stack is under a single licence, matching
this project's own.

Everything else — `lib.js`, `store.js`, `app.js`, `sw.js`, `index.html`,
`styles.css`, `serve.py`, the tests, and the icons — is original work under
Apache-2.0. There is no build step and no package manager, so there is no
transitive dependency tree to audit.

### Redistribution obligation

Apache-2.0 §4(a) requires that anyone you give the library to also receives a
copy of the licence. `fetch-vendor.sh` therefore downloads
`vendor/html5-qrcode-LICENSE.txt` alongside `vendor/html5-qrcode.min.js`.
**Commit both.** If you serve the app from the CDN fallback instead, you are not
redistributing the library and the obligation does not arise — but keeping the
notice costs nothing.

## Data

| Source | Licence | Distributed with this repo? |
|---|---|---|
| [Open Food Facts](https://world.openfoodfacts.org/) product data | [ODbL v1.0](https://opendatacommons.org/licenses/odbl/1-0/) | **No** — fetched from their API at runtime |
| Product images served by Open Food Facts | CC-BY-SA | No — referenced by URL, never copied |

No Open Food Facts data ships in this repository. The app queries their API on
demand and caches results in the user's own browser (IndexedDB). That cache is
private to the device and is deliberately excluded from the JSON export.

### What ODbL does and does not require here

The Open Database License governs **databases**, not the code that reads them.
Its share-alike provision (§4.4) attaches to a *Derivative Database* that you
publicly use or distribute. Querying an API and caching the responses on the end
user's own device is neither, so ODbL places no condition on this project's
source licence. That is why Apache-2.0 and ODbL coexist without conflict.

What ODbL *does* ask for is **attribution** (§4.3): a Produced Work — anything
visually generated from the database, such as the product card this app renders —
must carry a notice of the source and its licence. The app satisfies this in
**Settings → About the flags**, and this repository does so here and in `NOTICE`.

> If you ever bundle an Open Food Facts data dump into the repo (for fully
> offline barcode lookup, as the README floats), that changes things: you would
> then be distributing a Derivative Database, and ODbL §4.4 share-alike would
> apply **to that data**. It still would not relicense your code — but the data
> subset would have to remain ODbL and carry its attribution.

None of the above is legal advice. If the stakes are commercial, have a lawyer
read the licences rather than this file.
