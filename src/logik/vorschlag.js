// Gewichtsvorschlag nach Mirkos Steigerungsregel und Vorbelegung der Eingabe.
//
// Regel: Erhöht wird erst, wenn in der letzten Einheit dieser Übung (bzw. Variante)
// alle Sätze das obere Ende der Wiederholungsspanne geschafft haben – dann um die
// Schrittgröße der Übung. Sonst bleibt das Gewicht. Ohne Historie: „Gewicht suchen“.
// Ein Satz mit weniger Gewicht als dem höchsten zählt als nicht geschafft
// (wer abspecken musste, hat das Gewicht noch nicht im Griff).

import { messart, runde } from './messarten.js';

// Die neueste Einheit (außer `ausserEinheitId`), in der die Übung mindestens einen Satz hat.
export function letzteWerte(einheiten, uebungId, ausserEinheitId = null) {
  let bester = null;
  for (const e of einheiten) {
    if (e.geloescht || e.id === ausserEinheitId) continue;
    const saetze = e.uebungen.filter((u) => u.uebung === uebungId).flatMap((u) => u.saetze);
    if (!saetze.length) continue;
    if (!bester || e.begonnen > bester.einheit.begonnen) bester = { einheit: e, saetze };
  }
  return bester ? { datum: bester.einheit.datum, einheitId: bester.einheit.id, saetze: bester.saetze } : null;
}

// Ergebnis:
//   null                                   Messart ohne Vorschlag (nur letzter Wert)
//   { art: 'suchen' }                      keine Historie
//   { art: 'hoeher', kg, basis, oben }     alle Sätze oben → +Schritt
//   { art: 'gleich', kg, basis, oben, fehlt }  sonst; fehlt = Anzahl Sätze unter dem oberen Ende
export function gewichtsVorschlag(uebung, letzte) {
  if (!messart(uebung?.messart)?.vorschlag) return null;
  const saetze = (letzte?.saetze ?? []).filter((s) => Number.isFinite(s.kg) && Number.isFinite(s.wdh));
  if (!saetze.length) return { art: 'suchen' };
  const basis = Math.max(...saetze.map((s) => s.kg));
  const oben = Array.isArray(uebung.spanne) ? uebung.spanne[1] : null;
  const fehlt = oben == null ? saetze.length : saetze.filter((s) => s.kg !== basis || s.wdh < oben).length;
  if (oben != null && fehlt === 0 && uebung.schritt > 0) {
    return { art: 'hoeher', kg: runde(basis + uebung.schritt), basis, oben, schritt: uebung.schritt };
  }
  return { art: 'gleich', kg: basis, basis, oben, fehlt };
}

// Vorbelegung für Satz `index` (0-basiert):
//   Gewicht:   heute schon geändert → das von heute; sonst der Vorschlag.
//   Übrige Felder: derselbe Satz vom letzten Mal; gab es ihn nicht, der letzte Satz vom letzten Mal.
//   Ohne Historie bleibt Satz 1 leer; ab Satz 2 gilt der vorige Satz von heute.
export function vorbelegung(uebung, letzte, vorschlag, heute, index) {
  const art = messart(uebung.messart);
  const vorher = letzte?.saetze ?? [];
  const gleicherSatz = vorher[index] ?? vorher[vorher.length - 1] ?? null;
  const heuteVorher = heute[Math.min(index, heute.length) - 1] ?? null;
  const werte = {};
  for (const feld of art.felder) {
    if (feld.id === 'kg') werte.kg = heuteVorher?.kg ?? vorschlag?.kg ?? null;
    else werte[feld.id] = gleicherSatz?.[feld.id] ?? heuteVorher?.[feld.id] ?? null;
  }
  return werte;
}
