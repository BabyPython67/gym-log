// Gemeinsame Testdaten: Startinhalt laden und Einheiten schnell zusammenbauen.

import { readFileSync } from 'node:fs';
import { leseProgramm } from '../../src/logik/datenformat.js';
import { beende, speichereSatz, starteEinheit } from '../../src/logik/einheit.js';

export const START_TEXT = readFileSync(new URL('../../startinhalt/programm.json', import.meta.url), 'utf8');
export const startProgramm = () => leseProgramm(START_TEXT);

// Ortszeit Köln (Tests laufen mit TZ=Europe/Berlin)
export const am = (datum, zeit = '18:00') => new Date(`${datum}T${zeit}:00`);

// Eine beendete Einheit; saetze: { uebungId: [{ kg, wdh }, …] }
export function einheitMit(programm, programmId, datum, saetze, einheiten = [], zeit = '18:00') {
  let e = starteEinheit(programm, programmId, einheiten, am(datum, zeit));
  let minute = 1;
  for (const [uebungId, liste] of Object.entries(saetze)) {
    let i = e.uebungen.findIndex((u) => u.uebung === uebungId);
    if (i < 0) {
      // Variante wählen, falls die Übung in einem Platz als Variante steht
      i = e.uebungen.findIndex((u) => u.varianten.includes(uebungId));
      if (i < 0) throw new Error(`Übung ${uebungId} nicht in ${programmId}`);
      e.uebungen[i] = { ...e.uebungen[i], uebung: uebungId, name: programm.uebungen.find((u) => u.id === uebungId).name, messart: programm.uebungen.find((u) => u.id === uebungId).messart };
    }
    for (const werte of liste) e = speichereSatz(e, i, werte, am(datum, `18:${String(minute++).padStart(2, '0')}`));
  }
  return beende(e, am(datum, '19:00'));
}
