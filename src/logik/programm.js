// Programm: Übungskatalog, Programme, Rotation und Phasen – so, wie sie in programm.json stehen.
// Alles hier ist rein (keine Speicherzugriffe, kein DOM) und gibt bei Änderungen Kopien zurück.

import { MESSARTEN, STANDARD_MESSART, messart } from './messarten.js';
import { istDatum } from './zeit.js';

export const PROGRAMM_FORMAT = 1;

export function uebungNach(programm, id) {
  return programm.uebungen.find((u) => u.id === id) ?? null;
}

export function programmNach(programm, id) {
  return programm.programme.find((p) => p.id === id) ?? null;
}

// Die Plätze (Übungen in Reihenfolge) eines Programms. Ein Programm mit "auszug"
// übernimmt die ersten n Plätze eines anderen, ändert sich also mit diesem mit.
export function plaetzeVon(programm, programmId, tiefe = 0) {
  const p = programmNach(programm, programmId);
  if (!p || tiefe > 5) return [];
  if (p.auszug) return plaetzeVon(programm, p.auszug.programm, tiefe + 1).slice(0, p.auszug.anzahl);
  return (p.plaetze ?? []).map((pl) => structuredClone(pl));
}

export function zaehltAls(programm, programmId) {
  return programmNach(programm, programmId)?.zaehltAls ?? programmId;
}

export function platzName(programm, platz) {
  if (platz.name) return platz.name;
  return uebungNach(programm, platz.varianten[0])?.name ?? platz.varianten[0];
}

// Aktiv ist die Phase mit dem spätesten Startdatum, das nicht nach `datum` liegt.
// Phasen ohne Datum ("ab": null) sind vorbereitet, aber nie aktiv.
export function aktivePhase(programm, datum) {
  let aktiv = null;
  for (const phase of programm.phasen ?? []) {
    if (!phase.ab || phase.ab > datum) continue;
    if (!aktiv || phase.ab >= aktiv.ab) aktiv = phase;
  }
  return aktiv;
}

const STANDARD_VORGABE = { saetze: 3, reserve: null };

// Satzzahl und Reserve für eine Übung: Platz-Angabe vor Phasen-Vorgabe der Rolle vor Standard.
export function vorgabeFuer(phase, uebung, platz = null) {
  const ausPhase = phase?.vorgaben?.[uebung?.rolle] ?? STANDARD_VORGABE;
  return {
    saetze: platz?.saetze ?? ausPhase.saetze ?? STANDARD_VORGABE.saetze,
    reserve: platz?.reserve ?? ausPhase.reserve ?? null,
    spanne: Array.isArray(uebung?.spanne) ? [...uebung.spanne] : null,
  };
}

function zaehlt(einheit) {
  return !einheit.geloescht && einheit.beendet && einheit.uebungen.some((u) => u.saetze.length > 0);
}

// Welches Programm ist als Nächstes dran? Maßgeblich ist die letzte beendete Einheit,
// deren Programm (oder "zaehltAls") in der Rotation steht – Tage dürfen sich verschieben.
export function naechstesProgramm(programm, einheiten) {
  const rotation = (programm.rotation ?? []).filter((id) => programmNach(programm, id));
  if (!rotation.length) return programm.programme[0]?.id ?? null;
  const fertige = einheiten.filter(zaehlt).sort((a, b) => (a.begonnen < b.begonnen ? 1 : -1));
  for (const e of fertige) {
    const i = rotation.indexOf(e.zaehltAls ?? e.programm);
    if (i >= 0) return rotation[(i + 1) % rotation.length];
  }
  return rotation[0];
}

export function letzteEinheit(einheiten) {
  return einheiten.filter(zaehlt).sort((a, b) => (a.begonnen < b.begonnen ? 1 : -1))[0] ?? null;
}

export function rollenVon(programm) {
  const namen = { ...(programm.rollen ?? {}) };
  for (const u of programm.uebungen) if (u.rolle && !namen[u.rolle]) namen[u.rolle] = u.rolle;
  return Object.entries(namen).map(([id, name]) => ({ id, name }));
}

export function rollenName(programm, rolle) {
  return programm.rollen?.[rolle] ?? rolle ?? '';
}

// ---------- Prüfen ----------

const ID_MUSTER = /^[a-z0-9][a-z0-9-]*$/;

// Liefert eine Liste lesbarer Fehler; leer heißt gültig.
export function pruefeProgramm(p) {
  const fehler = [];
  if (!p || typeof p !== 'object') return ['Die Datei enthält kein JSON-Objekt.'];
  if (p.format !== PROGRAMM_FORMAT) fehler.push(`„format“ muss ${PROGRAMM_FORMAT} sein.`);
  if (!Array.isArray(p.uebungen)) fehler.push('„uebungen“ fehlt oder ist keine Liste.');
  if (!Array.isArray(p.programme)) fehler.push('„programme“ fehlt oder ist keine Liste.');
  if (fehler.length) return fehler;

  const uebungIds = new Set();
  p.uebungen.forEach((u, i) => {
    const wo = `Übung ${i + 1}${u?.id ? ` („${u.id}“)` : ''}`;
    if (typeof u?.id !== 'string' || !ID_MUSTER.test(u.id)) fehler.push(`${wo}: „id“ muss aus Kleinbuchstaben, Ziffern und „-“ bestehen.`);
    else if (uebungIds.has(u.id)) fehler.push(`${wo}: „id“ kommt doppelt vor.`);
    uebungIds.add(u?.id);
    if (typeof u?.name !== 'string' || !u.name.trim()) fehler.push(`${wo}: „name“ fehlt.`);
    if (!messart(u?.messart)) fehler.push(`${wo}: Messart „${u?.messart}“ unbekannt (erlaubt: ${Object.keys(MESSARTEN).join(', ')}).`);
    if (u?.spanne != null && !(Array.isArray(u.spanne) && u.spanne.length === 2 && u.spanne.every((x) => typeof x === 'number' && x > 0) && u.spanne[0] <= u.spanne[1])) {
      fehler.push(`${wo}: „spanne“ muss [von, bis] mit von ≤ bis sein oder null.`);
    }
    if (u?.schritt != null && !(typeof u.schritt === 'number' && u.schritt > 0)) fehler.push(`${wo}: „schritt“ muss eine Zahl > 0 oder null sein.`);
    if (u?.rolle != null && typeof u.rolle !== 'string') fehler.push(`${wo}: „rolle“ muss Text sein.`);
  });

  const programmIds = new Set(p.programme.map((x) => x?.id));
  const gesehen = new Set();
  p.programme.forEach((pr, i) => {
    const wo = `Programm ${i + 1}${pr?.id ? ` („${pr.id}“)` : ''}`;
    if (typeof pr?.id !== 'string' || !ID_MUSTER.test(pr.id)) fehler.push(`${wo}: „id“ muss aus Kleinbuchstaben, Ziffern und „-“ bestehen.`);
    else if (gesehen.has(pr.id)) fehler.push(`${wo}: „id“ kommt doppelt vor.`);
    gesehen.add(pr?.id);
    if (typeof pr?.name !== 'string' || !pr.name.trim()) fehler.push(`${wo}: „name“ fehlt.`);
    if (pr?.zaehltAls != null && !programmIds.has(pr.zaehltAls)) fehler.push(`${wo}: „zaehltAls“ verweist auf unbekanntes Programm „${pr.zaehltAls}“.`);
    if (pr?.auszug) {
      if (!programmIds.has(pr.auszug.programm) || pr.auszug.programm === pr.id) fehler.push(`${wo}: „auszug.programm“ verweist auf kein anderes Programm.`);
      if (!Number.isInteger(pr.auszug.anzahl) || pr.auszug.anzahl < 1) fehler.push(`${wo}: „auszug.anzahl“ muss eine ganze Zahl ≥ 1 sein.`);
    } else if (!Array.isArray(pr?.plaetze)) {
      fehler.push(`${wo}: braucht „plaetze“ oder „auszug“.`);
    } else {
      pr.plaetze.forEach((pl, j) => {
        if (!Array.isArray(pl?.varianten) || !pl.varianten.length) fehler.push(`${wo}, Platz ${j + 1}: „varianten“ ist leer.`);
        else for (const v of pl.varianten) if (!uebungIds.has(v)) fehler.push(`${wo}, Platz ${j + 1}: Übung „${v}“ steht nicht im Katalog.`);
        if (pl?.saetze != null && !(Number.isInteger(pl.saetze) && pl.saetze >= 1)) fehler.push(`${wo}, Platz ${j + 1}: „saetze“ muss eine ganze Zahl ≥ 1 sein.`);
      });
    }
  });
  for (const pr of p.programme) {
    if (pr?.auszug && programmNach(p, pr.auszug.programm)?.auszug) fehler.push(`Programm „${pr.id}“: Auszug aus einem Auszug ist nicht erlaubt.`);
  }

  if (!Array.isArray(p.rotation)) fehler.push('„rotation“ fehlt oder ist keine Liste.');
  else {
    for (const id of p.rotation) if (!programmIds.has(id)) fehler.push(`Rotation: Programm „${id}“ unbekannt.`);
    if (new Set(p.rotation).size !== p.rotation.length) fehler.push('Rotation: ein Programm steht doppelt drin.');
  }

  if (!Array.isArray(p.phasen)) fehler.push('„phasen“ fehlt oder ist keine Liste.');
  else {
    const phasenIds = new Set();
    p.phasen.forEach((ph, i) => {
      const wo = `Phase ${i + 1}${ph?.id ? ` („${ph.id}“)` : ''}`;
      if (typeof ph?.id !== 'string' || !ID_MUSTER.test(ph.id)) fehler.push(`${wo}: „id“ muss aus Kleinbuchstaben, Ziffern und „-“ bestehen.`);
      else if (phasenIds.has(ph.id)) fehler.push(`${wo}: „id“ kommt doppelt vor.`);
      phasenIds.add(ph?.id);
      if (ph?.ab != null && !istDatum(ph.ab)) fehler.push(`${wo}: „ab“ muss JJJJ-MM-TT oder null sein.`);
      if (!ph?.vorgaben || typeof ph.vorgaben !== 'object') fehler.push(`${wo}: „vorgaben“ fehlt.`);
      else {
        for (const [rolle, v] of Object.entries(ph.vorgaben)) {
          if (!Number.isInteger(v?.saetze) || v.saetze < 1) fehler.push(`${wo}, ${rolle}: „saetze“ muss eine ganze Zahl ≥ 1 sein.`);
          if (v?.reserve != null && typeof v.reserve !== 'string') fehler.push(`${wo}, ${rolle}: „reserve“ muss Text sein, z. B. "2" oder "1–2".`);
        }
      }
    });
  }
  return fehler;
}

// ---------- Katalog ----------

export function slug(name) {
  const s = name
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'uebung';
}

export function freieId(vorhandene, basis) {
  const ids = new Set(vorhandene);
  if (!ids.has(basis)) return basis;
  for (let n = 2; ; n++) if (!ids.has(`${basis}-${n}`)) return `${basis}-${n}`;
}

// Standardwerte für eine im Gym neu angelegte Übung: häufigster Fall (Gerät oder Kabel),
// Ergänzungs-Spanne, kleiner Schritt. Alles lässt sich später in „Programm“ ändern.
export const NEUE_UEBUNG = { messart: STANDARD_MESSART, spanne: [10, 15], schritt: 2.5, rolle: 'zusatz' };

export function mitNeuerUebung(programm, name, werte = {}) {
  const sauber = name.trim().replace(/\s+/g, ' ');
  const id = freieId(programm.uebungen.map((u) => u.id), slug(sauber));
  const uebung = { id, name: sauber, ...structuredClone(NEUE_UEBUNG), ...werte };
  if (!messart(uebung.messart)?.vorschlag) uebung.schritt = null;
  return { programm: { ...programm, uebungen: [...programm.uebungen, uebung] }, id };
}

// Übungen mit Historie dürfen nie aus dem Katalog verschwinden, sonst hängen alte Sätze
// ohne Namen und Messart in der Luft. Fehlt eine (z. B. im Repo gelöscht), kommt sie
// archiviert zurück – aus dem alten Katalog oder aus den Angaben in der Einheit.
export function sichereHistorie(programm, einheiten, alterKatalog = []) {
  const vorhanden = new Set(programm.uebungen.map((u) => u.id));
  const ergaenzt = [];
  for (const e of einheiten) {
    if (e.geloescht) continue;
    for (const eintrag of e.uebungen) {
      if (vorhanden.has(eintrag.uebung) || !eintrag.saetze.length) continue;
      const alt = alterKatalog.find((u) => u.id === eintrag.uebung);
      ergaenzt.push({
        ...(alt ? structuredClone(alt) : { id: eintrag.uebung, name: eintrag.name, messart: eintrag.messart, spanne: eintrag.vorgabe?.spanne ?? null, schritt: null, rolle: 'zusatz' }),
        archiviert: true,
      });
      vorhanden.add(eintrag.uebung);
    }
  }
  if (!ergaenzt.length) return { programm, ergaenzt: [] };
  return { programm: { ...programm, uebungen: [...programm.uebungen, ...ergaenzt] }, ergaenzt: ergaenzt.map((u) => u.id) };
}

export function wirdVerwendet(programm, uebungId) {
  return programm.programme.some((p) => (p.plaetze ?? []).some((pl) => pl.varianten.includes(uebungId)));
}

// Feste Schreibweise, damit gleiche Inhalte gleiche Dateien (und gleiche Git-SHAs) ergeben.
export function programmText(programm) {
  return `${JSON.stringify(programm, null, 2)}\n`;
}
