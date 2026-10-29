// Eine Trainingseinheit: starten, Sätze eintragen und korrigieren, Übungen nur für heute
// ersetzen oder auslassen, beenden. Alle Funktionen sind rein und geben eine neue Einheit zurück.
//
// Eine Einheit hält für jede Übung einen Schnappschuss (Name, Messart, Vorgabe), damit die
// Daten auch dann lesbar bleiben, wenn das Programm später geändert wird.

import { aktivePhase, plaetzeVon, programmNach, uebungNach, vorgabeFuer, zaehltAls } from './programm.js';
import { lokalesDatum } from './zeit.js';

const iso = (jetzt) => jetzt.toISOString();

export function neueEinheitId(jetzt, programmId, zufall = Math.random) {
  const zeit = `${lokalesDatum(jetzt)}-${String(jetzt.getHours()).padStart(2, '0')}${String(jetzt.getMinutes()).padStart(2, '0')}`;
  return `${zeit}-${programmId}-${Math.floor(zufall() * 36 ** 4).toString(36).padStart(4, '0')}`;
}

// Standardvariante eines Platzes: die zuletzt trainierte, sonst die erste.
export function standardVariante(varianten, einheiten) {
  let beste = null;
  let zeit = '';
  for (const e of einheiten) {
    if (e.geloescht) continue;
    for (const u of e.uebungen) {
      if (!varianten.includes(u.uebung) || !u.saetze.length) continue;
      const t = u.saetze[u.saetze.length - 1].t ?? e.begonnen;
      if (t > zeit) { zeit = t; beste = u.uebung; }
    }
  }
  return beste ?? varianten[0];
}

function eintrag(programm, phase, uebungId, extra) {
  const u = uebungNach(programm, uebungId);
  return {
    uebung: uebungId,
    name: u?.name ?? uebungId,
    messart: u?.messart ?? 'gewicht_wdh',
    platz: null,
    platzName: null,
    varianten: [uebungId],
    ersetzt: null,
    ausgelassen: false,
    vorgabe: vorgabeFuer(phase, u, extra.platzObjekt),
    saetze: [],
    ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'platzObjekt')),
  };
}

export function starteEinheit(programm, programmId, einheiten, jetzt) {
  const p = programmNach(programm, programmId);
  if (!p) throw new Error(`Programm „${programmId}“ gibt es nicht.`);
  const datum = lokalesDatum(jetzt);
  const phase = aktivePhase(programm, datum);
  const uebungen = plaetzeVon(programm, programmId).map((platz, i) =>
    eintrag(programm, phase, standardVariante(platz.varianten, einheiten), {
      platz: i,
      platzName: platz.name ?? null,
      varianten: [...platz.varianten],
      platzObjekt: platz,
    }),
  );
  return {
    id: neueEinheitId(jetzt, programmId),
    programm: programmId,
    programmName: p.name,
    zaehltAls: zaehltAls(programm, programmId),
    datum,
    begonnen: iso(jetzt),
    beendet: null,
    aktualisiert: iso(jetzt),
    phase: phase?.id ?? null,
    uebungen,
  };
}

function mitEintrag(einheit, i, aenderung, jetzt) {
  const uebungen = einheit.uebungen.map((u, j) => (j === i ? aenderung(u) : u));
  return { ...einheit, uebungen, aktualisiert: iso(jetzt) };
}

function phaseDer(programm, einheit) {
  return programm.phasen.find((p) => p.id === einheit.phase) ?? aktivePhase(programm, einheit.datum);
}

// Variante wechseln (eine andere Übung desselben Platzes). Nur solange noch kein Satz eingetragen ist.
export function waehleVariante(programm, einheit, i, uebungId, jetzt) {
  const alt = einheit.uebungen[i];
  if (alt.saetze.length || !alt.varianten.includes(uebungId)) return einheit;
  const neu = eintrag(programm, phaseDer(programm, einheit), uebungId, {
    platz: alt.platz, platzName: alt.platzName, varianten: alt.varianten, ersetzt: alt.ersetzt,
  });
  neu.vorgabe.saetze = alt.vorgabe.saetze;
  return mitEintrag(einheit, i, () => neu, jetzt);
}

// Übung nur für heute ersetzen. Das Programm bleibt unberührt.
// Hat die Übung schon Sätze, bleiben sie stehen und der Ersatz kommt direkt dahinter.
export function ersetzeHeute(programm, einheit, i, uebungId, jetzt) {
  const alt = einheit.uebungen[i];
  const neu = eintrag(programm, phaseDer(programm, einheit), uebungId, {
    platz: alt.platz, platzName: alt.platzName, ersetzt: alt.ersetzt ?? alt.uebung,
  });
  const uebungen = [...einheit.uebungen];
  if (alt.saetze.length) uebungen.splice(i + 1, 0, neu);
  else uebungen[i] = neu;
  return { einheit: { ...einheit, uebungen, aktualisiert: iso(jetzt) }, index: alt.saetze.length ? i + 1 : i };
}

export function lasseAus(einheit, i, jetzt) {
  return mitEintrag(einheit, i, (u) => ({ ...u, ausgelassen: true }), jetzt);
}

export function nimmWiederAuf(einheit, i, jetzt) {
  return mitEintrag(einheit, i, (u) => ({ ...u, ausgelassen: false }), jetzt);
}

export function speichereSatz(einheit, i, werte, jetzt) {
  return mitEintrag(einheit, i, (u) => ({ ...u, ausgelassen: false, saetze: [...u.saetze, { ...werte, t: iso(jetzt) }] }), jetzt);
}

export function aendereSatz(einheit, i, j, werte, jetzt) {
  return mitEintrag(einheit, i, (u) => ({ ...u, saetze: u.saetze.map((s, k) => (k === j ? { ...s, ...werte } : s)) }), jetzt);
}

export function loescheSatz(einheit, i, j, jetzt) {
  return mitEintrag(einheit, i, (u) => ({ ...u, saetze: u.saetze.filter((_, k) => k !== j) }), jetzt);
}

export function fuegeSatzEin(einheit, i, j, satz, jetzt) {
  return mitEintrag(einheit, i, (u) => {
    const saetze = [...u.saetze];
    saetze.splice(j, 0, satz);
    return { ...u, saetze };
  }, jetzt);
}

export function hatSaetze(einheit) {
  return einheit.uebungen.some((u) => u.saetze.length > 0);
}

export function beende(einheit, jetzt) {
  return { ...einheit, beendet: iso(jetzt), aktualisiert: iso(jetzt) };
}

export function oeffneWieder(einheit, jetzt) {
  return { ...einheit, beendet: null, aktualisiert: iso(jetzt) };
}

// Gelöschte Einheiten bleiben als Grabstein stehen, damit der Sync die Löschung weitergibt.
export function verwerfe(einheit, jetzt) {
  return { id: einheit.id, programm: einheit.programm, datum: einheit.datum, begonnen: einheit.begonnen, beendet: einheit.beendet, aktualisiert: iso(jetzt), geloescht: true, uebungen: [] };
}

export function istErledigt(u) {
  return u.ausgelassen || u.saetze.length >= u.vorgabe.saetze;
}

// Die nächste Übung, die noch Sätze braucht – erst ab `ab`, dann von vorn.
export function naechsteOffene(einheit, ab = 0) {
  const n = einheit.uebungen.length;
  for (let k = 0; k < n; k++) {
    const i = (ab + k) % n;
    if (!istErledigt(einheit.uebungen[i])) return i;
  }
  return -1;
}

export function letzteAktivitaet(einheit) {
  let t = einheit.begonnen;
  for (const u of einheit.uebungen) for (const s of u.saetze) if (s.t > t) t = s.t;
  return t;
}

// Offene Einheiten, die seit `stunden` ruhen, gelten als vergessen und werden beendet
// (mit dem Zeitpunkt des letzten Satzes). Leere werden verworfen.
export function beendeVergessene(einheiten, jetzt, stunden = 6) {
  const grenze = new Date(jetzt.getTime() - stunden * 3600000).toISOString();
  const beendet = [];
  const neu = einheiten.map((e) => {
    if (e.geloescht || e.beendet) return e;
    const zuletzt = letzteAktivitaet(e);
    if (zuletzt > grenze) return e;
    beendet.push(e.id);
    if (!hatSaetze(e)) return verwerfe(e, jetzt);
    return { ...e, beendet: zuletzt, aktualisiert: iso(jetzt) };
  });
  return { einheiten: neu, beendet };
}

export function offeneEinheit(einheiten) {
  return einheiten.find((e) => !e.geloescht && !e.beendet) ?? null;
}
