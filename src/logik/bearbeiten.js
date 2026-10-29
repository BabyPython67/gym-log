// Programm bearbeiten: Übungen, Plätze, Varianten, Programme, Rotation, Phasen.
// Jede Funktion gibt ein neues Programm zurück (oder { fehler } mit Begründung).

import { messart } from './messarten.js';
import { freieId, programmNach, slug, uebungNach, wirdVerwendet } from './programm.js';

const kopie = (p) => structuredClone(p);

function mitProgramm(p, programmId, aenderung) {
  const neu = kopie(p);
  const pr = neu.programme.find((x) => x.id === programmId);
  if (pr) aenderung(pr, neu);
  return neu;
}

// ---------- Katalog ----------

export function aendereUebung(p, id, felder) {
  const neu = kopie(p);
  const u = neu.uebungen.find((x) => x.id === id);
  if (!u) return neu;
  Object.assign(u, structuredClone(felder));
  if (typeof u.name === 'string') u.name = u.name.trim().replace(/\s+/g, ' ');
  if (messart(u.messart)?.vorschlag && !(u.schritt > 0)) u.schritt = 2.5;
  if (!u.hinweis) delete u.hinweis;
  if (!u.archiviert) delete u.archiviert;
  return neu;
}

export function loescheUebung(p, id, hatHistorie) {
  if (hatHistorie) return { fehler: 'Diese Übung hat Sätze in der Historie. Archivieren statt löschen – dann bleibt alles lesbar.' };
  if (wirdVerwendet(p, id)) return { fehler: 'Die Übung steht noch in einem Programm. Erst dort entfernen.' };
  const neu = kopie(p);
  neu.uebungen = neu.uebungen.filter((u) => u.id !== id);
  return { programm: neu };
}

// ---------- Programme ----------

export function neuesProgramm(p, name) {
  const sauber = name.trim().replace(/\s+/g, ' ');
  const id = freieId(p.programme.map((x) => x.id), slug(sauber));
  const neu = kopie(p);
  neu.programme.push({ id, name: sauber, plaetze: [] });
  return { programm: neu, id };
}

export function aendereProgramm(p, id, felder) {
  return mitProgramm(p, id, (pr) => {
    for (const [k, v] of Object.entries(felder)) {
      if (v === null || v === '') delete pr[k];
      else pr[k] = structuredClone(v);
    }
    if (pr.auszug) delete pr.plaetze;
    else if (!pr.plaetze) pr.plaetze = [];
  });
}

export function loescheProgramm(p, id) {
  const abhaengig = p.programme.filter((x) => x.id !== id && (x.auszug?.programm === id || x.zaehltAls === id));
  if (abhaengig.length) return { fehler: `${abhaengig.map((x) => x.name).join(', ')} hängt an diesem Programm. Erst dort ändern.` };
  if (p.programme.length <= 1) return { fehler: 'Das letzte Programm bleibt stehen.' };
  const neu = kopie(p);
  neu.programme = neu.programme.filter((x) => x.id !== id);
  neu.rotation = neu.rotation.filter((x) => x !== id);
  return { programm: neu };
}

// ---------- Plätze und Varianten ----------

export function fuegePlatzHinzu(p, programmId, uebungId) {
  return mitProgramm(p, programmId, (pr) => pr.plaetze?.push({ varianten: [uebungId] }));
}

export function entfernePlatz(p, programmId, i) {
  return mitProgramm(p, programmId, (pr) => pr.plaetze?.splice(i, 1));
}

export function verschiebePlatz(p, programmId, i, richtung) {
  return mitProgramm(p, programmId, (pr) => {
    const j = i + richtung;
    if (!pr.plaetze || j < 0 || j >= pr.plaetze.length) return;
    [pr.plaetze[i], pr.plaetze[j]] = [pr.plaetze[j], pr.plaetze[i]];
  });
}

export function aenderePlatz(p, programmId, i, felder) {
  return mitProgramm(p, programmId, (pr) => {
    const pl = pr.plaetze?.[i];
    if (!pl) return;
    for (const [k, v] of Object.entries(felder)) {
      if (v === null || v === '') delete pl[k];
      else pl[k] = v;
    }
  });
}

export function fuegeVarianteHinzu(p, programmId, i, uebungId) {
  return mitProgramm(p, programmId, (pr) => {
    const pl = pr.plaetze?.[i];
    if (pl && !pl.varianten.includes(uebungId)) pl.varianten.push(uebungId);
  });
}

export function entferneVariante(p, programmId, i, uebungId) {
  return mitProgramm(p, programmId, (pr) => {
    const pl = pr.plaetze?.[i];
    if (pl && pl.varianten.length > 1) pl.varianten = pl.varianten.filter((v) => v !== uebungId);
  });
}

// ---------- Rotation ----------

export function setzeRotation(p, ids) {
  const neu = kopie(p);
  neu.rotation = [...new Set(ids)].filter((id) => programmNach(p, id));
  return neu;
}

// ---------- Phasen ----------

export function aenderePhase(p, id, felder) {
  const neu = kopie(p);
  const ph = neu.phasen.find((x) => x.id === id);
  if (ph) Object.assign(ph, structuredClone(felder));
  return neu;
}

export function neuePhase(p, name) {
  const sauber = name.trim().replace(/\s+/g, ' ');
  const neu = kopie(p);
  const vorlage = neu.phasen[neu.phasen.length - 1]?.vorgaben ?? { grund: { saetze: 3, reserve: '2' }, zusatz: { saetze: 3, reserve: '2' } };
  const id = freieId(neu.phasen.map((x) => x.id), slug(sauber));
  neu.phasen.push({ id, name: sauber, ab: null, vorgaben: structuredClone(vorlage) });
  return { programm: neu, id };
}

export function loeschePhase(p, id) {
  const neu = kopie(p);
  neu.phasen = neu.phasen.filter((x) => x.id !== id);
  return neu;
}

export function uebungsName(p, id) {
  return uebungNach(p, id)?.name ?? id;
}
