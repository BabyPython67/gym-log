import assert from 'node:assert/strict';
import { test } from 'node:test';

import { aendereUebung } from '../../src/logik/bearbeiten.js';
import { FormatFehler, jsonText, leseJahresdatei, migriere, neuerZustand } from '../../src/logik/datenformat.js';
import { speichereSatz, starteEinheit } from '../../src/logik/einheit.js';
import { exportCsv, exportJson, importiere } from '../../src/logik/export.js';
import { SyncFehler, erstelleGithubApi } from '../../src/logik/github.js';
import { uebungNach } from '../../src/logik/programm.js';
import { loeseKonflikt, mitSyncFehler, synchronisiere, wartetAufSync, wendeSyncAn } from '../../src/logik/sync.js';
import { programmUnterschiede } from '../../src/logik/unterschiede.js';
import { gewichtsVorschlag, letzteWerte } from '../../src/logik/vorschlag.js';
import { am, einheitMit, startProgramm } from '../hilfen/daten.mjs';
import { erstelleGithubMock } from '../hilfen/github-mock.mjs';

const GARMIN = { 'README.md': '# claude-projekte\n', 'garmin/2026-10-29-lauf.json': '{"km": 5.2}\n', 'garmin/stand.md': 'Garmin-Sync 16:00\n' };

function aufbau() {
  const mock = erstelleGithubMock();
  mock.schreibe(GARMIN, 'Garmin-Sync');
  const api = erstelleGithubApi({ token: 'test-token', repo: mock.repo, fetch: mock.fetch });
  const sync = async (zustand, extra = {}) => {
    const erg = await synchronisiere(zustand, { api, ordner: 'gym', jetzt: () => am('2026-10-29', '19:05'), appVersion: 'test', ...extra });
    return { zustand: wendeSyncAn(zustand, erg), erg };
  };
  return { mock, api, sync };
}

const P = startProgramm();
const einheitA = () => einheitMit(P, 'a', '2026-10-29', {
  'goblet-squat': [{ kg: 16, wdh: 10 }, { kg: 16, wdh: 10 }],
  bankdruecken: [{ kg: 40, wdh: 8 }, { kg: 40, wdh: 8 }],
  plank: [{ s: 45 }, { s: 40 }],
});

// ---------- f) Sync gegen die nachgebaute GitHub-API ----------

test('f) erster Sync legt programm.json aus dem Startinhalt an und schreibt nur unter gym/', async () => {
  const { mock, sync } = aufbau();
  const vorher = mock.dateien();
  const { zustand, erg } = await sync(neuerZustand(P));
  assert.equal(erg.programm.aktion, 'angelegt');
  assert.deepEqual(JSON.parse(mock.datei('gym/programm.json')), P);
  for (const [pfad, text] of vorher) assert.equal(mock.datei(pfad), text, `${pfad} unverändert`);
  const geaendert = mock.geaendertePfade(erg.commit);
  assert.ok(geaendert.length > 0 && geaendert.every((p) => p.startsWith('gym/')), geaendert.join(', '));
  assert.equal(zustand.programmGeaendert, false);
  assert.equal(mock.commits()[0].message, 'gym: programm.json angelegt');
});

test('f) eine beendete Einheit ergibt genau einen Commit mit Rohdaten, uebersicht.md und stand.md', async () => {
  const { mock, sync } = aufbau();
  let { zustand } = await sync(neuerZustand(P));
  const commitsVorher = mock.commits().length;
  zustand = { ...zustand, einheiten: [einheitA()] };
  const { erg } = await sync(zustand);
  assert.equal(mock.commits().length, commitsVorher + 1);
  assert.deepEqual(mock.geaendertePfade(erg.commit), ['gym/einheiten/2026.json', 'gym/stand.md', 'gym/uebersicht.md']);
  assert.equal(mock.commits()[0].message, 'gym: Einheit A vom 2026-10-29');
  const roh = leseJahresdatei(mock.datei('gym/einheiten/2026.json'));
  assert.deepEqual(roh[0].uebungen[0].saetze.map((s) => [s.kg, s.wdh]), [[16, 10], [16, 10]]);
  assert.match(mock.datei('gym/uebersicht.md'), /^- 2026-10-29 · A · Goblet Squat 16 kg: 10, 10 · Bankdrücken 40 kg: 8, 8 · Plank: 45 s, 40 s$/m);
  assert.match(mock.datei('gym/stand.md'), /Letzter erfolgreicher Sync: 29\.10\.2026, 19:05 Uhr/);
  assert.match(mock.datei('gym/stand.md'), /Letzte Einheit: 2026-10-29 · A \(beendet 19:00 Uhr\)/);
});

test('f) uebersicht.md zeigt die neueste Einheit zuerst', async () => {
  const { mock, sync } = aufbau();
  const a = einheitA();
  const b = einheitMit(P, 'b', '2026-11-02', { latzug: [{ kg: 35, wdh: 9 }] }, [a]);
  await sync({ ...neuerZustand(P), einheiten: [a, b] });
  const zeilen = mock.datei('gym/uebersicht.md').split('\n').filter((z) => z.startsWith('- '));
  assert.deepEqual(zeilen.map((z) => z.slice(2, 16)), ['2026-11-02 · B', '2026-10-29 · A']);
  assert.match(mock.commits()[0].message, /2 Einheiten/);
});

test('f) Sync ohne Änderungen erzeugt keinen Commit', async () => {
  const { mock, sync } = aufbau();
  let { zustand } = await sync({ ...neuerZustand(P), einheiten: [einheitA()] });
  const anzahl = mock.commits().length;
  ({ zustand } = await sync(zustand));
  const { erg } = await sync(zustand);
  assert.equal(erg.commit, null);
  assert.equal(mock.commits().length, anzahl);
});

test('f) eine im Repo geänderte programm.json wird beim nächsten Sync übernommen', async () => {
  const { mock, sync } = aufbau();
  let { zustand } = await sync(neuerZustand(P));
  const vonClaude = aendereUebung(P, 'rudern', { name: 'Rudern am Kabel', schritt: 5 });
  mock.schreibe({ 'gym/programm.json': JSON.stringify(vonClaude, null, 2) }, 'Claude: Rudern angepasst');
  const r = await sync(zustand);
  ({ zustand } = r);
  assert.equal(r.erg.programm.aktion, 'uebernommen');
  assert.equal(uebungNach(zustand.programm, 'rudern').name, 'Rudern am Kabel');
  assert.equal(uebungNach(zustand.programm, 'rudern').schritt, 5);
  assert.equal(zustand.programmGeaendert, false);
  assert.equal(r.erg.commit, null, 'Übernehmen allein schreibt nichts zurück');
});

test('f) hat sich der Branch zwischendurch geändert (Garmin-Sync), wird neu geladen und wiederholt', async () => {
  const { mock, sync } = aufbau();
  let { zustand } = await sync(neuerZustand(P));
  mock.vorPatch = async () => mock.schreibe({ 'garmin/2026-10-29-abend.json': '{"km": 3}\n' }, 'Garmin-Sync');
  const { erg } = await sync({ ...zustand, einheiten: [einheitA()] });
  assert.equal(erg.versuche, 2);
  assert.equal(mock.datei('garmin/2026-10-29-abend.json'), '{"km": 3}\n');
  assert.equal(mock.datei('garmin/2026-10-29-lauf.json'), GARMIN['garmin/2026-10-29-lauf.json']);
  assert.equal(leseJahresdatei(mock.datei('gym/einheiten/2026.json')).length, 1);
  assert.equal(mock.commits()[1].message, 'Garmin-Sync');
  assert.equal(mock.anfragen.filter((a) => a.methode === 'PATCH').length, 3);
});

test('f) hat sich gym/programm.json zwischendurch geändert, gewinnt beim Wiederholen die neue Fassung', async () => {
  const { mock, sync } = aufbau();
  let { zustand } = await sync(neuerZustand(P));
  const vonClaude = aendereUebung(P, 'plank', { spanne: [40, 60] });
  mock.vorPatch = async () => mock.schreibe({ 'gym/programm.json': JSON.stringify(vonClaude) }, 'Claude');
  ({ zustand } = await sync({ ...zustand, einheiten: [einheitA()] }));
  assert.deepEqual(uebungNach(zustand.programm, 'plank').spanne, [40, 60]);
  assert.deepEqual(JSON.parse(mock.datei('gym/programm.json')), vonClaude);
});

test('f) ungültige programm.json im Repo wird weder übernommen noch überschrieben', async () => {
  const { mock, sync } = aufbau();
  let { zustand } = await sync(neuerZustand(P));
  mock.schreibe({ 'gym/programm.json': '{ "format": 1, "uebungen": [ kaputt' }, 'Claude vertippt');
  const r = await sync({ ...zustand, einheiten: [einheitA()] });
  assert.equal(r.erg.programm.aktion, 'ungueltig');
  assert.match(r.zustand.sync.warnung, /programm\.json im Repo wird nicht übernommen/);
  assert.equal(mock.datei('gym/programm.json'), '{ "format": 1, "uebungen": [ kaputt');
  assert.equal(leseJahresdatei(mock.datei('gym/einheiten/2026.json')).length, 1, 'Einheiten werden trotzdem gesichert');
});

test('f) Repo und Ordner sind einstellbar; geschrieben wird nur im gewählten Ordner', async () => {
  const { mock, api } = aufbau();
  const erg = await synchronisiere({ ...neuerZustand(P), einheiten: [einheitA()] }, { api, ordner: '/training/gym/', jetzt: () => am('2026-10-29', '19:05') });
  assert.ok(mock.geaendertePfade(erg.commit).every((p) => p.startsWith('training/gym/')));
  assert.ok(mock.datei('training/gym/programm.json'));
  assert.throws(() => erstelleGithubApi({ token: 'x', repo: 'nur-ein-name', fetch: mock.fetch }), SyncFehler);
});

test('f) GitHub-Abrufe gehen am HTTP-Cache vorbei und tragen den Token nur im Header', async () => {
  const gesehen = [];
  const api = erstelleGithubApi({ token: 'geheim-123', repo: 'a/b', fetch: async (url, init) => { gesehen.push({ url, init }); return new Response('{"default_branch":"main"}', { status: 200 }); } });
  await api.standardBranch();
  assert.equal(gesehen[0].init.cache, 'no-store');
  assert.ok(!gesehen[0].url.includes('geheim'));
  assert.equal(gesehen[0].init.headers.Authorization, 'Bearer geheim-123');
});

// ---------- e) offline ----------

test('e) offline eingetragene Sätze bleiben auf dem Gerät und werden später vollständig synchronisiert', async () => {
  const { mock, sync } = aufbau();
  let { zustand } = await sync(neuerZustand(P));
  mock.offline = true;
  zustand = { ...zustand, einheiten: [einheitA()] };
  await assert.rejects(sync(zustand), (e) => e instanceof SyncFehler && e.art === 'offline');
  zustand = mitSyncFehler(zustand, new SyncFehler('offline', 'Keine Verbindung'), am('2026-10-29', '19:06'));
  assert.equal(zustand.einheiten.length, 1);
  assert.equal(wartetAufSync(zustand), true);
  // zweite Einheit, immer noch offline
  const b = einheitMit(P, 'b', '2026-11-02', { latzug: [{ kg: 35, wdh: 9 }, { kg: 35, wdh: 8 }] }, zustand.einheiten);
  zustand = { ...zustand, einheiten: [...zustand.einheiten, b] };
  mock.offline = false;
  ({ zustand } = await sync(zustand));
  const roh = leseJahresdatei(mock.datei('gym/einheiten/2026.json'));
  assert.equal(roh.length, 2);
  const alleSaetze = roh.flatMap((e) => e.uebungen.flatMap((u) => u.saetze));
  assert.equal(alleSaetze.length, 8);
  assert.equal(wartetAufSync(zustand), false);
  assert.equal(zustand.sync.fehler, null);
});

test('e) Sätze, die während eines laufenden Syncs eingetragen werden, gehen nicht verloren', async () => {
  const { api } = aufbau();
  const offen = starteEinheit(P, 'a', [], am('2026-10-29', '18:00'));
  const vorher = { ...neuerZustand(P), einheiten: [einheitA(), offen] };
  const laufend = synchronisiere(vorher, { api, jetzt: () => am('2026-10-29', '19:05') });
  const nachher = { ...vorher, einheiten: [vorher.einheiten[0], speichereSatz(offen, 1, { kg: 42.5, wdh: 6 }, am('2026-10-29', '19:04'))] };
  const z = wendeSyncAn(nachher, await laufend);
  assert.deepEqual(z.einheiten.find((e) => e.id === offen.id).uebungen[1].saetze.map((s) => s.kg), [42.5]);
});

test('e) abgelaufener Token: unaufdringliche Meldung, Daten bleiben, Token steht nirgends in der Meldung', async () => {
  const { mock, sync } = aufbau();
  mock.token = 'neuer-token';
  const zustand = { ...neuerZustand(P), einheiten: [einheitA()] };
  const fehler = await sync(zustand).catch((e) => e);
  assert.equal(fehler.art, 'token');
  assert.match(fehler.message, /abgelaufen/);
  assert.ok(!fehler.message.includes('test-token'));
  const z = mitSyncFehler(zustand, fehler, am('2026-10-29', '19:06'));
  assert.equal(z.einheiten.length, 1);
  assert.equal(z.sync.fehler.art, 'token');
});

// ---------- g) neues Gerät ----------

test('g) ein neues, leeres Gerät lädt nach Eingabe des Tokens Historie und Programm aus dem Repo', async () => {
  const { sync } = aufbau();
  const a = einheitA();
  const b = einheitMit(P, 'b', '2026-11-02', { latzug: [{ kg: 35, wdh: 10 }, { kg: 35, wdh: 10 }] }, [a]);
  const geaendert = aendereUebung(P, 'latzug', { schritt: 5 });
  await sync({ ...neuerZustand(geaendert), programmGeaendert: true, einheiten: [a, b] });

  const { zustand: neu } = await sync(neuerZustand(P));
  assert.deepEqual(neu.einheiten.map((e) => e.id), [a.id, b.id]);
  assert.equal(uebungNach(neu.programm, 'latzug').schritt, 5);
  assert.equal(neu.programmGeaendert, false);
  const v = gewichtsVorschlag(uebungNach(neu.programm, 'latzug'), letzteWerte(neu.einheiten, 'latzug'));
  assert.equal(v.kg, 40);
});

test('g) zwei Geräte: Einheiten beider landen zusammen im Repo', async () => {
  const { mock, sync } = aufbau();
  let { zustand: handy } = await sync({ ...neuerZustand(P), einheiten: [einheitA()] });
  let { zustand: altesHandy } = await sync(neuerZustand(P));
  const b = einheitMit(P, 'b', '2026-11-02', { latzug: [{ kg: 35, wdh: 9 }] }, altesHandy.einheiten);
  ({ zustand: altesHandy } = await sync({ ...altesHandy, einheiten: [...altesHandy.einheiten, b] }));
  ({ zustand: handy } = await sync(handy));
  assert.equal(leseJahresdatei(mock.datei('gym/einheiten/2026.json')).length, 2);
  assert.equal(handy.einheiten.length, 2);
});

// ---------- m) gleichzeitige Programmänderung ----------

async function konfliktLage() {
  const lage = aufbau();
  let { zustand } = await lage.sync({ ...neuerZustand(P), einheiten: [] });
  const vonClaude = aendereUebung(P, 'rudern', { name: 'Rudern am Kabel' });
  lage.mock.schreibe({ 'gym/programm.json': JSON.stringify(vonClaude, null, 2) }, 'Claude');
  zustand = { ...zustand, programm: aendereUebung(zustand.programm, 'bankdruecken', { schritt: 1.25 }), programmGeaendert: true };
  return { ...lage, zustand, vonClaude };
}

test('m) Programm in App und Repo gleichzeitig geändert: nichts wird still überschrieben, der Unterschied wird gezeigt', async () => {
  const { mock, sync, zustand: vorher, vonClaude } = await konfliktLage();
  const repoVorher = mock.datei('gym/programm.json');
  const { zustand, erg } = await sync({ ...vorher, einheiten: [einheitA()] });
  assert.equal(erg.programm.aktion, 'konflikt');
  assert.equal(mock.datei('gym/programm.json'), repoVorher, 'Repo-Fassung unverändert');
  assert.equal(uebungNach(zustand.programm, 'bankdruecken').schritt, 1.25, 'Gerätefassung unverändert');
  assert.equal(uebungNach(zustand.programm, 'rudern').name, 'Rudern', 'nichts still übernommen');
  assert.deepEqual(zustand.sync.konflikt.repo, vonClaude);
  assert.deepEqual(programmUnterschiede(zustand.sync.konflikt.basis, zustand.sync.konflikt.repo), ['Übung „Rudern“: Name Rudern → Rudern am Kabel']);
  assert.deepEqual(programmUnterschiede(zustand.sync.konflikt.basis, zustand.programm), ['Übung „Bankdrücken“: Schritt 2,5 kg → 1,25 kg']);
  assert.equal(leseJahresdatei(mock.datei('gym/einheiten/2026.json')).length, 1, 'Einheiten werden trotz Konflikt gesichert');
});

test('m) Konflikt auflösen: „Fassung aus dem Repo“ übernimmt sie; „meine Fassung“ schreibt sie ins Repo', async () => {
  {
    const { sync, mock, zustand: vorher, vonClaude } = await konfliktLage();
    let { zustand } = await sync(vorher);
    zustand = loeseKonflikt(zustand, 'repo');
    assert.deepEqual(zustand.programm, vonClaude);
    assert.equal(zustand.sync.konflikt, null);
    const { erg } = await sync(zustand);
    assert.equal(erg.programm.aktion, 'gleich');
    assert.deepEqual(JSON.parse(mock.datei('gym/programm.json')), vonClaude);
  }
  {
    const { sync, mock, zustand: vorher } = await konfliktLage();
    let { zustand } = await sync(vorher);
    zustand = loeseKonflikt(zustand, 'meins');
    const { erg } = await sync(zustand);
    assert.equal(erg.programm.aktion, 'geschrieben');
    assert.equal(uebungNach(JSON.parse(mock.datei('gym/programm.json')), 'bankdruecken').schritt, 1.25);
  }
});

test('m) eigene Änderung ohne Repo-Änderung wird geschrieben, ohne Konflikt', async () => {
  const { mock, sync } = aufbau();
  let { zustand } = await sync(neuerZustand(P));
  zustand = { ...zustand, programm: aendereUebung(zustand.programm, 'plank', { spanne: [40, 60] }), programmGeaendert: true };
  const r = await sync(zustand);
  assert.equal(r.erg.programm.aktion, 'geschrieben');
  assert.equal(mock.commits()[0].message, 'gym: Programm geändert');
  assert.deepEqual(uebungNach(JSON.parse(mock.datei('gym/programm.json')), 'plank').spanne, [40, 60]);
  assert.equal(r.zustand.programmGeaendert, false);
});

test('m) wird während des Syncs lokal bearbeitet, führt eine Repo-Änderung später zum Konflikt statt zum Überschreiben', async () => {
  const { mock, api, sync } = aufbau();
  let { zustand } = await sync(neuerZustand(P));
  mock.schreibe({ 'gym/programm.json': JSON.stringify(aendereUebung(P, 'rudern', { name: 'Rudern am Kabel' })) }, 'Claude');
  const laufend = synchronisiere(zustand, { api, jetzt: () => am('2026-10-29', '19:05') });
  const bearbeitet = { ...zustand, programm: aendereUebung(zustand.programm, 'plank', { spanne: [40, 60] }), programmGeaendert: true };
  zustand = wendeSyncAn(bearbeitet, await laufend);
  assert.deepEqual(uebungNach(zustand.programm, 'plank').spanne, [40, 60]);
  const { erg } = await sync(zustand);
  assert.equal(erg.programm.aktion, 'konflikt');
});

// ---------- h) Export ----------

test('h) Export als JSON (offenes Format, ohne Token) und Wiederherstellung per Import auf leerem Gerät', () => {
  const zustand = { ...neuerZustand(aendereUebung(P, 'plank', { spanne: [40, 60] })), einheiten: [einheitA()] };
  const text = exportJson(zustand, { jetzt: am('2026-10-30'), appVersion: 'test' });
  const d = JSON.parse(text);
  assert.equal(d.format, 1);
  assert.equal(d.art, 'gym-log-export');
  assert.ok(!/token/i.test(text));
  const leer = neuerZustand(P);
  const r = importiere(leer, text);
  assert.equal(r.neu, 1);
  assert.deepEqual(r.zustand.einheiten, zustand.einheiten);
  assert.equal(r.programmUebernommen, true);
  assert.deepEqual(uebungNach(r.zustand.programm, 'plank').spanne, [40, 60]);
  assert.throws(() => importiere(leer, '{"foo":1}'), /keine Export-Datei/);
});

test('h) Export als CSV: Kopfzeile, ein Satz pro Zeile, Dezimalpunkt', () => {
  const a = einheitA();
  const b = einheitMit(P, 'a', '2026-11-05', { bankdruecken: [{ kg: 42.5, wdh: 7 }] }, [a]);
  const zeilen = exportCsv({ programm: P, einheiten: [a, b] }).trim().split('\r\n');
  assert.equal(zeilen[0], 'datum,programm,uebung_id,uebung,messart,satz,kg,wdh,s,m,zeitpunkt,statt,einheit_id');
  assert.equal(zeilen.length, 1 + 6 + 1);
  assert.match(zeilen[1], /^2026-10-29,A,goblet-squat,Goblet Squat,gewicht_wdh,1,16,10,,,2026-10-29T17:01:00\.000Z,,/);
  assert.match(zeilen[7], /^2026-11-05,A,bankdruecken,Bankdrücken,gewicht_wdh,1,42\.5,7,/);
});

// ---------- l) Datenformat mit Versionsnummer ----------

test('l) Datenformat mit Versionsnummer: ältere Dateien werden migriert, neuere abgelehnt', () => {
  const migrationen = { 1: (d) => ({ ...d, einheiten: d.einheiten.map((e) => ({ ...e, neu: true })) }) };
  const alt = { format: 1, einheiten: [{ id: 'x' }] };
  assert.deepEqual(migriere('einheiten', alt, 2, migrationen), { format: 2, einheiten: [{ id: 'x', neu: true }] });
  assert.equal(alt.format, 1, 'Original bleibt unverändert');
  assert.throws(() => migriere('programm.json', { format: 3 }, 1, {}), (e) => e instanceof FormatFehler && /App neu laden/.test(e.message));
  assert.throws(() => migriere('programm.json', {}, 1, {}), FormatFehler);
  assert.equal(jsonText(P), jsonText(JSON.parse(jsonText(P))));
});
