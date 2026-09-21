# NeCast website

The website of NeCast: what the method does, the data behind the paper, and a browser for the
109,248 simulated windows. It is a static site, published with GitHub Pages at
<https://larryivan.github.io/NeCast-web/>, in English and Simplified Chinese.

The data themselves are on Hugging Face (`Larrivhan/NeCast-simulations`, `Larrivhan/NeCast-benchmark`,
`Larrivhan/NeCast-1000G`, and the network `Larrivhan/NeCast`).

## Stack

- [Astro](https://astro.build) with [Starlight](https://starlight.astro.build) for pages, navigation,
  search (Pagefind) and the two languages.
- React for the corpus explorer only; every other page ships no framework code.
- [hyparquet](https://github.com/hyparam/hyparquet) reads the window index in the browser,
  [TanStack Table](https://tanstack.com/table) and [TanStack Virtual](https://tanstack.com/virtual)
  show it, and [Observable Plot](https://observablehq.com/plot/) draws the charts.
- [shadcn/ui](https://ui.shadcn.com) components and Tailwind CSS, with colours taken from
  Starlight's theme so light and dark modes match.
- System fonts only; nothing is loaded from Google or other font services.

## Layout

| path | contents |
|---|---|
| `src/content/docs/` | the pages, in Markdown (MDX); Chinese pages under `zh-cn/` |
| `src/components/explorer/` | the corpus explorer |
| `src/components/ui/` | shadcn/ui components |
| `src/styles/global.css` | Starlight, Tailwind and shadcn styles |
| `src/assets/figures/` | the figures of the pages (drawn in R with the paper's style) |
| `public/data/explorer/` | the explorer's index: `windows.parquet`, the labels, `summary.json` |
| `scripts/build_explorer_data.py` | builds `public/data/explorer/` from the released corpus |
| `scripts/build_social_card.mjs` | draws `public/og.png`, the image that link previews show |

## Working on it

```bash
npm install
npm run dev        # http://localhost:4321/NeCast-web/
npm run build      # into dist/, with a check of every internal link
```

The explorer's index is rebuilt from a copy of `NeCast-simulations` (the index and the window files):

```bash
python scripts/build_explorer_data.py --corpus <NeCast-simulations> --out public/data/explorer
```

The link-preview image reuses the hero drawing of the built home page, and needs Chrome:

```bash
npm run build && node scripts/build_social_card.mjs
```

## Brand

The NeCast mark is an N drawn as a step function: the left stem rises, a high plateau steps
down twice, and the right stem rises again, the shape of a population history with a
bottleneck. It is white on a blue tile whose gradient centres on the NeCast blue (#1F4E9E).
In the name, "Ne" takes the blue.

| file in `brand/` | use |
|---|---|
| `necast-mark.svg`, `necast-mark-1024.png`, `necast-mark-512.png` | the mark |
| `necast-mark-square.svg` | the mark on a full square, for app icons whose platform rounds the corners |
| `necast-glyph.svg`, `necast-glyph-white.svg` | the N alone, for light grounds and for dark or blue ones |
| `necast-lockup.png`, `necast-lockup-dark.png` | the mark and the name, for light and dark grounds |

```bash
python brand/build_brand.py   # the SVGs, and the site's favicon and header logo
node brand/render_png.mjs     # the PNGs and public/apple-touch-icon.png (needs Chrome)
```

## Authors

Yufan Han (larryivanhan@gmail.com) and Ke Wang, [Ke's Lab](https://www.wangke-evoanthropology.site/),
School of Life Sciences, Fudan University.

## Licence

Code: MIT. Text and figures: CC BY 4.0.
