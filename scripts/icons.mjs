// Erzeugt die App-Icons (icons/icon-180/192/512.png) aus einem SVG: Papier, Heftrand,
// eine Hantel in Tinte. Einmalig bzw. bei Gestaltungsänderung: node scripts/icons.mjs

import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#f3efe5"/>
  <rect x="84" y="0" width="10" height="512" fill="#b23d29" opacity="0.7"/>
  <g fill="#1c1b18">
    <rect x="132" y="244" width="248" height="24" rx="6"/>
    <rect x="150" y="166" width="40" height="180" rx="10"/>
    <rect x="200" y="192" width="30" height="128" rx="8"/>
    <rect x="322" y="166" width="40" height="180" rx="10"/>
    <rect x="282" y="192" width="30" height="128" rx="8"/>
  </g>
</svg>`;

const ziel = fileURLToPath(new URL('../icons/', import.meta.url));
mkdirSync(ziel, { recursive: true });
const browser = await chromium.launch();
for (const groesse of [180, 192, 512]) {
  const seite = await browser.newPage({ viewport: { width: groesse, height: groesse } });
  await seite.setContent(`<style>html,body{margin:0}svg{display:block;width:${groesse}px;height:${groesse}px}</style>${SVG}`);
  await seite.screenshot({ path: `${ziel}icon-${groesse}.png` });
  await seite.close();
}
await browser.close();
console.log('Icons geschrieben.');
