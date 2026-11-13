"""Extract every PDF in a folder to text, the way a phone's share-to-text does.

The output is the corpus the recipe-paste parser is measured against: pymupdf's
get_text() reproduces the same damage a real paste carries, including the lost
"fl" ligature that turns "flour" into "our" in ATK print-outs.

    python tools/corpus_extract.py "D:/.../TestRecipes" out_dir

Idempotent: a PDF whose .txt already exists and is newer is skipped, so an
interrupted run resumes. Pass --force to re-extract everything.

Needs pymupdf (pip install pymupdf). Writes ONLY into out_dir, which it creates;
it never writes beside the PDFs.
"""
import io
import os
import sys


def main(argv):
    force = "--force" in argv
    args = [a for a in argv if not a.startswith("--")]
    if len(args) != 2:
        print(__doc__)
        return 2
    src_dir, out_dir = args

    try:
        import pymupdf
    except ImportError:
        print("pymupdf is not installed: pip install pymupdf")
        return 1

    if not os.path.isdir(src_dir):
        print("not a folder: " + src_dir)
        return 1
    os.makedirs(out_dir, exist_ok=True)

    done = skipped = failed = 0
    for name in sorted(os.listdir(src_dir)):
        if not name.lower().endswith(".pdf"):
            continue
        src = os.path.join(src_dir, name)
        out = os.path.join(out_dir, os.path.splitext(name)[0] + ".txt")

        if not force and os.path.exists(out) and \
                os.path.getmtime(out) >= os.path.getmtime(src):
            skipped += 1
            continue

        try:
            doc = pymupdf.open(src)
            txt = "\n".join(pg.get_text() for pg in doc)
            doc.close()
        except Exception as exc:                  # a corrupt or encrypted PDF
            print("  FAILED %s: %s" % (name, exc))
            failed += 1
            continue

        io.open(out, "w", encoding="utf-8").write(txt)
        done += 1

    print("extracted %d, skipped %d (already current), failed %d -> %s"
          % (done, skipped, failed, out_dir))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
