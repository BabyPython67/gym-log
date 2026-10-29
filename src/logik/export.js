// Export in offenen Formaten (JSON mit allem, CSV mit einem Satz pro Zeile) und Import
// der JSON-Datei – für den Fall ohne Token oder als zusätzliche Sicherung.
// Der Token ist nie Teil des Exports: er liegt getrennt in den Einstellungen.

import { fuehreZusammen, jsonText, sortiereEinheiten } from './datenformat.js';
import { MESSARTEN } from './messarten.js';
import { pruefeProgramm, uebungNach } from './programm.js';

export const EXPORT_ART = 'gym-log-export';

export function exportJson(zustand, { jetzt, appVersion }) {
  return jsonText({
    format: 1,
    art: EXPORT_ART,
    exportiert: jetzt.toISOString(),
    appVersion,
    programm: zustand.programm,
    einheiten: sortiereEinheiten(zustand.einheiten.filter((e) => !e.geloescht)),
  });
}

const FELDER = [...new Set(Object.values(MESSARTEN).flatMap((m) => m.felder.map((f) => f.id)))];

function csvFeld(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportCsv(zustand) {
  const kopf = ['datum', 'programm', 'uebung_id', 'uebung', 'messart', 'satz', ...FELDER, 'zeitpunkt', 'statt', 'einheit_id'];
  const zeilen = [kopf.join(',')];
  for (const e of sortiereEinheiten(zustand.einheiten.filter((x) => !x.geloescht))) {
    for (const u of e.uebungen) {
      const name = uebungNach(zustand.programm, u.uebung)?.name ?? u.name;
      u.saetze.forEach((s, i) => {
        zeilen.push([e.datum, e.programmName ?? e.programm, u.uebung, name, u.messart, i + 1, ...FELDER.map((f) => s[f]), s.t, u.ersetzt ?? '', e.id].map(csvFeld).join(','));
      });
    }
  }
  return `${zeilen.join('\r\n')}\r\n`;
}

export function exportDateiname(endung, jetzt) {
  return `gym-log-${jetzt.toISOString().slice(0, 10)}.${endung}`;
}

// Liefert { zustand, neu, programmUebernommen } oder wirft mit lesbarer Meldung.
export function importiere(zustand, text) {
  let d;
  try {
    d = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist kein JSON.');
  }
  if (d?.art !== EXPORT_ART || !Array.isArray(d.einheiten)) throw new Error('Das ist keine Export-Datei von gym-log.');
  const vorher = new Set(zustand.einheiten.map((e) => e.id));
  const einheiten = fuehreZusammen(zustand.einheiten, d.einheiten);
  let { programm, programmGeaendert } = zustand;
  let programmUebernommen = false;
  if (d.programm && !pruefeProgramm(d.programm).length && !zustand.programmGeaendert && jsonText(d.programm) !== jsonText(programm)) {
    programm = d.programm;
    programmGeaendert = true; // beim nächsten Sync mit dem Repo abgleichen statt still zu übernehmen
    programmUebernommen = true;
  }
  return { zustand: { ...zustand, einheiten, programm, programmGeaendert }, neu: einheiten.filter((e) => !vorher.has(e.id)).length, programmUebernommen };
}
