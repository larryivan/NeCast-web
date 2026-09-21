// Draws public/og.png, the 1200 x 630 image that link previews show for the site.
//
// The card reuses the hero drawing exactly as the built home page renders it, so run a build
// first, then this script with Chrome installed:
//
//   npm run build && node scripts/build_social_card.mjs
//
// CHROME may point to another Chrome or Chromium binary.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const home = readFileSync(join(root, 'dist/index.html'), 'utf8');
const mark = readFileSync(join(root, 'src/assets/logo.svg'), 'utf8');
const drawing = home.match(/<svg class="hero-visual[\s\S]*?<\/svg>/)?.[0];
if (!drawing) throw new Error('No hero drawing in dist/index.html; run `npm run build` first.');

// the light theme's colours, fixed, with no animation; every colour is from brand/palette.json
const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #fff; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', Arial, sans-serif; }
  .card { position: relative; box-sizing: border-box; width: 1200px; height: 630px; padding: 0 72px;
    display: grid; grid-template-columns: 540px 1fr; gap: 40px; align-items: center; }
  .card::before { content: ''; position: absolute; inset: 0;
    background-image: radial-gradient(circle at 74% 50%, rgba(82, 66, 167, 0.1), transparent 34%),
      linear-gradient(to right, rgba(213, 218, 224, 0.6) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(213, 218, 224, 0.6) 1px, transparent 1px);
    background-size: 100% 100%, 32px 32px, 32px 32px;
    mask-image: radial-gradient(ellipse 46% 64% at 74% 50%, #000 30%, transparent 78%); }
  .text, .drawing { position: relative; }
  .eyebrow { margin: 0; font-size: 21px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #5242a7; }
  .title { display: flex; align-items: center; gap: 24px; margin-top: 18px; }
  .mark { width: 100px; height: 100px; flex: none; }
  .mark svg { display: block; width: 100%; height: 100%; }
  h1 { margin: 0; font-size: 112px; line-height: 1; font-weight: 700; letter-spacing: -0.035em; color: #1f2328; }
  h1 span { color: #5242a7; }
  .en { margin: 28px 0 0; font-size: 34px; line-height: 1.3; font-weight: 500; color: #4a4f57; }
  .zh { margin: 14px 0 0; font-size: 27px; line-height: 1.4; color: #6b7078; }
  .url { position: absolute; left: 72px; bottom: 48px; margin: 0; font: 500 21px ui-monospace, 'SF Mono', Menlo, monospace; color: #6b7078; }
  .lab { position: absolute; right: 72px; bottom: 48px; margin: 0; font-size: 21px; font-weight: 500; color: #6b7078; }
  .hero-visual { display: block; width: 100%; height: auto; overflow: visible; color: #6b7078; }
  .g0 { fill: #eceef1; } .g1 { fill: #aea6dc; } .g2 { fill: #5242a7; } .gm { fill: #ffffff; stroke: #c3c8cf; stroke-width: 0.5; }
  .streams path { fill: none; stroke: #5242a7; stroke-width: 1.4; opacity: 0.55; }
  .streams circle { fill: #5242a7; }
  .gridline { stroke: currentColor; stroke-width: 0.6; opacity: 0.35; stroke-dasharray: 2 3; }
  .axis { stroke: currentColor; stroke-width: 0.8; }
  .area { fill: #5242a7; opacity: 0.1; }
  .curve { fill: none; stroke: #5242a7; stroke-width: 2.4; stroke-linejoin: round; }
</style></head>
<body><div class="card">
  <div class="text">
    <p class="eyebrow">Population genetics · deep learning</p>
    <div class="title"><div class="mark">${mark}</div><h1><span>Ne</span>Cast</h1></div>
    <p class="en">Population size histories from genotypes and genetic maps</p>
    <p class="zh">从基因型和遗传图谱推断群体大小历史</p>
  </div>
  <div class="drawing">${drawing}</div>
  <p class="url">larryivan.github.io/NeCast-web</p>
  <p class="lab">Ke’s Lab · Fudan University</p>
</div></body></html>`;

const work = mkdtempSync(join(tmpdir(), 'necast-card-'));
try {
  const page = join(work, 'card.html');
  writeFileSync(page, html);
  execFileSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--window-size=1200,630',
    `--user-data-dir=${join(work, 'profile')}`,
    `--screenshot=${join(root, 'public/og.png')}`,
    `file://${page}`,
  ], { stdio: 'ignore' });
  console.log('wrote public/og.png');
} finally {
  rmSync(work, { recursive: true, force: true });
}
