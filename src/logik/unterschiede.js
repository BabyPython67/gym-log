// Lesbare Unterschiede zwischen zwei Fassungen von programm.json – für die Konfliktansicht.

import { messart, spanneAlsText } from './messarten.js';

const FELDNAMEN = { name: 'Name', messart: 'Messart', spanne: 'Spanne', schritt: 'Schritt', rolle: 'Rolle', hinweis: 'Hinweis', archiviert: 'archiviert', titel: 'Titel', zaehltAls: 'zählt als', auszug: 'Auszug', plaetze: 'Übungen' };

const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function wert(feld, v, u, p) {
  if (v === undefined || v === null || v === '') return '–';
  if (feld === 'messart') return messart(v)?.name ?? v;
  if (feld === 'spanne') return spanneAlsText({ ...u, spanne: v }) || v.join('–');
  if (feld === 'schritt') return `${String(v).replace('.', ',')} kg`;
  if (feld === 'archiviert') return v ? 'ja' : 'nein';
  if (feld === 'plaetze') return v.map((pl) => pl.name ?? pl.varianten.map((id) => p.uebungen.find((x) => x.id === id)?.name ?? id).join('/')).join(', ') || 'keine';
  if (feld === 'auszug') return `erste ${v.anzahl} von ${p.programme.find((x) => x.id === v.programm)?.name ?? v.programm}`;
  return String(v);
}

function felderVergleichen(art, name, a, b, felder, alt, neu) {
  const zeilen = [];
  for (const f of felder) {
    if (!gleich(a[f], b[f])) zeilen.push(`${art} „${name}“: ${FELDNAMEN[f] ?? f} ${wert(f, a[f], a, alt)} → ${wert(f, b[f], b, neu)}`);
  }
  return zeilen;
}

function nachId(liste) {
  return new Map((liste ?? []).map((x) => [x.id, x]));
}

export function programmUnterschiede(alt, neu) {
  const zeilen = [];
  const ua = nachId(alt.uebungen);
  const ub = nachId(neu.uebungen);
  for (const [id, u] of ub) if (!ua.has(id)) zeilen.push(`Übung „${u.name}“ neu`);
  for (const [id, u] of ua) if (!ub.has(id)) zeilen.push(`Übung „${u.name}“ entfernt`);
  for (const [id, a] of ua) if (ub.has(id)) zeilen.push(...felderVergleichen('Übung', a.name, a, ub.get(id), ['name', 'messart', 'spanne', 'schritt', 'rolle', 'hinweis', 'archiviert'], alt, neu));

  const pa = nachId(alt.programme);
  const pb = nachId(neu.programme);
  for (const [id, p] of pb) if (!pa.has(id)) zeilen.push(`Programm „${p.name}“ neu: ${p.auszug ? wert('auszug', p.auszug, p, neu) : wert('plaetze', p.plaetze, p, neu)}`);
  for (const [id, p] of pa) if (!pb.has(id)) zeilen.push(`Programm „${p.name}“ entfernt`);
  for (const [id, a] of pa) if (pb.has(id)) zeilen.push(...felderVergleichen('Programm', a.name, a, pb.get(id), ['name', 'titel', 'zaehltAls', 'auszug', 'plaetze'], alt, neu));

  if (!gleich(alt.rotation, neu.rotation)) {
    const namen = (r, p) => r.map((id) => p.programme.find((x) => x.id === id)?.name ?? id).join(' → ') || 'leer';
    zeilen.push(`Rotation: ${namen(alt.rotation, alt)} → ${namen(neu.rotation, neu)}`);
  }

  const ha = nachId(alt.phasen);
  const hb = nachId(neu.phasen);
  for (const [id, h] of hb) if (!ha.has(id)) zeilen.push(`Phase „${h.name}“ neu`);
  for (const [id, h] of ha) if (!hb.has(id)) zeilen.push(`Phase „${h.name}“ entfernt`);
  for (const [id, a] of ha) {
    const b = hb.get(id);
    if (!b) continue;
    if (a.name !== b.name) zeilen.push(`Phase „${a.name}“: Name → ${b.name}`);
    if (a.ab !== b.ab) zeilen.push(`Phase „${a.name}“: ab ${a.ab ?? 'ohne Datum'} → ${b.ab ?? 'ohne Datum'}`);
    for (const rolle of new Set([...Object.keys(a.vorgaben), ...Object.keys(b.vorgaben)])) {
      const va = a.vorgaben[rolle];
      const vb = b.vorgaben[rolle];
      if (gleich(va, vb)) continue;
      const t = (v) => (v ? `${v.saetze} Sätze${v.reserve ? `, Reserve ${v.reserve}` : ''}` : '–');
      zeilen.push(`Phase „${a.name}“, ${neu.rollen?.[rolle] ?? rolle}: ${t(va)} → ${t(vb)}`);
    }
  }
  if (!gleich(alt.rollen, neu.rollen)) zeilen.push('Rollen-Namen geändert');
  return zeilen;
}
