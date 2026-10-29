import assert from 'node:assert/strict';
import { test } from 'node:test';

import { aendereUebung, entfernePlatz, loescheUebung, neuesProgramm, fuegePlatzHinzu, setzeRotation } from '../../src/logik/bearbeiten.js';
import { aendereSatz, beende, beendeVergessene, ersetzeHeute, lasseAus, loescheSatz, fuegeSatzEin, naechsteOffene, speichereSatz, starteEinheit, verwerfe, waehleVariante } from '../../src/logik/einheit.js';
import { exportCsv, exportJson } from '../../src/logik/export.js';
import { messart, satzVollstaendig } from '../../src/logik/messarten.js';
import { aktivePhase, mitNeuerUebung, naechstesProgramm, plaetzeVon, pruefeProgramm, sichereHistorie, uebungNach } from '../../src/logik/programm.js';
import { uebersichtText } from '../../src/logik/texte.js';
import { gewichtsVorschlag, letzteWerte, vorbelegung } from '../../src/logik/vorschlag.js';
import { am, einheitMit, startProgramm } from '../hilfen/daten.mjs';

const P = startProgramm();
const u = (id) => uebungNach(P, id);

// ---------- c) Gewichtsvorschlag ----------

test('c) ohne Historie kein Vorschlag, sondern „Gewicht suchen“', () => {
  assert.deepEqual(gewichtsVorschlag(u('bankdruecken'), letzteWerte([], 'bankdruecken')), { art: 'suchen' });
});

test('c) alle Sätze am oberen Ende → Erhöhung um genau die Schrittgröße der Variante', () => {
  const e = einheitMit(P, 'a', '2026-10-29', { 'goblet-squat': [{ kg: 16, wdh: 10 }, { kg: 16, wdh: 10 }], bankdruecken: [{ kg: 40, wdh: 10 }, { kg: 40, wdh: 11 }] });
  const goblet = gewichtsVorschlag(u('goblet-squat'), letzteWerte([e], 'goblet-squat'));
  assert.equal(goblet.art, 'hoeher');
  assert.equal(goblet.kg, 18); // Schritt Goblet Squat: 2 kg
  const bank = gewichtsVorschlag(u('bankdruecken'), letzteWerte([e], 'bankdruecken'));
  assert.equal(bank.kg, 42.5); // Schritt Bankdrücken: 2,5 kg
});

test('c) ein Satz unter dem oberen Ende → gleiches Gewicht', () => {
  const e = einheitMit(P, 'a', '2026-10-29', { bankdruecken: [{ kg: 40, wdh: 10 }, { kg: 40, wdh: 9 }] });
  const v = gewichtsVorschlag(u('bankdruecken'), letzteWerte([e], 'bankdruecken'));
  assert.deepEqual([v.art, v.kg, v.fehlt], ['gleich', 40, 1]);
});

test('c) maßgeblich ist nur die letzte Einheit der Übung, nicht ältere', () => {
  const alt = einheitMit(P, 'a', '2026-10-29', { bankdruecken: [{ kg: 40, wdh: 10 }, { kg: 40, wdh: 10 }] });
  const neu = einheitMit(P, 'a', '2026-11-05', { bankdruecken: [{ kg: 42.5, wdh: 8 }, { kg: 42.5, wdh: 7 }] });
  const v = gewichtsVorschlag(u('bankdruecken'), letzteWerte([alt, neu], 'bankdruecken'));
  assert.deepEqual([v.art, v.kg], ['gleich', 42.5]);
});

test('c) ein Satz mit weniger Gewicht zählt als nicht geschafft', () => {
  const e = einheitMit(P, 'a', '2026-10-29', { bankdruecken: [{ kg: 40, wdh: 10 }, { kg: 37.5, wdh: 10 }] });
  const v = gewichtsVorschlag(u('bankdruecken'), letzteWerte([e], 'bankdruecken'));
  assert.deepEqual([v.art, v.kg], ['gleich', 40]);
});

test('c) Messarten ohne Gewicht bekommen keinen Vorschlag, nur den letzten Wert', () => {
  const e = einheitMit(P, 'a', '2026-10-29', { plank: [{ s: 45 }, { s: 40 }] });
  assert.equal(gewichtsVorschlag(u('plank'), letzteWerte([e], 'plank')), null);
  assert.deepEqual(letzteWerte([e], 'plank').saetze.map((s) => s.s), [45, 40]);
  assert.equal(gewichtsVorschlag(u('klimmzuege'), null), null);
});

// ---------- b) Werte vom letzten Mal ----------

test('b) „letztes Mal“ ist die neueste Einheit mit Sätzen genau dieser Übung; laufende und verworfene zählen nicht', () => {
  const alt = einheitMit(P, 'a', '2026-10-29', { bankdruecken: [{ kg: 40, wdh: 10 }] });
  const neu = einheitMit(P, 'a', '2026-11-05', { bankdruecken: [{ kg: 42.5, wdh: 8 }, { kg: 42.5, wdh: 7 }] }, [alt]);
  const ohne = einheitMit(P, 'b', '2026-11-09', { latzug: [{ kg: 35, wdh: 9 }] }, [alt, neu]);
  const verworfen = verwerfe(einheitMit(P, 'a', '2026-11-12', { bankdruecken: [{ kg: 50, wdh: 1 }] }), am('2026-11-12', '19:30'));
  const laufend = speichereSatz(starteEinheit(P, 'a', [], am('2026-11-16')), 1, { kg: 45, wdh: 3 }, am('2026-11-16', '18:05'));
  const l = letzteWerte([laufend, verworfen, ohne, alt, neu], 'bankdruecken', laufend.id);
  assert.equal(l.datum, '2026-11-05');
  assert.deepEqual(l.saetze.map((s) => [s.kg, s.wdh]), [[42.5, 8], [42.5, 7]]);
  assert.equal(letzteWerte([alt], 'goblet-squat'), null);
});

// ---------- a) Vorbelegung (die Grundlage für „höchstens 2 Taps“) ----------

test('a) Vorbelegung: vorgeschlagenes Gewicht und Wiederholungen desselben Satzes vom letzten Mal', () => {
  const e = einheitMit(P, 'a', '2026-10-29', { bankdruecken: [{ kg: 40, wdh: 10 }, { kg: 40, wdh: 9 }] });
  const letzte = letzteWerte([e], 'bankdruecken');
  const v = gewichtsVorschlag(u('bankdruecken'), letzte);
  assert.deepEqual(vorbelegung(u('bankdruecken'), letzte, v, [], 0), { kg: 40, wdh: 10 });
  assert.deepEqual(vorbelegung(u('bankdruecken'), letzte, v, [{ kg: 40, wdh: 10 }], 1), { kg: 40, wdh: 9 });
});

test('a) Vorbelegung: gab es den Satz letztes Mal nicht, gelten die Wdh. des letzten Satzes', () => {
  const e = einheitMit(P, 'a', '2026-11-05', { bankdruecken: [{ kg: 40, wdh: 10 }, { kg: 40, wdh: 8 }] });
  const letzte = letzteWerte([e], 'bankdruecken');
  const heute = [{ kg: 40, wdh: 10 }, { kg: 40, wdh: 8 }];
  assert.deepEqual(vorbelegung(u('bankdruecken'), letzte, gewichtsVorschlag(u('bankdruecken'), letzte), heute, 2), { kg: 40, wdh: 8 });
});

test('a) Vorbelegung ohne Historie: Satz 1 leer, ab Satz 2 der vorige Satz von heute', () => {
  assert.deepEqual(vorbelegung(u('bankdruecken'), null, { art: 'suchen' }, [], 0), { kg: null, wdh: null });
  assert.deepEqual(vorbelegung(u('bankdruecken'), null, { art: 'suchen' }, [{ kg: 30, wdh: 9 }], 1), { kg: 30, wdh: 9 });
});

test('a) heute geändertes Gewicht gilt für die folgenden Sätze', () => {
  const e = einheitMit(P, 'a', '2026-10-29', { bankdruecken: [{ kg: 40, wdh: 10 }, { kg: 40, wdh: 10 }] });
  const letzte = letzteWerte([e], 'bankdruecken');
  assert.equal(vorbelegung(u('bankdruecken'), letzte, gewichtsVorschlag(u('bankdruecken'), letzte), [{ kg: 40, wdh: 10 }], 1).kg, 40);
});

// ---------- d) Phasen und Messarten ----------

test('d) am 08.11.2026 gilt die erste Phase, am 09.11.2026 die zweite', () => {
  assert.equal(aktivePhase(P, '2026-11-08').id, 'einstieg');
  assert.equal(aktivePhase(P, '2026-11-09').id, 'aufbau');
  const e8 = starteEinheit(P, 'a', [], am('2026-11-08'));
  const e9 = starteEinheit(P, 'a', [], am('2026-11-09'));
  assert.deepEqual(e8.uebungen.map((x) => [x.vorgabe.saetze, x.vorgabe.reserve]), Array(6).fill([2, '3']));
  assert.deepEqual(e9.uebungen.map((x) => [x.vorgabe.saetze, x.vorgabe.reserve]), Array(6).fill([3, '2']));
});

test('d) die Phase ohne Datum bleibt inaktiv – auch Jahre später', () => {
  assert.equal(P.phasen[2].ab, null);
  assert.equal(aktivePhase(P, '2030-01-01').id, 'aufbau');
  assert.equal(aktivePhase(P, '2026-10-28'), null);
});

test('d) trägt jemand ein Datum ein, wird die dritte Phase ab dann aktiv (Grundübungen 1–2, andere 2)', () => {
  const p = structuredClone(P);
  p.phasen[2].ab = '2027-01-11';
  assert.equal(aktivePhase(p, '2027-01-10').id, 'aufbau');
  const e = starteEinheit(p, 'b', [], am('2027-01-11'));
  assert.equal(e.phase, 'steigern');
  assert.deepEqual(e.uebungen.map((x) => x.vorgabe.reserve), ['1–2', '1–2', '1–2', '2', '2', '2']);
});

test('d) Spannen: Grundübungen 6–10 (A: erste vier, B: erste drei), sonst 10–15; Plank in Sekunden', () => {
  const spannen = (id) => plaetzeVon(P, id).map((pl) => pl.varianten.map((v) => u(v).spanne.join('–')).join('/'));
  assert.deepEqual(spannen('a'), ['6–10/6–10', '6–10', '6–10', '6–10', '10–15', '30–45']);
  assert.deepEqual(spannen('b'), ['6–10/6–10', '6–10', '6–10/6–10', '10–15', '10–15', '10–15']);
  assert.equal(messart(u('plank').messart).felder[0].einheit, 's');
});

test('d) jede Variante hat ihre eigene Messart, Schrittgröße und Historie', () => {
  assert.equal(u('latzug').messart, 'gewicht_wdh');
  assert.equal(u('klimmzuege').messart, 'wdh');
  assert.notEqual(u('goblet-squat').schritt, u('langhantel-kniebeuge').schritt);
  for (const x of P.uebungen) assert.ok(messart(x.messart), `${x.id} hat eine bekannte Messart`);
  const e = einheitMit(P, 'b', '2026-10-30', { klimmzuege: [{ wdh: 6 }, { wdh: 5 }] });
  assert.equal(letzteWerte([e], 'latzug'), null);
  assert.deepEqual(letzteWerte([e], 'klimmzuege').saetze.map((s) => s.wdh), [6, 5]);
  assert.ok(satzVollstaendig('wdh', { wdh: 6 }));
  assert.ok(!satzVollstaendig('gewicht_wdh', { wdh: 6 }));
});

test('d) die zuletzt trainierte Variante ist beim nächsten Mal voreingestellt', () => {
  const e = einheitMit(P, 'b', '2026-10-30', { 'trap-bar-kreuzheben': [{ kg: 60, wdh: 8 }] });
  const naechste = starteEinheit(P, 'b', [e], am('2026-11-03'));
  assert.equal(naechste.uebungen[0].uebung, 'trap-bar-kreuzheben');
  assert.equal(starteEinheit(P, 'a', [], am('2026-10-29')).uebungen[0].uebung, 'goblet-squat');
});

// ---------- k) Rotation und Programme ----------

test('k) Rotation: ohne Historie A, nach A kommt B, nach B kommt A', () => {
  assert.equal(naechstesProgramm(P, []), 'a');
  const a = einheitMit(P, 'a', '2026-10-29', { bankdruecken: [{ kg: 40, wdh: 8 }] });
  assert.equal(naechstesProgramm(P, [a]), 'b');
  const b = einheitMit(P, 'b', '2026-11-02', { latzug: [{ kg: 40, wdh: 8 }] });
  assert.equal(naechstesProgramm(P, [a, b]), 'a');
});

test('k) A kurz und B kurz: erste drei Übungen, nicht in der Rotation, zählen aber als A bzw. B', () => {
  assert.deepEqual(plaetzeVon(P, 'a-kurz').map((pl) => pl.varianten[0]), ['goblet-squat', 'bankdruecken', 'rudern']);
  assert.deepEqual(plaetzeVon(P, 'b-kurz').map((pl) => pl.varianten[0]), ['beinpresse', 'schulterdruecken', 'latzug']);
  assert.ok(!P.rotation.includes('a-kurz'));
  const kurz = einheitMit(P, 'a-kurz', '2026-11-16', { bankdruecken: [{ kg: 40, wdh: 8 }] });
  assert.equal(naechstesProgramm(P, [kurz]), 'b');
});

test('k) Rotation frei einstellbar, auch mit neuem Programm C', () => {
  const { programm, id } = neuesProgramm(P, 'C');
  let p = fuegePlatzHinzu(programm, id, 'beinpresse');
  p = setzeRotation(p, ['a', 'b', id]);
  assert.deepEqual(pruefeProgramm(p), []);
  const b = einheitMit(p, 'b', '2026-11-02', { latzug: [{ kg: 40, wdh: 8 }] });
  assert.equal(naechstesProgramm(p, [b]), 'c');
});

test('k) Leichtathletik ohne Codeänderung: Programm mit Weite und Laufzeit nur als Daten', () => {
  let p = structuredClone(P);
  p.uebungen.push(
    { id: 'kugelstossen-6kg', name: 'Kugelstoßen 6 kg', messart: 'weite', spanne: null, schritt: null, rolle: 'technik' },
    { id: 'sprint-30m', name: 'Sprint 30 m', messart: 'laufzeit', spanne: null, schritt: null, rolle: 'technik' },
  );
  p.programme.push({ id: 'dreikampf', name: 'Dreikampf', plaetze: [{ varianten: ['kugelstossen-6kg'], saetze: 6 }, { varianten: ['sprint-30m'], saetze: 4 }] });
  assert.deepEqual(pruefeProgramm(p), []);
  let e = starteEinheit(p, 'dreikampf', [], am('2027-04-12'));
  assert.equal(e.uebungen[0].vorgabe.saetze, 6);
  e = speichereSatz(e, 0, { m: 8.2 }, am('2027-04-12', '17:10'));
  e = speichereSatz(e, 1, { s: 4.62 }, am('2027-04-12', '17:20'));
  e = beende(e, am('2027-04-12', '18:00'));
  assert.match(uebersichtText(p, [e]), /Kugelstoßen 6 kg: 8,20 m · Sprint 30 m: 4,62 s/);
  assert.equal(gewichtsVorschlag(uebungNach(p, 'kugelstossen-6kg'), letzteWerte([e], 'kugelstossen-6kg')), null);
});

test('k) Startinhalt ist gültig; fehlerhafte programm.json wird mit lesbarer Begründung abgelehnt', () => {
  assert.deepEqual(pruefeProgramm(P), []);
  const kaputt = structuredClone(P);
  kaputt.programme[0].plaetze[1].varianten = ['gibt-es-nicht'];
  kaputt.uebungen[0].messart = 'kilo';
  const fehler = pruefeProgramm(kaputt);
  assert.ok(fehler.some((f) => f.includes('„gibt-es-nicht“ steht nicht im Katalog')));
  assert.ok(fehler.some((f) => f.includes('Messart „kilo“ unbekannt')));
});

// ---------- j) nur für heute ersetzen und auslassen ----------

test('j) Übung nur für heute durch eine aus dem Katalog ersetzen: Programm bleibt unverändert', () => {
  const vorher = JSON.stringify(P);
  let e = starteEinheit(P, 'b', [], am('2026-10-30'));
  ({ einheit: e } = ersetzeHeute(P, e, 0, 'trap-bar-kreuzheben', am('2026-10-30', '18:01')));
  assert.equal(e.uebungen[0].uebung, 'trap-bar-kreuzheben');
  assert.equal(e.uebungen[0].ersetzt, 'beinpresse');
  assert.equal(JSON.stringify(P), vorher);
  assert.equal(starteEinheit(P, 'b', [], am('2026-11-03')).uebungen[0].uebung, 'beinpresse');
});

test('j) Ersatz nach schon gemachten Sätzen: alte Sätze bleiben, Ersatz kommt dahinter', () => {
  let e = starteEinheit(P, 'a', [], am('2026-10-29'));
  e = speichereSatz(e, 1, { kg: 40, wdh: 8 }, am('2026-10-29', '18:05'));
  const r = ersetzeHeute(P, e, 1, 'schulterdruecken', am('2026-10-29', '18:06'));
  assert.equal(r.index, 2);
  assert.equal(r.einheit.uebungen[1].saetze.length, 1);
  assert.equal(r.einheit.uebungen[2].uebung, 'schulterdruecken');
  assert.equal(r.einheit.uebungen.length, 7);
});

test('j) neue Übung im Gym braucht nur einen Namen, bekommt Standardwerte und landet im Katalog, nicht im Programm', () => {
  const { programm, id } = mitNeuerUebung(P, '  Hackenschmidt   Maschine ');
  const neu = uebungNach(programm, id);
  assert.equal(id, 'hackenschmidt-maschine');
  assert.deepEqual({ ...neu }, { id, name: 'Hackenschmidt Maschine', messart: 'gewicht_wdh', spanne: [10, 15], schritt: 2.5, rolle: 'zusatz' });
  assert.deepEqual(programm.programme, P.programme);
  assert.deepEqual(pruefeProgramm(programm), []);
  assert.equal(mitNeuerUebung(programm, 'Hackenschmidt Maschine').id, 'hackenschmidt-maschine-2');
  let e = starteEinheit(programm, 'a', [], am('2026-10-29'));
  ({ einheit: e } = ersetzeHeute(programm, e, 0, id, am('2026-10-29', '18:01')));
  e = beende(speichereSatz(e, 0, { kg: 60, wdh: 12 }, am('2026-10-29', '18:03')), am('2026-10-29', '19:00'));
  assert.deepEqual(letzteWerte([e], id).saetze.map((s) => s.kg), [60]);
  assert.equal(letzteWerte([e], 'goblet-squat'), null);
});

test('j) auslassen ändert das Programm nicht, zählt als erledigt und lässt sich zurücknehmen', () => {
  const vorher = JSON.stringify(P);
  let e = starteEinheit(P, 'a', [], am('2026-10-29'));
  e = lasseAus(e, 0, am('2026-10-29', '18:01'));
  assert.equal(e.uebungen[0].ausgelassen, true);
  assert.equal(naechsteOffene(e, 0), 1);
  assert.equal(JSON.stringify(P), vorher);
  e = beende(speichereSatz(e, 1, { kg: 40, wdh: 8 }, am('2026-10-29', '18:05')), am('2026-10-29', '19:00'));
  assert.match(uebersichtText(P, [e]), /Goblet Squat ausgelassen · Bankdrücken 40 kg: 8/);
});

test('j) Variante wechseln geht, solange noch kein Satz eingetragen ist', () => {
  let e = starteEinheit(P, 'b', [], am('2026-10-30'));
  e = waehleVariante(P, e, 2, 'klimmzuege', am('2026-10-30', '18:00'));
  assert.equal(e.uebungen[2].uebung, 'klimmzuege');
  assert.equal(e.uebungen[2].messart, 'wdh');
  e = speichereSatz(e, 2, { wdh: 5 }, am('2026-10-30', '18:10'));
  assert.equal(waehleVariante(P, e, 2, 'latzug', am('2026-10-30', '18:11')).uebungen[2].uebung, 'klimmzuege');
});

// ---------- Korrekturen (Teil von a: Fehleingaben lassen sich korrigieren) ----------

test('a) Fehleingaben korrigieren: Satz ändern, löschen und Löschen rückgängig machen', () => {
  let e = starteEinheit(P, 'a', [], am('2026-10-29'));
  e = speichereSatz(e, 1, { kg: 40, wdh: 8 }, am('2026-10-29', '18:05'));
  e = aendereSatz(e, 1, 0, { wdh: 9 }, am('2026-10-29', '18:06'));
  assert.deepEqual([e.uebungen[1].saetze[0].kg, e.uebungen[1].saetze[0].wdh], [40, 9]);
  const satz = e.uebungen[1].saetze[0];
  e = loescheSatz(e, 1, 0, am('2026-10-29', '18:07'));
  assert.equal(e.uebungen[1].saetze.length, 0);
  e = fuegeSatzEin(e, 1, 0, satz, am('2026-10-29', '18:08'));
  assert.deepEqual(e.uebungen[1].saetze[0], satz);
});

test('a) vergessene offene Einheit wird nach 6 Stunden beendet, leere verworfen', () => {
  let voll = starteEinheit(P, 'a', [], am('2026-10-29', '18:00'));
  voll = speichereSatz(voll, 1, { kg: 40, wdh: 8 }, am('2026-10-29', '18:20'));
  const leer = starteEinheit(P, 'b', [], am('2026-10-29', '17:00'));
  const r = beendeVergessene([voll, leer], am('2026-10-30', '08:00'));
  assert.equal(r.einheiten[0].beendet, voll.uebungen[1].saetze[0].t);
  assert.equal(r.einheiten[1].geloescht, true);
  assert.equal(beendeVergessene([voll], am('2026-10-29', '19:00')).beendet.length, 0);
});

// ---------- l) Historie bleibt ----------

test('l) umbenannte Übung behält ihre Historie und Vorschläge', () => {
  const e = einheitMit(P, 'a', '2026-10-29', { rudern: [{ kg: 35, wdh: 10 }, { kg: 35, wdh: 10 }] });
  const p = aendereUebung(P, 'rudern', { name: 'Rudern am Kabel' });
  assert.equal(uebungNach(p, 'rudern').name, 'Rudern am Kabel');
  assert.equal(gewichtsVorschlag(uebungNach(p, 'rudern'), letzteWerte([e], 'rudern')).kg, 37.5);
  assert.match(uebersichtText(p, [e]), /Rudern am Kabel 35 kg: 10, 10/);
});

test('l) aus dem Programm entfernte Übung bleibt in Einheiten, Übersicht, Export und Katalog', () => {
  const e = einheitMit(P, 'a', '2026-10-29', { 'aussenrotation-kabel': [{ kg: 5, wdh: 15 }] });
  const p = entfernePlatz(P, 'a', 4);
  assert.ok(!plaetzeVon(p, 'a').some((pl) => pl.varianten.includes('aussenrotation-kabel')));
  assert.ok(uebungNach(p, 'aussenrotation-kabel'));
  const zustand = { programm: p, einheiten: [e] };
  assert.match(uebersichtText(p, [e]), /Außenrotation am Kabel 5 kg: 15/);
  assert.match(exportCsv(zustand), /aussenrotation-kabel,Außenrotation am Kabel,gewicht_wdh,1,5,15/);
  assert.ok(JSON.parse(exportJson(zustand, { jetzt: am('2026-10-30'), appVersion: 't' })).einheiten[0].uebungen.some((x) => x.uebung === 'aussenrotation-kabel'));
  assert.equal(letzteWerte([e], 'aussenrotation-kabel').saetze[0].kg, 5);
});

test('l) Übung mit Historie lässt sich nicht löschen (nur archivieren); ohne Historie und Programm schon', () => {
  assert.match(loescheUebung(P, 'plank', true).fehler, /Archivieren/);
  assert.match(loescheUebung(P, 'plank', false).fehler, /steht noch in einem Programm/);
  const { programm, id } = mitNeuerUebung(P, 'Testübung');
  assert.equal(uebungNach(loescheUebung(programm, id, false).programm, id), null);
});

test('l) fehlt eine Übung mit Historie im Katalog (z. B. im Repo gelöscht), kommt sie archiviert zurück', () => {
  const e = einheitMit(P, 'a', '2026-10-29', { plank: [{ s: 40 }] });
  const ohne = structuredClone(P);
  ohne.uebungen = ohne.uebungen.filter((x) => x.id !== 'plank');
  ohne.programme[0].plaetze.pop();
  const r = sichereHistorie(ohne, [e], P.uebungen);
  assert.deepEqual(r.ergaenzt, ['plank']);
  assert.equal(uebungNach(r.programm, 'plank').archiviert, true);
  assert.equal(uebungNach(r.programm, 'plank').messart, 'zeit');
});
