// Downloads latin-subset woff2 files for the site's fonts from Google Fonts
// and writes fonts/fonts.css with local @font-face rules.
// Run once: node tools/fetch-fonts.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const FAMILIES = [
  {
    file: 'fraunces-var.woff2',
    css: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,100..900&display=swap',
    face: `@font-face {
  font-family: 'Fraunces';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('fraunces-var.woff2') format('woff2');
}`,
  },
  {
    file: 'fraunces-italic-var.woff2',
    css: 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,100..900&display=swap',
    face: `@font-face {
  font-family: 'Fraunces';
  font-style: italic;
  font-weight: 100 900;
  font-display: swap;
  src: url('fraunces-italic-var.woff2') format('woff2');
}`,
  },
  {
    file: 'inter-var.woff2',
    css: 'https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,100..900&display=swap',
    face: `@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('inter-var.woff2') format('woff2');
}`,
  },
  {
    file: 'noto-music.woff2',
    css: 'https://fonts.googleapis.com/css2?family=Noto+Music&display=swap',
    face: `@font-face {
  font-family: 'Noto Music';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('noto-music.woff2') format('woff2');
}`,
  },
];

function latinUrl(cssText, family) {
  // Blocks are preceded by a subset comment like /* latin */ — prefer plain latin,
  // fall back to "music" (Noto Music) or the last woff2 URL found.
  const blocks = cssText.split('@font-face').slice(1);
  let fallback = null;
  for (const b of blocks) {
    const m = b.match(/url\((https:[^)]+\.woff2)\)/);
    if (!m) continue;
    fallback = m[1];
  }
  const re = /\/\*\s*(?:latin|music)\s*\*\/\s*@font-face\s*{[^}]*url\((https:[^)]+\.woff2)\)/;
  const m = cssText.match(re);
  const url = (m && m[1]) || fallback;
  if (!url) throw new Error(`No woff2 URL found for ${family}`);
  return url;
}

const outDir = path.join(import.meta.dirname, '..', 'fonts');
await mkdir(outDir, { recursive: true });

const faces = [];
for (const fam of FAMILIES) {
  const cssRes = await fetch(fam.css, { headers: { 'User-Agent': UA } });
  if (!cssRes.ok) throw new Error(`CSS fetch failed (${cssRes.status}) for ${fam.file}`);
  const url = latinUrl(await cssRes.text(), fam.file);
  const fontRes = await fetch(url);
  if (!fontRes.ok) throw new Error(`Font fetch failed (${fontRes.status}) for ${fam.file}`);
  const buf = Buffer.from(await fontRes.arrayBuffer());
  await writeFile(path.join(outDir, fam.file), buf);
  console.log(`${fam.file}  ${(buf.length / 1024).toFixed(0)} KB  <- ${url}`);
  faces.push(fam.face);
}

await writeFile(
  path.join(outDir, 'fonts.css'),
  `/* Vendored from Google Fonts (OFL-licensed families) — see README. */\n\n${faces.join('\n\n')}\n`
);
console.log('fonts/fonts.css written');
