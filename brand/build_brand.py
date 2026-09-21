"""Draws the NeCast mark and its variants into brand/ (SVG), and copies the mark to the site.

The mark is an N drawn as a step function: the left stem rises, a high plateau steps down twice
to a low plateau, and the right stem rises again, the shape of a population history with a
bottleneck. White on a purple tile whose gradient centres on NeCast's purple (#5242A7); every colour
is from brand/palette.json.

The N is drawn as an outline on a 64-unit grid rather than as a stroked line, so each part has
its own measure: stems 5 units wide, treads 4.6 high (a horizontal looks heavier than a vertical
of the same width), 3.6 units of blue between neighbouring verticals, so the steps stay open at
small sizes. Outer corners turn with a radius of 4.2, inner ones with 0.6, and the two ends are
round and reach 0.35 past the top and bottom edges, so they look as tall as the flat edges.

    python brand/build_brand.py            # writes brand/*.svg, public/favicon.svg, src/assets/logo.svg
    node brand/render_png.mjs              # then the PNG sizes, with headless Chrome
"""
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NECAST, TOP, BOTTOM = "#5242A7", "#6957C1", "#40318C"  # palette: necast, logo tile_top, logo tile_bottom

STEM, TREAD, GAP, DROP = 5.0, 4.6, 3.6, 14.5
OUTER, INNER, OVERSHOOT = 4.2, 0.6, 0.35
CENTRE = (32.0, 31.5)  # a little above the middle of the tile


def outline(vertices):
    """Closed path through the vertices, each corner ((x, y), r) turned with a circular arc of radius r."""
    corners = []
    for k, ((x, y), r) in enumerate(vertices):
        (xp, yp), (xn, yn) = vertices[k - 1][0], vertices[(k + 1) % len(vertices)][0]
        li, lo = math.hypot(x - xp, y - yp), math.hypot(xn - x, yn - y)
        di, do = ((x - xp) / li, (y - yp) / li), ((xn - x) / lo, (yn - y) / lo)
        sweep = 1 if di[0] * do[1] - di[1] * do[0] > 0 else 0
        corners.append(((x - di[0] * r, y - di[1] * r), (x + do[0] * r, y + do[1] * r), r, sweep))
    d = "M{:.2f} {:.2f}".format(*corners[0][1])
    for (x1, y1), (x2, y2), r, sweep in corners[1:] + corners[:1]:
        d += f"L{x1:.2f} {y1:.2f}A{r:.2f} {r:.2f} 0 0 {sweep} {x2:.2f} {y2:.2f}"
    return d + "Z"


# the four verticals (stems and risers) and the three tread levels, centred on CENTRE
pitch = STEM + GAP
width, height = 3 * pitch + STEM, 2 * DROP + TREAD
xs = [CENTRE[0] - width / 2 + STEM / 2 + k * pitch for k in range(4)]
ys = [CENTRE[1] - height / 2 + TREAD / 2 + k * DROP for k in range(3)]
v, h, end = STEM / 2, TREAD / 2, STEM / 2
top, bottom = ys[0] - h, ys[2] + h
# clockwise from the foot of the left stem
GLYPH = outline([
    ((xs[0] - v, bottom + OVERSHOOT), end), ((xs[0] - v, top), OUTER), ((xs[1] + v, top), OUTER),
    ((xs[1] + v, ys[1] - h), INNER), ((xs[2] + v, ys[1] - h), OUTER), ((xs[2] + v, ys[2] - h), INNER),
    ((xs[3] - v, ys[2] - h), INNER), ((xs[3] - v, top - OVERSHOOT), end), ((xs[3] + v, top - OVERSHOOT), end),
    ((xs[3] + v, bottom), OUTER), ((xs[2] - v, bottom), OUTER), ((xs[2] - v, ys[1] + h), INNER),
    ((xs[1] - v, ys[1] + h), OUTER), ((xs[1] - v, ys[0] + h), INNER), ((xs[0] + v, ys[0] + h), INNER),
    ((xs[0] + v, bottom + OVERSHOOT), end),
])


def glyph(color):
    return f'<path d="{GLYPH}" fill="{color}"/>'


def gradient(gid):
    return (f'<defs><linearGradient id="{gid}" x1="0" y1="0" x2="1" y2="1">'
            f'<stop offset="0" stop-color="{TOP}"/><stop offset="1" stop-color="{BOTTOM}"/></linearGradient></defs>')


def svg(view, body, title="NeCast"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" role="img" aria-label="{title}">'
            f'<title>{title}</title>{body}</svg>\n')


mark = svg("0 0 64 64", gradient("necast-tile") + '<rect width="64" height="64" rx="14.5" fill="url(#necast-tile)"/>' + glyph("#fff"))
# full-bleed square for app icons (the platform rounds the corners itself)
square = svg("0 0 64 64", gradient("necast-square") + '<rect width="64" height="64" fill="url(#necast-square)"/>' + glyph("#fff"))
# the glyph alone, cropped to its outline, in purple for light grounds and white for dark or purple ones
crop = f"{xs[0] - v:.2f} {top - OVERSHOOT:.2f} {width:.2f} {height + 2 * OVERSHOOT:.2f}"
glyph_purple = svg(crop, glyph(NECAST))
glyph_white = svg(crop, glyph("#fff"))

out = ROOT / "brand"
for name, text in {"necast-mark.svg": mark, "necast-mark-square.svg": square,
                   "necast-glyph.svg": glyph_purple, "necast-glyph-white.svg": glyph_white}.items():
    (out / name).write_text(text)
(ROOT / "public" / "favicon.svg").write_text(mark)
(ROOT / "src" / "assets" / "logo.svg").write_text(mark)
print(f"N {width:.1f} x {height:.1f} units, crop {crop}")
