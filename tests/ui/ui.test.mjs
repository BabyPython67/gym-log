// Oberflächen-Tests in iPhone-Größe (390 × 844 CSS-Pixel, Touch). Gezählt werden Taps ab der
// Übungsansicht; Daten werden über den Gerätespeicher geprüft, Sync über die nachgebaute API.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { aendereUebung } from '../../src/logik/bearbeiten.js';
import { neuerZustand } from '../../src/logik/datenformat.js';
import { erstelleGithubApi } from '../../src/logik/github.js';
import { synchronisiere, wendeSyncAn } from '../../src/logik/sync.js';
import { TOKEN_EINSTELLUNGEN, geraeteZustand, neueSeite, oeffneBrowser, schliesseBrowser, tastenGroessen } from '../hilfen/browser.mjs';
import { einheitMit, startProgramm } from '../hilfen/daten.mjs';
import { erstelleGithubMock } from '../hilfen/github-mock.mjs';

const P = startProgramm();
const ohneZeit = ({ t, ...rest }) => rest;
const offene = (z) => z.einheiten.find((e) => !e.beendet && !e.geloescht);

before(() => oeffneBrowser());
after(() => schliesseBrowser());

function historie() {
  const a = einheitMit(P, 'a', '2026-10-29', {
    'goblet-squat': [{ kg: 16, wdh: 10 }, { kg: 16, wdh: 10 }],
    bankdruecken: [{ kg: 40, wdh: 9 }, { kg: 40, wdh: 8 }],
    plank: [{ s: 45 }, { s: 40 }],
  });
  const b = einheitMit(P, 'b', '2026-11-02', { latzug: [{ kg: 35, wdh: 9 }, { kg: 35, wdh: 9 }] }, [a]);
  return { ...neuerZustand(P), einheiten: [a, b] };
}

async function imRepoSynchronisiert(mock, zustand) {
  const api = erstelleGithubApi({ token: 'test-token', repo: mock.repo, fetch: mock.fetch });
  return wendeSyncAn(zustand, await synchronisiere(zustand, { api, jetzt: () => new Date('2026-11-05T17:00:00Z') }));
}

async function warteBis(bedingung, text, ms = 8000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) {
    if (await bedingung()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.fail(`Zeitüberschreitung: ${text}`);
}

// ---------- a) höchstens 2 Taps ----------

test('a) vorausgefüllter Satz, der stimmt: ab der Übungsansicht mit 1 Tap gespeichert (iPhone-Größe)', async () => {
  const { seite, kontext, fehler } = await neueSeite({ zustand: historie(), zeit: '2026-11-05T18:00:00' });
  assert.deepEqual(seite.viewportSize(), { width: 390, height: 844 });
  assert.match(await seite.textContent('.riesig'), /^A$/);
  await seite.tap('[data-a="starten"]');
  await seite.waitForSelector('.seite.uebung');

  // Übungsansicht: Goblet Squat ist vorausgefüllt – 16 kg × 10, 10 letztes Mal → Vorschlag 18 kg
  assert.equal(await seite.inputValue('.stepper[data-feld="kg"] input'), '18');
  assert.equal(await seite.inputValue('.stepper[data-feld="wdh"] input'), '10');
  let taps = 0;
  await seite.tap('[data-testid="satz-speichern"]');
  taps += 1;
  let z = await geraeteZustand(seite);
  assert.deepEqual(offene(z).uebungen[0].saetze.map(ohneZeit), [{ kg: 18, wdh: 10 }]);
  assert.ok(taps <= 2, `${taps} Taps`);

  // Satz 2 ist wieder vorausgefüllt und braucht ebenfalls nur einen Tap
  assert.equal(await seite.inputValue('.stepper[data-feld="kg"] input'), '18');
  await seite.tap('[data-testid="satz-speichern"]');
  z = await geraeteZustand(seite);
  assert.equal(offene(z).uebungen[0].saetze.length, 2);

  // Danach führt ein Tap zur nächsten Übung; dort Wdh. desselben Satzes vom letzten Mal (9, dann 8)
  await seite.tap('[data-testid="weiter"]');
  await seite.waitForSelector('.uebung-name:text("Bankdrücken")');
  assert.equal(await seite.inputValue('.stepper[data-feld="kg"] input'), '40');
  assert.equal(await seite.inputValue('.stepper[data-feld="wdh"] input'), '9');
  await seite.tap('[data-testid="satz-speichern"]');
  assert.equal(await seite.inputValue('.stepper[data-feld="wdh"] input'), '8');

  // Der Speichern-Knopf liegt im Daumenbereich (unteres Drittel)
  const box = await seite.locator('[data-testid="satz-speichern"]').boundingBox();
  assert.ok(box.y > 844 * 0.66 && box.y + box.height <= 844, `Knopf bei y=${box.y}`);
  assert.deepEqual(fehler, []);
  await kontext.close();
});

test('a) abweichender Satz: zwei Taps mit −/+ ohne Tastatur, Fehleingabe lässt sich korrigieren', async () => {
  const { seite, kontext } = await neueSeite({ zustand: historie(), zeit: '2026-11-05T18:00:00' });
  await seite.tap('[data-a="starten"]');
  await seite.waitForSelector('.seite.uebung');
  await seite.tap('.stepper[data-feld="wdh"] [data-richtung="-1"]');
  await seite.tap('[data-testid="satz-speichern"]');
  let z = await geraeteZustand(seite);
  assert.deepEqual(offene(z).uebungen[0].saetze.map(ohneZeit), [{ kg: 18, wdh: 9 }]);

  // Korrigieren: Satz antippen, ändern, speichern
  await seite.tap('[data-a="satzBearbeiten"][data-j="0"]');
  await seite.tap('.stepper[data-feld="wdh"] [data-richtung="1"]');
  await seite.tap('[data-a="satzAendern"]');
  z = await geraeteZustand(seite);
  assert.equal(offene(z).uebungen[0].saetze[0].wdh, 10);

  // Löschen ohne Bestätigungsdialog, dafür Rückgängig
  await seite.tap('[data-a="satzBearbeiten"][data-j="0"]');
  await seite.tap('[data-a="satzLoeschen"]');
  assert.equal(offene(await geraeteZustand(seite)).uebungen[0].saetze.length, 0);
  await seite.tap('[data-a="rueckgaengig"]');
  assert.equal(offene(await geraeteZustand(seite)).uebungen[0].saetze.length, 1);
  await kontext.close();
});

test('a) ganze Einheit: starten, eintragen, beenden – Rotation schlägt danach B vor', async () => {
  const { seite, kontext } = await neueSeite({ zeit: '2026-10-29T18:00:00' });
  await seite.tap('[data-a="starten"]');
  await seite.waitForSelector('.seite.uebung');
  // Erste Einheit ohne Historie: „Gewicht suchen“, Felder leer
  assert.match(await seite.textContent('.vorschlag'), /Gewicht suchen/);
  assert.equal(await seite.inputValue('.stepper[data-feld="kg"] input'), '');
  await seite.fill('.stepper[data-feld="kg"] input', '16');
  await seite.fill('.stepper[data-feld="wdh"] input', '10');
  await seite.tap('[data-testid="satz-speichern"]');
  // ab Satz 2 steht der vorige Satz von heute drin
  assert.equal(await seite.inputValue('.stepper[data-feld="kg"] input'), '16');
  await seite.tap('[data-testid="satz-speichern"]');
  await seite.tap('a.zurueck');
  await seite.tap('[data-a="beenden"]');
  await seite.waitForSelector('.seite.start');
  assert.match(await seite.textContent('.toast'), /Einheit A gespeichert/);
  assert.match(await seite.textContent('.riesig'), /^B$/);
  const z = await geraeteZustand(seite);
  assert.equal(z.einheiten.length, 1);
  assert.ok(z.einheiten[0].beendet);
  await kontext.close();
});

// ---------- b) letzte Werte sichtbar ----------

test('b) beim Eintragen sind die Werte vom letzten Mal sichtbar – ohne Scrollen, der aktuelle Satz markiert', async () => {
  const { seite, kontext } = await neueSeite({ zustand: historie(), zeit: '2026-11-05T18:00:00' });
  await seite.tap('[data-a="starten"]');
  await seite.waitForSelector('.seite.uebung');
  await seite.goto(`${seite.url().split('#')[0]}#/uebung/1`);
  await seite.waitForSelector('.uebung-name:text("Bankdrücken")');
  const letztes = seite.locator('[data-testid="letztes-mal"]');
  assert.match(await letztes.innerText(), /LETZTES MAL · DO 29\.10\./i);
  const zeilen = await letztes.locator('tr').allInnerTexts();
  assert.deepEqual(zeilen.map((t) => t.replace(/\s+/g, ' ').trim()), ['1 40kg 9Wdh.', '2 40kg 8Wdh.']);
  const box = await letztes.boundingBox();
  assert.ok(box.y >= 0 && box.y + box.height <= 844 - 300, 'oberhalb des Eingabebereichs sichtbar');
  assert.equal(await letztes.locator('tr.aktiv th').textContent(), '1');
  assert.match(await seite.textContent('.vorschlag'), /40 kg bleiben · 2 Sätze unter 10 Wdh\./);
  await seite.tap('[data-testid="satz-speichern"]');
  assert.equal(await letztes.locator('tr.aktiv th').textContent(), '2');

  // Messart ohne Gewicht: nur der letzte Wert, kein Vorschlag
  await seite.goto(`${seite.url().split('#')[0]}#/uebung/5`);
  await seite.waitForSelector('.uebung-name:text("Plank")');
  assert.deepEqual((await seite.locator('[data-testid="letztes-mal"] tr').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()), ['1 45s', '2 40s']);
  assert.equal(await seite.locator('.vorschlag').count(), 0);
  assert.equal(await seite.inputValue('.stepper[data-feld="s"] input'), '45');
  await kontext.close();
});

// ---------- j) nur für heute ----------

test('j) im Gym: Übung nur für heute durch eine neue ersetzen (nur Name) und eine auslassen – das Programm bleibt gleich', async () => {
  const { seite, kontext } = await neueSeite({ zeit: '2026-10-29T18:00:00' });
  const programmVorher = (await geraeteZustand(seite)).programm;
  await seite.tap('[data-a="starten"]');
  await seite.waitForSelector('.seite.uebung');
  await seite.tap('.kopf [data-a="menue"]');
  await seite.tap('[data-a="ersetzenOeffnen"]');
  await seite.fill('.suche', 'Hackenschmidt');
  await seite.tap('.neu-uebung');
  await seite.waitForSelector('.uebung-name:text("Hackenschmidt")');
  assert.match(await seite.textContent('.kladde'), /heute statt Goblet Squat/);
  await seite.fill('.stepper[data-feld="kg"] input', '60');
  await seite.fill('.stepper[data-feld="wdh"] input', '12');
  await seite.tap('[data-testid="satz-speichern"]');

  // Ersetzen durch eine Übung aus dem Katalog
  await seite.goto(`${seite.url().split('#')[0]}#/einheit`);
  await seite.tap('[data-a="menue"][data-i="2"]');
  await seite.tap('[data-a="ersetzenOeffnen"]');
  await seite.fill('.suche', 'schulter');
  await seite.tap('[data-a="gewaehlt"][data-id="schulterdruecken"]');
  await seite.waitForSelector('.uebung-name:text("Schulterdrücken")');

  // Auslassen
  await seite.goto(`${seite.url().split('#')[0]}#/einheit`);
  await seite.tap('[data-a="menue"][data-i="5"]');
  await seite.tap('[data-a="auslassen"]');
  assert.match(await seite.textContent('.liste li:nth-child(6)'), /ausgelassen/);

  const z = await geraeteZustand(seite);
  const e = offene(z);
  assert.deepEqual(z.programm.programme, programmVorher.programme, 'Programme unverändert');
  assert.deepEqual(z.programm.rotation, programmVorher.rotation);
  const neu = z.programm.uebungen.find((u) => u.name === 'Hackenschmidt');
  assert.deepEqual({ ...neu }, { id: 'hackenschmidt', name: 'Hackenschmidt', messart: 'gewicht_wdh', spanne: [10, 15], schritt: 2.5, rolle: 'zusatz' });
  assert.deepEqual([e.uebungen[0].uebung, e.uebungen[0].ersetzt], ['hackenschmidt', 'goblet-squat']);
  assert.deepEqual([e.uebungen[2].uebung, e.uebungen[2].ersetzt], ['schulterdruecken', 'rudern']);
  assert.equal(e.uebungen[5].ausgelassen, true);
  await kontext.close();
});

// ---------- k) Programm bearbeiten ----------

test('k) Programm in der App bearbeiten und neues Programm anlegen landet in programm.json; Rotation einstellbar', async () => {
  const mock = erstelleGithubMock();
  mock.schreibe({ 'garmin/stand.md': 'x\n' });
  const zustand = await imRepoSynchronisiert(mock, neuerZustand(P));
  const { seite, kontext, fehler } = await neueSeite({ zustand, einstellungen: TOKEN_EINSTELLUNGEN, mock, zeit: '2026-11-05T18:00:00' });
  await seite.waitForSelector('[data-testid="sync-zeile"]:text-matches("^Gesichert")');
  const basis = seite.url().split('#')[0];

  // Reihenfolge in A ändern: Bankdrücken eins nach unten
  await seite.tap('a[href="#/programm"]');
  await seite.tap('a[href="#/programm/a"]');
  await seite.tap('[data-a="platzRunter"][data-i="1"]');
  // Variante ergänzen
  await seite.tap('[data-a="waehlen"][data-zweck="variante"][data-i="2"]');
  await seite.fill('.suche', 'Schulter');
  await seite.tap('[data-a="gewaehlt"][data-id="schulterdruecken"]');

  // Übung umbenennen, Schritt, Spanne und Messart ändern
  await seite.goto(`${basis}#/katalog/rudern`);
  await seite.fill('[data-f="uebungFeld"][data-feld="name"]', 'Rudern am Kabel');
  await seite.fill('[data-f="uebungFeld"][data-feld="schritt"]', '5');
  await seite.fill('[data-f="spanne"][data-teil="1"]', '12');
  await seite.locator('[data-f="spanne"][data-teil="1"]').blur();
  await seite.goto(`${basis}#/katalog/plank`);
  await seite.selectOption('[data-f="uebungFeld"][data-feld="messart"]', 'wdh');

  // Phase ohne Datum aktivieren
  await seite.goto(`${basis}#/phase/steigern`);
  await seite.fill('[data-f="phaseFeld"][data-feld="ab"]', '2027-01-11');
  await seite.locator('[data-f="phaseFeld"][data-feld="ab"]').blur();

  // Neues Programm C anlegen, Übung hinzufügen, in die Rotation nehmen
  await seite.goto(`${basis}#/programm`);
  await seite.fill('[data-form="neuesProgramm"] input', 'C');
  await seite.tap('[data-form="neuesProgramm"] button');
  await seite.waitForURL(/#\/programm\/c$/);
  await seite.tap('[data-a="waehlen"][data-zweck="platz"]');
  await seite.tap('[data-a="gewaehlt"][data-id="beinpresse"]');
  await seite.goto(`${basis}#/rotation`);
  await seite.tap('[data-a="rotRein"][data-id="c"]');
  await seite.tap('[data-a="rotHoch"][data-i="2"]');

  // Verlassen des Bearbeitens synchronisiert
  await seite.goto(`${basis}#/start`);
  await warteBis(() => JSON.parse(mock.datei('gym/programm.json')).rotation.length === 3, 'programm.json im Repo aktualisiert');
  const imRepo = JSON.parse(mock.datei('gym/programm.json'));
  const a = imRepo.programme.find((x) => x.id === 'a');
  assert.deepEqual(a.plaetze.map((pl) => pl.varianten.join('/')), ['goblet-squat/langhantel-kniebeuge', 'rudern', 'bankdruecken/schulterdruecken', 'rumaenisches-kreuzheben', 'aussenrotation-kabel', 'plank']);
  const rudern = imRepo.uebungen.find((u) => u.id === 'rudern');
  assert.deepEqual([rudern.name, rudern.schritt, rudern.spanne], ['Rudern am Kabel', 5, [6, 12]]);
  assert.equal(imRepo.uebungen.find((u) => u.id === 'plank').messart, 'wdh');
  assert.equal(imRepo.phasen.find((x) => x.id === 'steigern').ab, '2027-01-11');
  assert.deepEqual(imRepo.programme.find((x) => x.id === 'c'), { id: 'c', name: 'C', plaetze: [{ varianten: ['beinpresse'] }] });
  assert.deepEqual(imRepo.rotation, ['a', 'c', 'b']);
  assert.ok(mock.geaendertePfade(mock.commits()[0].sha).every((p) => p.startsWith('gym/')));
  assert.deepEqual(fehler, []);
  await kontext.close();
});

// ---------- m) Konflikt ----------

test('m) Programm in App und Repo gleichzeitig geändert: App zeigt den Unterschied, Mirko wählt, nichts wird still überschrieben', async () => {
  const mock = erstelleGithubMock();
  mock.schreibe({ 'garmin/stand.md': 'x\n' });
  let zustand = await imRepoSynchronisiert(mock, neuerZustand(P));
  const vonClaude = aendereUebung(P, 'rudern', { name: 'Rudern am Kabel' });
  mock.schreibe({ 'gym/programm.json': JSON.stringify(vonClaude, null, 2) }, 'Claude: Rudern');
  const repoText = mock.datei('gym/programm.json');
  zustand = { ...zustand, programm: aendereUebung(zustand.programm, 'bankdruecken', { schritt: 1.25 }), programmGeaendert: true };

  const { seite, kontext } = await neueSeite({ zustand, einstellungen: TOKEN_EINSTELLUNGEN, mock, zeit: '2026-11-05T18:00:00' });
  await seite.waitForSelector('a.banner');
  assert.equal(mock.datei('gym/programm.json'), repoText, 'Repo nicht überschrieben');
  let z = await geraeteZustand(seite);
  assert.equal(z.programm.uebungen.find((u) => u.id === 'bankdruecken').schritt, 1.25, 'Gerät nicht überschrieben');

  await seite.tap('a.banner');
  const text = await seite.textContent('.konflikt');
  assert.match(text, /Übung „Rudern“: Name Rudern → Rudern am Kabel/);
  assert.match(text, /Übung „Bankdrücken“: Schritt 2,5 kg → 1,25 kg/);
  await seite.tap('[data-testid="konflikt-meins"]');
  await warteBis(() => mock.datei('gym/programm.json') !== repoText, 'eigene Fassung geschrieben');
  const imRepo = JSON.parse(mock.datei('gym/programm.json'));
  assert.equal(imRepo.uebungen.find((u) => u.id === 'bankdruecken').schritt, 1.25);
  z = await geraeteZustand(seite);
  assert.equal(z.sync.konflikt, null);
  await kontext.close();
});

// ---------- n) Tastengröße ----------

test('n) alle Tasten auf allen Bildschirmen sind mindestens 44 × 44 CSS-Pixel groß', async (t) => {
  const mock = erstelleGithubMock();
  mock.schreibe({ 'garmin/stand.md': 'x\n' });
  let zustand = await imRepoSynchronisiert(mock, historie());
  mock.schreibe({ 'gym/programm.json': JSON.stringify(aendereUebung(P, 'rudern', { name: 'Rudern am Kabel' })) }, 'Claude');
  zustand = { ...zustand, programm: aendereUebung(zustand.programm, 'plank', { archiviert: true }), programmGeaendert: true };
  const { seite, kontext } = await neueSeite({ zustand, einstellungen: TOKEN_EINSTELLUNGEN, mock, zeit: '2026-11-05T18:00:00' });
  await seite.waitForSelector('a.banner');
  const basis = seite.url().split('#')[0];
  const geh = async (ziel) => {
    await seite.goto(`${basis}#/${ziel}`);
    await seite.waitForSelector('#app .seite');
  };
  const blattZu = () => seite.tap('.blatt-kopf [data-a="blattZu"]');
  const bildschirme = new Map();
  const zuKlein = [];
  let kleinste = Infinity;
  async function pruefe(name) {
    await seite.waitForTimeout(50);
    const tasten = await tastenGroessen(seite);
    for (const x of tasten) {
      kleinste = Math.min(kleinste, x.b, x.h);
      if (x.b < 44 || x.h < 44) zuKlein.push(`${name}: „${x.text}“ ${x.b}×${x.h}`);
    }
    bildschirme.set(name, tasten.length);
    t.diagnostic(`${name}: ${tasten.length} Tasten geprüft`);
  }

  // Start und Training
  await pruefe('start (Konflikt-Hinweis, Auswahl, Sync-Zeile)');
  await seite.tap('[data-a="starten"]');
  await seite.waitForSelector('.seite.uebung');
  await pruefe('uebung (Satz 1, Gewicht × Wdh., Varianten)');
  await seite.tap('[data-testid="satz-speichern"]');
  await pruefe('uebung (Satz 2, Toast mit Rückgängig)');
  await seite.tap('[data-a="satzBearbeiten"][data-j="0"]');
  await pruefe('uebung (Satz ändern/löschen)');
  await seite.tap('[data-a="bearbeitenAbbrechen"]');
  await seite.tap('[data-testid="satz-speichern"]');
  await pruefe('uebung (erledigt: Weiter / Noch ein Satz)');
  await seite.tap('[data-a="extraSatz"]');
  await pruefe('uebung (zusätzlicher Satz)');
  await seite.tap('.kopf [data-a="menue"]');
  await pruefe('blatt menue (Variante, ersetzen, auslassen)');
  await seite.tap('[data-a="ersetzenOeffnen"]');
  await pruefe('blatt ersetzen (Katalog)');
  await seite.fill('.suche', 'Neue Maschine');
  await pruefe('blatt ersetzen (neue Übung anlegen)');
  await blattZu();
  await geh('uebung/5');
  await pruefe('uebung (ein Messfeld: Zeit)');
  await geh('einheit');
  await pruefe('einheit (Übersicht)');
  await seite.tap('[data-a="menue"][data-i="4"]');
  await seite.tap('[data-a="auslassen"]');
  await geh('uebung/4');
  await pruefe('uebung (ausgelassen: Doch machen)');
  await geh('start');
  await pruefe('start (laufende Einheit)');

  // Programm bearbeiten
  await geh('programm');
  await seite.tap('details.archiv summary');
  await pruefe('programm (Übersicht mit Archiv)');
  await geh('programm/a');
  await pruefe('programm/a (Plätze, Varianten)');
  await seite.tap('[data-a="waehlen"][data-zweck="platz"]');
  await pruefe('blatt platz (Übung hinzufügen)');
  await blattZu();
  await seite.tap('[data-a="waehlen"][data-zweck="variante"][data-i="0"]');
  await pruefe('blatt variante (Variante hinzufügen)');
  await blattZu();
  await geh('programm/a-kurz');
  await pruefe('programm/a-kurz (Kurzfassung)');
  await geh('programm');
  await seite.fill('[data-form="neuesProgramm"] input', 'D');
  await seite.tap('[data-form="neuesProgramm"] button');
  await seite.waitForURL(/#\/programm\/d$/);
  await pruefe('programm/d (neu, leer)');
  for (const [ziel, name] of [['katalog/goblet-squat', 'Gewicht × Wdh.'], ['katalog/klimmzuege', 'Wdh.'], ['katalog/plank', 'Zeit, archiviert']]) {
    await geh(ziel);
    await pruefe(`${ziel} (${name})`);
  }
  await geh('phase/aufbau');
  await pruefe('phase/aufbau (mit Datum)');
  await geh('phase/steigern');
  await pruefe('phase/steigern (ohne Datum)');
  await geh('rotation');
  await pruefe('rotation');

  // Einstellungen und Konflikt
  await geh('einstellungen');
  await pruefe('einstellungen (mit Token)');
  await geh('konflikt');
  await pruefe('konflikt (zwei Fassungen)');
  await seite.tap('[data-testid="konflikt-repo"]');
  await geh('konflikt');
  await pruefe('konflikt (aufgelöst)');
  await geh('einstellungen');
  await seite.tap('[data-a="tokenEntfernen"]');
  await pruefe('einstellungen (ohne Token)');
  await geh('start');
  await pruefe('start (ohne Token)');

  // Vollständig: jede Route des Routers (zeichne() in app.js) und jede Blattart
  const namen = [...bildschirme.keys()];
  for (const route of ['start', 'einheit', 'uebung', 'programm', 'katalog', 'phase', 'rotation', 'einstellungen', 'konflikt', 'blatt menue', 'blatt ersetzen', 'blatt platz', 'blatt variante']) {
    assert.ok(namen.some((n) => n.startsWith(route)), `Bildschirm ${route} nicht geprüft`);
  }
  const geprueft = [...bildschirme.values()].reduce((a, b) => a + b, 0);
  t.diagnostic(`${bildschirme.size} Bildschirme/Zustände, ${geprueft} Tasten, kleinste Kante ${kleinste} CSS-Pixel`);
  assert.ok(geprueft > 300, `nur ${geprueft} Tasten geprüft`);
  assert.deepEqual(zuKlein, []);
  await kontext.close();
});
