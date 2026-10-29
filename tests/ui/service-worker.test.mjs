// Service Worker: neue Versionen kommen spätestens beim nächsten Öffnen an, und offline
// läuft die App aus dem Cache weiter. Der Testserver schickt wie GitHub Pages
// „Cache-Control: max-age=600“ – die neue Fassung muss trotzdem durchkommen.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';

import { leseJahresdatei } from '../../src/logik/datenformat.js';
import { TOKEN_EINSTELLUNGEN, geraeteZustand, neueSeite, oeffneBrowser, schliesseBrowser } from '../hilfen/browser.mjs';
import { erstelleGithubMock } from '../hilfen/github-mock.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const kopie = mkdtempSync(join(tmpdir(), 'gym-log-sw-'));
for (const teil of ['index.html', 'styles.css', 'manifest.webmanifest', 'sw.js', 'src', 'icons', 'startinhalt']) cpSync(join(REPO, teil), join(kopie, teil), { recursive: true });

before(() => oeffneBrowser(kopie));
after(async () => {
  await schliesseBrowser();
  rmSync(kopie, { recursive: true, force: true });
});

const steuert = (seite) => seite.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });

test('i) die Versionsnummer passt zu den Dateien (vergessenes „npm run version“ fällt hier auf)', () => {
  const ausgabe = execFileSync(process.execPath, [join(REPO, 'scripts/version.mjs'), '--pruefen'], { encoding: 'utf8' });
  assert.match(ausgabe, /ist aktuell/);
  const sw = readFileSync(join(REPO, 'sw.js'), 'utf8');
  const version = readFileSync(join(REPO, 'src/version.js'), 'utf8').match(/'(\w+)'/)[1];
  assert.ok(sw.includes(`const VERSION = '${version}';`));
});

test('i) eine neue Version wird trotz Service Worker spätestens beim nächsten Öffnen übernommen', async () => {
  const { seite, kontext, fehler } = await neueSeite({ serviceWorkers: 'allow', zeit: null });
  await steuert(seite);
  const v1 = await seite.evaluate(() => document.documentElement.dataset.version);
  assert.match(await seite.textContent('.etikett'), /^Als Nächstes$/);

  // Neue Fassung veröffentlichen (wie ein Merge auf GitHub Pages)
  const datei = join(kopie, 'src/ui/ansichten/start.js');
  writeFileSync(datei, readFileSync(datei, 'utf8').replace("'Als Nächstes'", "'Als Nächstes (neue Fassung)'"));
  const ausgabe = execFileSync(process.execPath, [join(REPO, 'scripts/version.mjs'), kopie], { encoding: 'utf8' });
  const v2 = ausgabe.match(/Version (\w+)/)[1];
  assert.notEqual(v1, v2);

  // App schließen und wieder öffnen
  await seite.close();
  const neu = await kontext.newPage();
  await neu.goto(seite.url());
  await neu.waitForFunction((v) => document.documentElement.dataset.version === v, v2, { timeout: 15000 });
  await neu.waitForSelector('.etikett:text("Als Nächstes (neue Fassung)")');
  const caches = await neu.evaluate(() => caches.keys());
  assert.deepEqual(caches, [`gym-log-${v2}`], 'alter Cache entfernt');
  assert.deepEqual(fehler, []);
  await kontext.close();
});

test('i) kommt die App nur aus dem Hintergrund zurück, prüft sie ebenfalls auf eine neue Version', async () => {
  const { seite, kontext } = await neueSeite({ serviceWorkers: 'allow', zeit: null });
  await steuert(seite);
  const datei = join(kopie, 'styles.css');
  writeFileSync(datei, `${readFileSync(datei, 'utf8')}\n/* Hintergrund-Test */\n`);
  const v3 = execFileSync(process.execPath, [join(REPO, 'scripts/version.mjs'), kopie], { encoding: 'utf8' }).match(/Version (\w+)/)[1];
  await seite.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await seite.waitForFunction((v) => document.documentElement.dataset.version === v, v3, { timeout: 15000 });
  await kontext.close();
});

test('e) offline: App startet aus dem Cache, Sätze werden eingetragen und gehen nicht verloren, später synchronisiert', async () => {
  const mock = erstelleGithubMock();
  mock.schreibe({ 'README.md': '# claude-projekte\n', 'garmin/stand.md': 'Garmin 16:00\n' });
  const { seite, kontext } = await neueSeite({ serviceWorkers: 'allow', einstellungen: TOKEN_EINSTELLUNGEN, mock, zeit: null });
  await steuert(seite);
  await seite.waitForSelector('[data-testid="sync-zeile"]:text-matches("^Gesichert")');

  // Funkloch im Keller: kein Netz, App neu öffnen
  mock.offline = true;
  await kontext.setOffline(true);
  await seite.reload();
  await seite.waitForSelector('.seite.start');
  await seite.tap('[data-a="starten"]');
  await seite.waitForSelector('.seite.uebung');
  await seite.fill('.stepper[data-feld="kg"] input', '16');
  await seite.fill('.stepper[data-feld="wdh"] input', '10');
  await seite.tap('[data-testid="satz-speichern"]');
  await seite.tap('[data-testid="satz-speichern"]');
  await seite.tap('a.zurueck');
  await seite.tap('[data-a="beenden"]');
  await seite.waitForSelector('.seite.start');
  await seite.tap('a[href="#/einstellungen"]');
  await seite.tap('[data-a="jetztSync"]');
  await seite.waitForSelector('.sync-zeile:text("Offline")');
  assert.equal(mock.datei('gym/einheiten/2026.json'), null);

  // Auch ein Neustart offline verliert nichts
  await seite.reload();
  await seite.waitForSelector('#app .seite');
  const z = await geraeteZustand(seite);
  assert.equal(z.einheiten.filter((e) => e.beendet).length, 1);

  // Wieder Netz
  mock.offline = false;
  await kontext.setOffline(false);
  await seite.evaluate(() => window.dispatchEvent(new Event('online')));
  await seite.waitForSelector('.sync-zeile:text-matches("^Gesichert")', { timeout: 15000 });
  const roh = leseJahresdatei(mock.datei('gym/einheiten/2026.json'));
  assert.equal(roh.length, 1);
  assert.deepEqual(roh[0].uebungen[0].saetze.map((s) => [s.kg, s.wdh]), [[16, 10], [16, 10]]);
  assert.equal(mock.datei('garmin/stand.md'), 'Garmin 16:00\n');
  await kontext.close();
});
