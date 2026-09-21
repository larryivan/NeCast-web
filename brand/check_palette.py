"""Checks that every colour written in the NeCast figure scripts, card figures, site sources and brand
scripts comes from brand/palette.json.

    python brand/check_palette.py                # the default file sets below
    python brand/check_palette.py FILE ...       # or the given files

A hex colour that is not in the palette is reported with its file and line, and the exit status is 1.
Figure scripts may hold no hex colour at all outside style_ng.R: they refer to the palette by name.
"""
import json
import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
PAPER = Path("/Users/larryivanhan/Desktop/Projects/genomics/DLCoal/notes/paper/manuscript/figures_src")
CARDS = Path("/Users/larryivanhan/Desktop/Projects/genomics/DLCoal/notes/release_20261105/figures")

spec = json.loads((SITE / "brand" / "palette.json").read_text())
allowed = {v["hex"].upper() for v in spec["colours"].values()}
allowed |= {v["hex"].upper() for k, v in spec["continents"].items() if k != "note"}
allowed |= {v["hex"].upper() for group in ("logo", "dark_ui") for k, v in spec[group].items() if k != "note"}

HEX = re.compile(r"#[0-9A-Fa-f]{6}\b")


def files():
    if len(sys.argv) > 1:
        return [Path(a) for a in sys.argv[1:]]
    out = sorted(PAPER.glob("*.R")) + [CARDS / "card_figures.R"]
    out += sorted(f for ext in ("astro", "css", "ts", "tsx", "mjs") for f in (SITE / "src").rglob(f"*.{ext}"))
    out += sorted((SITE / "scripts").glob("*.mjs")) + sorted((SITE / "brand").glob("*.py")) + sorted((SITE / "brand").glob("*.mjs"))
    return out


bad = 0
for path in files():
    if not path.exists():
        continue
    # figure scripts other than the style file must name palette colours, never write them
    strict = path.suffix == ".R" and path.name != "style_ng.R"
    for n, line in enumerate(path.read_text().splitlines(), 1):
        for m in HEX.finditer(line):
            h = m.group(0).upper()
            if strict or h not in allowed:
                print(f"{path}:{n}: {h}" + ("" if h in allowed else " (not in the palette)") + f"   {line.strip()[:110]}")
                bad += 1
print("palette check:", "OK" if not bad else f"{bad} colour(s) to fix")
sys.exit(1 if bad else 0)
