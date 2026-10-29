// Lesbare Dateien im Daten-Repo: uebersicht.md (neueste Einheit zuerst) und stand.md.

import { messart, saetzeAlsText } from './messarten.js';
import { aktivePhase, letzteEinheit, naechstesProgramm, programmNach, rollenName, uebungNach } from './programm.js';
import { uhrzeit, zeitpunktText } from './zeit.js';

function anzeigeName(programm, uebungId, schnappschuss) {
  return uebungNach(programm, uebungId)?.name ?? schnappschuss ?? uebungId;
}

// „JJJJ-MM-TT · Programm · Übung 16 kg: 10, 10 · Übung: 45 s, 40 s · Übung ausgelassen“
export function einheitAlsZeile(programm, einheit) {
  const teile = [einheit.datum, einheit.programmName ?? einheit.programm];
  for (const u of einheit.uebungen) {
    let name = anzeigeName(programm, u.uebung, u.name);
    if (u.ersetzt) name += ` (statt ${anzeigeName(programm, u.ersetzt)})`;
    if (u.saetze.length) teile.push(`${name}${messart(u.messart)?.felder[0].id === 'kg' ? ' ' : ': '}${saetzeAlsText(u.messart, u.saetze)}`);
    else if (u.ausgelassen) teile.push(`${name} ausgelassen`);
  }
  return teile.join(' · ');
}

function gezeigte(einheiten) {
  return einheiten
    .filter((e) => !e.geloescht && e.beendet && e.uebungen.some((u) => u.saetze.length))
    .sort((a, b) => (a.begonnen < b.begonnen ? 1 : -1));
}

export function uebersichtText(programm, einheiten) {
  const zeilen = gezeigte(einheiten).map((e) => `- ${einheitAlsZeile(programm, e)}`);
  return [
    '# Gym – Übersicht',
    '',
    'Neueste Einheit zuerst. Geschrieben von gym-log; nicht von Hand ändern (wird bei jedem Sync neu erzeugt).',
    'Rohdaten: `einheiten/JJJJ.json` · Programm: `programm.json` · Format: README von gym-log.',
    '',
    ...(zeilen.length ? zeilen : ['Noch keine Einheit.']),
    '',
  ].join('\n');
}

function vorgabenText(programm, phase) {
  return Object.entries(phase.vorgaben)
    .map(([rolle, v]) => `${rollenName(programm, rolle)}: ${v.saetze} Sätze${v.reserve ? `, Reserve ${v.reserve}` : ''}`)
    .join(' · ');
}

export function standText(programm, einheiten, { jetzt, appVersion, datum }) {
  const letzte = letzteEinheit(einheiten);
  const naechstes = programmNach(programm, naechstesProgramm(programm, einheiten));
  const phase = aktivePhase(programm, datum);
  const anzahl = gezeigte(einheiten).length;
  return [
    '# Stand gym-log',
    '',
    `- Letzter erfolgreicher Sync: ${zeitpunktText(jetzt.toISOString())}`,
    `- Letzte Einheit: ${letzte ? `${letzte.datum} · ${letzte.programmName ?? letzte.programm} (beendet ${uhrzeit(letzte.beendet)} Uhr)` : 'noch keine'}`,
    `- Einheiten insgesamt: ${anzahl}`,
    `- Als Nächstes laut Rotation: ${naechstes ? naechstes.name : '–'}`,
    `- Aktuelle Phase: ${phase ? `${phase.name} (seit ${phase.ab}) – ${vorgabenText(programm, phase)}` : 'keine (kein Startdatum erreicht)'}`,
    `- App-Version: ${appVersion}`,
    '',
  ].join('\n');
}
