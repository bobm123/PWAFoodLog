"""Extract the recipes in a folder to text, the way a paste would carry them.

The output is the corpus the recipe-paste parser is measured against: pymupdf's
get_text() reproduces the same damage a real paste carries, including the lost
"fl" ligature that turns "flour" into "our" in ATK print-outs.

    python tools/corpus_extract.py "D:/.../TestRecipes" out_dir

Handles .pdf (needs pymupdf: pip install pymupdf), .docx and .txt. It does NOT
handle .doc, .pages, .rtf, .webarchive or the photos in TestRecipes -- those
were converted by hand, so a run here reproduces most of the 89-file corpus but
not all of it. A file it cannot read is reported, not skipped silently.

Idempotent: a source whose .txt already exists and is newer is skipped, so an
interrupted run resumes. Pass --force to re-extract everything.

Writes ONLY into out_dir, which it creates; it never writes beside the sources.
"""
import io
import os
import re
import sys
import zipfile


def pdf_text(src):
    import pymupdf                              # imported late: only PDFs need it
    doc = pymupdf.open(src)
    try:
        return "\n".join(pg.get_text() for pg in doc)
    finally:
        doc.close()


def docx_text(src):
    """A .docx is a zip of XML. One paragraph per line, tags stripped.

    Good enough for this corpus -- the parser only ever sees lines of text --
    and it keeps the tool dependency-free for everything except PDFs.
    """
    with zipfile.ZipFile(src) as z:
        xml = z.read("word/document.xml").decode("utf-8", "replace")
    # A paragraph end is a line break, and so is an explicit <w:br/>: one ATK
    # document separates every ingredient that way inside a single paragraph,
    # and dropping those ran the whole list onto one line.
    xml = re.sub(r"</w:p\s*>", "\n", xml)
    xml = re.sub(r"<w:br[^>]*/?>", "\n", xml)
    xml = re.sub(r"<w:tab[^>]*/>", "\t", xml)
    xml = re.sub(r"<[^>]+>", "", xml)
    for ent, ch in (("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"),
                    ("&quot;", '"'), ("&apos;", "'")):
        xml = xml.replace(ent, ch)
    return xml


READERS = {".pdf": pdf_text, ".docx": docx_text,
           ".txt": lambda s: io.open(s, encoding="utf-8", errors="replace").read()}


def main(argv):
    force = "--force" in argv
    args = [a for a in argv if not a.startswith("--")]
    if len(args) != 2:
        print(__doc__)
        return 2
    src_dir, out_dir = args

    if not os.path.isdir(src_dir):
        print("not a folder: " + src_dir)
        return 1
    os.makedirs(out_dir, exist_ok=True)

    done = skipped = failed = 0
    unhandled = {}
    for name in sorted(os.listdir(src_dir)):
        src = os.path.join(src_dir, name)
        if not os.path.isfile(src):
            continue
        stem, ext = os.path.splitext(name)
        reader = READERS.get(ext.lower())
        if reader is None:
            unhandled[ext.lower()] = unhandled.get(ext.lower(), 0) + 1
            continue

        out = os.path.join(out_dir, stem + ".txt")
        if os.path.abspath(out) == os.path.abspath(src):
            continue                             # a .txt already in out_dir
        if not force and os.path.exists(out) and \
                os.path.getmtime(out) >= os.path.getmtime(src):
            skipped += 1
            continue

        try:
            txt = reader(src)
        except ImportError:
            print("  FAILED %s: pymupdf is not installed (pip install pymupdf)"
                  % name)
            failed += 1
            continue
        except Exception as exc:                 # corrupt, encrypted, odd zip
            print("  FAILED %s: %s" % (name, exc))
            failed += 1
            continue

        io.open(out, "w", encoding="utf-8").write(txt)
        done += 1

    print("extracted %d, skipped %d (already current), failed %d -> %s"
          % (done, skipped, failed, out_dir))
    if unhandled:
        print("not handled (converted by hand for the original corpus): " +
              ", ".join("%s x%d" % (e, n) for e, n in sorted(unhandled.items())))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
