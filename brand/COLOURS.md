# NeCast colours

One colour, one meaning, everywhere: the paper's figures, the Hugging Face cards, this site and the
logo. The values live in `palette.json`; this page explains them. `python brand/check_palette.py`
checks every figure script, card script and site source against the file, and figure scripts may
not write a hex code at all: they name a colour from `style_ng.R`, which copies this palette.

## Rules

1. Hue marks a method. NeCast is purple; phlash, SMC++, FitCoal and MSMC2 each have one colour.
2. NeCast's own variants, parts and inputs use NeCast's purple at five lightness steps. Another
   method's variant (without errors, other settings) is `tint()` of that method's colour.
3. Truth, text, axes and anything that belongs to no method are ink and one grey scale.
4. The only derivations allowed are `tint()` of a method colour for a variant of that method, and
   transparency for bands and regions. Text in a colour too light to read takes the next darker
   step of its family: `necast_light` → `necast_mid`, `grey_400` and `grey_500` → `grey_600`, `mutation` →
   `mutation_dark`, `smcpp` and its 0.35 tint → `smcpp_dark`, another method's 0.35 tint → the method
   colour (`text_col()` in `style_ng.R`).
5. Continents are a separate encoding, used only in population figures and always labelled directly.
6. Scenario families are told apart by point shape or by panel, never by colour.

## NeCast

| name | hex | meaning |
|---|---|---|
| `necast_deep` | #302661 | true maps (the oracle condition); the site encoder |
| `necast` | #5242A7 | NeCast; its network; both maps; homozygous derived genotype; "NeCast better"; site accent; logo |
| `necast_mid` | #786AC4 | the recombination map: its traces and the recombination-map-only condition; summary statistics |
| `necast_light` | #AEA6DC | `tint(necast)`: NeCast without errors or on simulated windows; PSMC+ posterior; heterozygous genotype |
| `necast_pale` | #DFDBF1 | fills behind NeCast; the site's accent background |

## Other methods and the data

| name | hex | meaning |
|---|---|---|
| `phlash` | #D4623A | phlash |
| `smcpp` | #6E9F90 | SMC++ |
| `smcpp_dark` | #4C7F70 | text in SMC++'s colour |
| `fitcoal` | #5C85A9 | FitCoal |
| `msmc2` | #846475 | MSMC2 |
| `mutation` | #B49A6E | the mutation map: its traces and the mutation-map-only condition |
| `mutation_dark` | #96815E | text in the mutation map's colour |
| `false_variant` | #E0A33B | false variants (sequencing errors), and nothing else |

Missing genotypes are empty cells (white, outlined in `grey_300` or `grey_400`); the ancestral
state is `grey_100`.

## Ink and greys

| name | hex | meaning |
|---|---|---|
| `ink` | #1F2328 | truth, text, titles |
| `grey_800` | #4A4F57 | secondary text, tick labels |
| `grey_700` | #6B7078 | axes; "NeCast worse"; the far end of a scale that starts at NeCast |
| `grey_600` | #7D838B | points without a method, annotations, centromeres |
| `grey_500` | #9AA0A7 | muted data: training curves, the oracle point |
| `grey_400` | #AEB3BA | no map; a tie; deme outlines |
| `grey_300` | #C3C8CF | a tie that depends on the metric; connectors; outlines of missing cells |
| `grey_200` | #D5DAE0 | card borders; the small source deme; the rate-level step behind a bar |
| `grey_150` | #E4E7EB | background curves; chromosome bars; deme fills |
| `grey_100` | #ECEEF1 | grid lines; ancestral genotype |
| `grey_50` | #F7F8FA | card fills; the middle of a diverging scale |
| `white` | #FFFFFF | paper; missing genotype |

## Continents (population figures only)

`hcl(h, c = 60, l = 50)`: Africa 62 (#947300), Europe 250 (#4A79B6), South Asia 305 (#A55BA9),
East Asia 158 (#008C62), Americas 18 (#B06156). Populations within a group are an HCL ramp of the
group's hue. Seven well-separated hues at one lightness do not exist, so Europe sits near FitCoal
and the Americas near phlash; these colours never share a panel with those methods.

## Logo and the site's dark theme

The tile runs from #6957C1 to #40318C. The site's dark theme uses #282150, #9E8FE5 and #DBD6F5
for the accent and #B2A6ED for "Ne" in the name; the site's other neutrals are Starlight's grey
tokens.
