// Renders the PNG versions of the NeCast mark and the lockups (mark and wordmark) with headless
// Chrome, after `python brand/build_brand.py` has written the SVGs. CHROME may point to another
// Chrome or Chromium binary. The wordmark is set in the system's sans-serif (SF Pro on macOS).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const read = (name) => readFileSync(join(root, 'brand', name), 'utf8');
const mark = read('necast-mark.svg');
const square = read('necast-mark-square.svg');

const page = (width, height, body, background = 'transparent') => `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; background: ${background}; }
  body { display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; }
  svg { display: block; width: 100%; height: 100%; }
  .lockup { display: flex; align-items: center; gap: 0.27em; font-size: 104px; font-weight: 700; letter-spacing: -0.03em; line-height: 1; }
  .lockup .m { width: 1.12em; height: 1.12em; }
  .lockup .t { padding-bottom: 0.04em; }
</style></head><body>${body}</body></html>`;

const lockup = (ne, cast) =>
  `<div class="lockup"><div class="m">${mark}</div><div class="t"><span style="color:${ne}">Ne</span><span style="color:${cast}">Cast</span></div></div>`;

const jobs = [
  ['brand/necast-mark-1024.png', 1024, 1024, `<div style="width:1024px;height:1024px">${mark}</div>`],
  ['brand/necast-mark-512.png', 512, 512, `<div style="width:512px;height:512px">${mark}</div>`],
  ['public/apple-touch-icon.png', 180, 180, `<div style="width:180px;height:180px">${square}</div>`],
  ['brand/necast-lockup.png', 760, 200, lockup('#1F4E9E', '#18181B')],
  ['brand/necast-lockup-dark.png', 760, 200, lockup('#8FB0EA', '#F4F4F5'), '#18181B'],
];

const work = mkdtempSync(join(tmpdir(), 'necast-brand-'));
try {
  for (const [out, width, height, body, background] of jobs) {
    const file = join(work, 'page.html');
    writeFileSync(file, page(width, height, body, background));
    execFileSync(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--default-background-color=00000000',
      `--window-size=${width},${height}`,
      `--user-data-dir=${join(work, 'profile')}`,
      `--screenshot=${join(root, out)}`,
      `file://${file}`,
    ], { stdio: 'ignore' });
    console.log('wrote', out);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
