"""Draws the NeCast mark and its variants into brand/ (SVG), and copies the mark to the site.

The mark is an N drawn as a step function: the left stem rises, a high plateau steps down twice
to a low plateau, and the right stem rises again, the shape of a population history with a
bottleneck. White on a blue tile whose gradient centres on the NeCast blue (#1F4E9E).

    python brand/build_brand.py            # writes brand/*.svg, public/favicon.svg, src/assets/logo.svg
    node brand/render_png.mjs              # then the PNG sizes, with headless Chrome
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BLUE, TOP, BOTTOM = "#1F4E9E", "#2C62BF", "#163C80"


def rounded(points, r):
    """Polyline through points, each bend rounded on the centre line with radius r."""
    d = f"M{points[0][0]:.2f} {points[0][1]:.2f}"
    for k in range(1, len(points) - 1):
        (xa, ya), (xb, yb), (xc, yc) = points[k - 1], points[k], points[k + 1]

        def toward(x0, y0, x1, y1):
            length = ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5
            return x0 + (x1 - x0) * r / length, y0 + (y1 - y0) * r / length

        (x1, y1), (x2, y2) = toward(xb, yb, xa, ya), toward(xb, yb, xc, yc)
        d += f"L{x1:.2f} {y1:.2f}Q{xb:.2f} {yb:.2f} {x2:.2f} {y2:.2f}"
    return d + f"L{points[-1][0]:.2f} {points[-1][1]:.2f}"


# the N on a 64-unit grid: stems at x 20.5 and 43.5, from y 18.5 to 45.5; three treads, two drops
X0, X1, Y0, Y1 = 20.5, 43.5, 18.5, 45.5
TREAD, DROP = (X1 - X0) / 3, (Y1 - Y0) / 2
POINTS = [(X0, Y1), (X0, Y0), (X0 + TREAD, Y0), (X0 + TREAD, Y0 + DROP), (X0 + 2 * TREAD, Y0 + DROP),
          (X0 + 2 * TREAD, Y1), (X1, Y1), (X1, Y0)]
STROKE = 5.5
# Each bend is rounded with half the stroke width on the centre line: the outer edge then turns
# with a radius of one stroke width and the inner edge meets in a clean corner. The treads are too
# short for a larger radius; it would leave notches where neighbouring bends meet.
GLYPH = rounded(POINTS, STROKE / 2)


def glyph(color, width=STROKE):
    return (f'<path d="{GLYPH}" fill="none" stroke="{color}" stroke-width="{width}" '
            f'stroke-linecap="round" stroke-linejoin="round"/>')


def gradient(gid):
    return (f'<defs><linearGradient id="{gid}" x1="0" y1="0" x2="1" y2="1">'
            f'<stop offset="0" stop-color="{TOP}"/><stop offset="1" stop-color="{BOTTOM}"/></linearGradient></defs>')


def svg(view, body, title="NeCast"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" role="img" aria-label="{title}">'
            f'<title>{title}</title>{body}</svg>\n')


mark = svg("0 0 64 64", gradient("necast-tile") + '<rect width="64" height="64" rx="14.5" fill="url(#necast-tile)"/>' + glyph("#fff"))
# full-bleed square for app icons (the platform rounds the corners itself)
square = svg("0 0 64 64", gradient("necast-square") + '<rect width="64" height="64" fill="url(#necast-square)"/>' + glyph("#fff"))
# the glyph alone, cropped to its stroke, in blue for light grounds and white for dark or blue ones
pad = STROKE / 2
crop = f"{X0 - pad:.2f} {Y0 - pad:.2f} {X1 - X0 + STROKE:.2f} {Y1 - Y0 + STROKE:.2f}"
glyph_blue = svg(crop, glyph(BLUE))
glyph_white = svg(crop, glyph("#fff"))

out = ROOT / "brand"
for name, text in {"necast-mark.svg": mark, "necast-mark-square.svg": square,
                   "necast-glyph.svg": glyph_blue, "necast-glyph-white.svg": glyph_white}.items():
    (out / name).write_text(text)
(ROOT / "public" / "favicon.svg").write_text(mark)
(ROOT / "src" / "assets" / "logo.svg").write_text(mark)
print(GLYPH)
