#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Robert Marchese
"""
build_seed.py -- turn an Open Food Facts bulk export into a small, app-shaped
seed database of the most-scanned foods for offline name search + barcode.

WHY THIS EXISTS
    Open Food Facts rate-limits *search* to 10 req/min/IP and that endpoint is
    heavy. This script bakes the popular foods straight into the app so search
    is instant and offline; the live API is only a fallback for the long tail.

WHAT IT DOES
    Reads the full OFF export, keeps rows that are (a) sold in the chosen
    country, (b) have a numeric barcode, (c) have a product name, and (d) have
    at least some nutrition data; ranks them by popularity (unique_scans_n);
    keeps the top N; projects ONLY the ~dozen fields the app uses; and writes a
    gzipped NDJSON file where each line is shaped like an Open Food Facts API
    `product` object -- so the app can run its existing normalizeProduct() over
    each line with zero special-casing.

INPUT (any one of these -- pick what you have; auto-detected by extension)
    * CSV/TSV export  (recommended -- flat columns, stable names)
        https://world.openfoodfacts.org/data  ->  "CSV" (tab-separated, .csv.gz)
        DuckDB reads the .gz directly; you do NOT need to unzip the 9 GB file.
    * Parquet export (smaller, but multilingual columns are nested structs)
        https://huggingface.co/datasets/openfoodfacts/product-database
        Use --schema parquet and eyeball the mapping with --peek first; OFF's
        parquet schema shifts more than the CSV's.
    * JSONL export (.jsonl.gz)

USAGE
    pip install duckdb
    # from the CSV/TSV export (default schema):
    python build_seed.py --input en.openfoodfacts.org.products.csv.gz \
        --output ../seed/products-us.ndjson.gz --limit 25000 --country united-states

    # inspect columns / a sample row before committing to a mapping:
    python build_seed.py --input <file> --peek

OUTPUT
    ../seed/products-us.ndjson.gz   the seed the app fetches on first launch
    ../seed/seed-meta.json          {version, builtAt, count, country, limit}
    Commit both. The app re-imports only when seed-meta.json's version changes.
"""
import argparse, gzip, json, os, sys, datetime

# The app reads exactly these. Keeping the list here (not scattered) is the
# single source of truth for "what the seed needs to carry".
NUTRIMENT_COLS = [
    "energy-kcal_100g", "fat_100g", "carbohydrates_100g",
    "fiber_100g", "proteins_100g", "sugars_100g",
]

# CSV/TSV export column names (flat, stable). If OFF renames one, fix it here.
CSV_COLS = {
    "code": "code",
    "product_name": "product_name",
    "brands": "brands",
    "countries": "countries_tags",
    "additives": "additives_tags",
    "ingredients": "ingredients_text",
    "nova": "nova_group",
    "serving_size": "serving_size",
    "serving_quantity": "serving_quantity",
    "image": "image_small_url",
    "popularity": "unique_scans_n",
}


def detect_schema(path):
    p = path.lower()
    if p.endswith(".parquet"):
        return "parquet"
    if ".jsonl" in p or p.endswith(".ndjson") or p.endswith(".ndjson.gz"):
        return "jsonl"
    return "csv"


def reader_expr(path, schema):
    """A DuckDB table expression for the input file."""
    if schema == "parquet":
        return f"read_parquet('{path}')"
    if schema == "jsonl":
        return f"read_json_auto('{path}', format='newline_delimited', ignore_errors=true)"
    # CSV/TSV: the OFF export is TAB-separated with a header. all_varchar keeps
    # DuckDB from choking on the many ragged columns; we cast what we need.
    return (f"read_csv('{path}', delim='\t', header=true, "
            f"quote='', all_varchar=true, ignore_errors=true)")


def peek(con, src):
    print("-- columns --")
    cols = con.execute(f"DESCRIBE SELECT * FROM {src} LIMIT 0").fetchall()
    for name, typ, *_ in cols:
        print(f"  {name}\t{typ}")
    print("\n-- one sample row --")
    row = con.execute(f"SELECT * FROM {src} LIMIT 1").fetchdf()
    with __import__("pandas").option_context("display.max_columns", None,
                                             "display.width", 200):
        print(row.T)


def build_csv_query(src, country, limit):
    c = CSV_COLS
    # Cast every numeric field ONCE in the inner CTE (trimming whitespace-only
    # cells to NULL), so both the "has nutrition" filter and the projection use
    # the parsed number -- not the raw text, which can be a stray space.
    nutri = ", ".join(
        f"TRY_CAST(NULLIF(trim(\"{col}\"), '') AS DOUBLE) AS \"{col}\""
        for col in NUTRIMENT_COLS
    )
    has_nutrition = " OR ".join(f'"{col}" IS NOT NULL' for col in NUTRIMENT_COLS)
    # additives_tags is a comma-joined string in the CSV; split to a list and
    # drop empties so the app sees a clean array of e-number tags.
    return f"""
    WITH parsed AS (
        SELECT
            trim("{c['code']}")               AS code,
            trim("{c['product_name']}")       AS product_name,
            NULLIF(trim("{c['brands']}"), '') AS brands,
            TRY_CAST(trim("{c['nova']}") AS INTEGER) AS nova_group,
            list_filter(
                string_split(COALESCE("{c['additives']}", ''), ','),
                x -> length(trim(x)) > 0
            ) AS additives_tags,
            NULLIF(trim("{c['ingredients']}"), '')   AS ingredients_text,
            NULLIF(trim("{c['serving_size']}"), '')  AS serving_size,
            TRY_CAST(NULLIF(trim("{c['serving_quantity']}"), '') AS DOUBLE) AS serving_quantity,
            NULLIF(trim("{c['image']}"), '')         AS image_front_small_url,
            TRY_CAST(NULLIF(trim("{c['popularity']}"), '') AS BIGINT) AS scans,
            {nutri}
        FROM {src}
        WHERE trim("{c['code']}") SIMILAR TO '[0-9]+'
          AND COALESCE(trim("{c['product_name']}"), '') <> ''
          AND lower(COALESCE("{c['countries']}", '')) LIKE '%{country}%'
    )
    SELECT * EXCLUDE (scans)
    FROM parsed
    WHERE ({has_nutrition})
    ORDER BY scans DESC NULLS LAST
    LIMIT {limit}
    """


def row_to_product(r):
    """One result row -> an OFF-API-`product`-shaped dict (one NDJSON line)."""
    nutriments = {}
    for col in NUTRIMENT_COLS:
        v = r[col]
        if v is not None:
            nutriments[col] = v
    prod = {
        "code": str(r["code"]),
        "product_name": r["product_name"] or "",
        "brands": r["brands"] or "",
        "nova_group": r["nova_group"],
        "additives_tags": list(r["additives_tags"] or []),
        "ingredients_text": r["ingredients_text"] or "",
        "serving_size": r["serving_size"] or "",
        "serving_quantity": r["serving_quantity"],
        "image_front_small_url": r["image_front_small_url"] or "",
        "nutriments": nutriments,
    }
    return prod


def main():
    ap = argparse.ArgumentParser(description="Build the offline food seed for the PWA.")
    ap.add_argument("--input", required=True, help="OFF export: .csv[.gz]/.tsv, .parquet, or .jsonl[.gz]")
    ap.add_argument("--output", default="../seed/products-us.ndjson.gz")
    ap.add_argument("--meta", default="../seed/seed-meta.json")
    ap.add_argument("--limit", type=int, default=25000, help="keep the top N most-scanned (default 25000)")
    ap.add_argument("--country", default="united-states",
                    help="substring matched against countries_tags (default united-states)")
    ap.add_argument("--schema", choices=["auto", "csv", "parquet", "jsonl"], default="auto")
    ap.add_argument("--peek", action="store_true", help="print columns + a sample row, then exit")
    args = ap.parse_args()

    try:
        import duckdb
    except ImportError:
        sys.exit("duckdb is required:  pip install duckdb")

    schema = detect_schema(args.input) if args.schema == "auto" else args.schema
    con = duckdb.connect()
    src = reader_expr(args.input, schema)

    if args.peek:
        peek(con, src)
        return

    if schema != "csv":
        sys.exit(
            "Only the CSV/TSV export has a stable flat schema this script maps "
            "directly. For --schema parquet/jsonl, run with --peek and adapt "
            "build_csv_query() to the nested column names OFF uses there."
        )

    print(f"Reading {args.input} (schema={schema}) ...", file=sys.stderr)
    q = build_csv_query(src, args.country.lower(), args.limit)
    cur = con.execute(q)
    cols = [d[0] for d in cur.description]

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    n = 0
    with gzip.open(args.output, "wt", encoding="utf-8") as out:
        while True:
            batch = cur.fetchmany(5000)
            if not batch:
                break
            for tup in batch:
                r = dict(zip(cols, tup))
                out.write(json.dumps(row_to_product(r), ensure_ascii=False, separators=(",", ":")))
                out.write("\n")
                n += 1
            print(f"  {n} written...", file=sys.stderr)

    version = datetime.date.today().isoformat()
    meta = {
        "version": version,
        "builtAt": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "count": n,
        "country": args.country,
        "limit": args.limit,
        "file": os.path.basename(args.output),
    }
    with open(args.meta, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    size = os.path.getsize(args.output)
    print(f"\nWrote {n} products to {args.output} ({size/1e6:.1f} MB gzipped)",
          file=sys.stderr)
    print(f"Wrote {args.meta} (version {version})", file=sys.stderr)
    print("Commit both files, then push. The app imports on next launch.",
          file=sys.stderr)


if __name__ == "__main__":
    main()
