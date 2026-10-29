// Feinschliff-Durchgang und Screenshots: eine komplette Einheit in iPhone-Größe durchklicken.
//   npm run screenshots              → docs/screenshots/ (Start, Übung, Programm-Bearbeitung, …)
//   node tests/ui/durchgang.mjs <ordner> --alle  → jeder Schritt als Bild (zum Durchsehen)

import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { aendereUebung } from '../../src/logik/bearbeiten.js';
import { neuerZustand } from '../../src/logik/datenformat.js';
import { erstelleGithubApi } from '../../src/logik/github.js';
import { synchronisiere, wendeSyncAn } from '../../src/logik/sync.js';
import { TOKEN_EINSTELLUNGEN, neueSeite, oeffneBrowser, schliesseBrowser } from '../hilfen/browser.mjs';
import { einheitMit, startProgramm } from '../hilfen/daten.mjs';
import { erstelleGithubMock } from '../hilfen/github-mock.mjs';

const ziel = process.argv[2] ?? fileURLToPath(new URL('../../docs/screenshots/', import.meta.url));
const alle = process.argv.includes('--alle');
mkdirSync(ziel, { recursive: true });

const P = startProgramm();
const a = einheitMit(P, 'a', '2026-10-29', {
  'goblet-squat': [{ kg: 16, wdh: 10 }, { kg: 16, wdh: 10 }],
  bankdruecken: [{ kg: 40, wdh: 9 }, { kg: 40, wdh: 8 }],
  rudern: [{ kg: 35, wdh: 10 }, { kg: 35, wdh: 10 }],
  'rumaenisches-kreuzheben': [{ kg: 40, wdh: 10 }, { kg: 40, wdh: 9 }],
  'aussenrotation-kabel': [{ kg: 5, wdh: 15 }, { kg: 5, wdh: 14 }],
  plank: [{ s: 45 }, { s: 40 }],
});
const b = einheitMit(P, 'b', '2026-11-02', {
  beinpresse: [{ kg: 80, wdh: 10 }, { kg: 80, wdh: 10 }],
  schulterdruecken: [{ kg: 10, wdh: 9 }, { kg: 10, wdh: 8 }],
  latzug: [{ kg: 35, wdh: 9 }, { kg: 35, wdh: 9 }],
}, [a]);

const mock = erstelleGithubMock();
mock.schreibe({ 'README.md': '# claude-projekte\n', 'garmin/stand.md': 'Garmin-Sync\n' });
const api = erstelleGithubApi({ token: 'test-token', repo: mock.repo, fetch: mock.fetch });
const zustand = wendeSyncAn({ ...neuerZustand(P), einheiten: [a, b] }, await synchronisiere({ ...neuerZustand(P), einheiten: [a, b] }, { api, jetzt: () => new Date('2026-11-02T18:40:00Z') }));

await oeffneBrowser();
let n = 0;
async function bild(seite, name, immer = false) {
  n += 1;
  if (immer || alle) await seite.screenshot({ path: `${ziel}/${immer && !alle ? name : `${String(n).padStart(2, '0')}-${name}`}.png` });
}

const { seite, kontext, fehler } = await neueSeite({ zustand, einstellungen: TOKEN_EINSTELLUNGEN, mock, zeit: '2026-11-05T18:02:00' });
await seite.waitForSelector('[data-testid="sync-zeile"]:text-matches("^Gesichert")');
await bild(seite, 'start', true);
await seite.tap('[data-a="starten"]');
await seite.waitForSelector('.seite.uebung');
await bild(seite, 'uebung', true);
await seite.tap('[data-testid="satz-speichern"]');
await bild(seite, 'uebung-satz1');
await seite.tap('[data-testid="satz-speichern"]');
await bild(seite, 'uebung-fertig');
await seite.tap('[data-testid="weiter"]');
await bild(seite, 'bankdruecken');
await seite.tap('.stepper[data-feld="wdh"] [data-richtung="1"]');
await seite.tap('[data-testid="satz-speichern"]');
await seite.tap('[data-testid="satz-speichern"]');
await seite.tap('[data-testid="weiter"]');
await seite.tap('.kopf [data-a="menue"]');
await bild(seite, 'menue');
await seite.tap('[data-a="ersetzenOeffnen"]');
await seite.fill('.suche', 'Kabel');
await bild(seite, 'ersetzen');
await seite.tap('[data-a="blattZu"] >> nth=0');
await seite.tap('[data-testid="satz-speichern"]');
await seite.tap('[data-testid="satz-speichern"]');
await seite.tap('a.zurueck');
await bild(seite, 'einheit', true);
await seite.goto(`${seite.url().split('#')[0]}#/uebung/5`);
await bild(seite, 'plank');
await seite.tap('[data-testid="satz-speichern"]');
await seite.tap('[data-testid="satz-speichern"]');
await seite.tap('a.zurueck');
await seite.tap('.daumen [data-a="beenden"]');
await seite.waitForSelector('.seite.start');
await bild(seite, 'beendet');
await seite.goto(`${seite.url().split('#')[0]}#/programm`);
await bild(seite, 'programm');
await seite.goto(`${seite.url().split('#')[0]}#/programm/a`);
await bild(seite, 'programm-bearbeiten', true);
await seite.goto(`${seite.url().split('#')[0]}#/katalog/latzug`);
await bild(seite, 'uebung-bearbeiten');
await seite.goto(`${seite.url().split('#')[0]}#/phase/steigern`);
await bild(seite, 'phase');
await seite.goto(`${seite.url().split('#')[0]}#/einstellungen`);
await bild(seite, 'einstellungen');
mock.schreibe({ 'gym/programm.json': JSON.stringify(aendereUebung(P, 'rudern', { name: 'Rudern am Kabel' }), null, 2) }, 'Claude');
await seite.goto(`${seite.url().split('#')[0]}#/katalog/plank`);
await seite.fill('[data-f="uebungFeld"][data-feld="hinweis"]', 'Unterarme, Rücken gerade');
await seite.locator('[data-f="uebungFeld"][data-feld="hinweis"]').blur();
await seite.goto(`${seite.url().split('#')[0]}#/start`);
await seite.waitForSelector('a.banner');
await seite.tap('a.banner');
await bild(seite, 'konflikt', true);
if (fehler.length) console.error(fehler);
await kontext.close();

// Dunkel (z. B. dunkles Studio, iPhone im Dunkelmodus)
const dunkel = await neueSeite({ zustand, zeit: '2026-11-05T18:02:00' });
await dunkel.seite.emulateMedia({ colorScheme: 'dark' });
await dunkel.seite.tap('[data-a="starten"]');
await dunkel.seite.waitForSelector('.seite.uebung');
await bild(dunkel.seite, 'uebung-dunkel', true);
await dunkel.kontext.close();

await schliesseBrowser();
console.log(`Bilder in ${ziel}`);
