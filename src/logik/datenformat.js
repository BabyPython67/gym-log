// Datenformat: Versionsnummern, Migrationen und die Dateien im Daten-Repo.
//
// Jede Datei trägt "format". Ändert sich ein Format, wird die Konstante erhöht und eine
// Migration "von n auf n+1" ergänzt. Ältere Dateien werden beim Lesen hochgezogen und beim
// nächsten Schreiben im neuen Format gespeichert; neuere als bekannt werden abgelehnt.

import { PROGRAMM_FORMAT, pruefeProgramm } from './programm.js';

export const EINHEITEN_FORMAT = 1;
export const ZUSTAND_FORMAT = 1;

// Migrationen je Dateiart: { 1: (daten) => daten_in_format_2, … }
export const MIGRATIONEN = {
  programm: {},
  einheiten: {},
  zustand: {},
};

export class FormatFehler extends Error {}

export function migriere(art, daten, aktuell, migrationen = MIGRATIONEN[art]) {
  if (!daten || typeof daten !== 'object') throw new FormatFehler(`${art}: kein JSON-Objekt.`);
  let v = daten.format;
  if (!Number.isInteger(v) || v < 1) throw new FormatFehler(`${art}: Feld „format“ fehlt.`);
  if (v > aktuell) throw new FormatFehler(`${art} hat Format ${v}, diese App-Version kennt nur bis ${aktuell}. App neu laden.`);
  let d = structuredClone(daten);
  while (v < aktuell) {
    const schritt = migrationen[v];
    if (!schritt) throw new FormatFehler(`${art}: keine Migration von Format ${v}.`);
    d = schritt(d);
    v += 1;
    d.format = v;
  }
  return d;
}

function parse(art, text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new FormatFehler(`${art}: kein gültiges JSON (${e.message}).`);
  }
}

export function leseProgramm(text) {
  const p = migriere('programm.json', parse('programm.json', text), PROGRAMM_FORMAT, MIGRATIONEN.programm);
  const fehler = pruefeProgramm(p);
  if (fehler.length) throw new FormatFehler(`programm.json: ${fehler.join(' ')}`);
  return p;
}

// ---------- JSON lesbar schreiben ----------
// Kurze Objekte und Listen in einer Zeile, längere eingerückt – gut für Diffs und für Claude.

function inline(wert) {
  if (Array.isArray(wert)) return `[${wert.map(inline).join(', ')}]`;
  if (wert && typeof wert === 'object') {
    const teile = Object.entries(wert).filter(([, v]) => v !== undefined).map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`);
    return teile.length ? `{ ${teile.join(', ')} }` : '{}';
  }
  return JSON.stringify(wert) ?? 'null';
}

function block(wert, einzug, breite) {
  const kurz = inline(wert);
  if (typeof wert !== 'object' || wert === null || einzug.length + kurz.length <= breite) return kurz;
  const innen = `${einzug}  `;
  if (Array.isArray(wert)) {
    return `[\n${wert.map((v) => innen + block(v, innen, breite)).join(',\n')}\n${einzug}]`;
  }
  const teile = Object.entries(wert).filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${innen}${JSON.stringify(k)}: ${block(v, innen, breite)}`);
  return `{\n${teile.join(',\n')}\n${einzug}}`;
}

export function jsonText(wert, breite = 110) {
  return `${block(wert, '', breite)}\n`;
}

// ---------- Einheiten (eine Datei je Jahr) ----------

export function jahresDatei(datum) {
  return `einheiten/${datum.slice(0, 4)}.json`;
}

export const JAHRES_MUSTER = /^einheiten\/(\d{4})\.json$/;

export function sortiereEinheiten(einheiten) {
  return [...einheiten].sort((a, b) => (a.begonnen < b.begonnen ? -1 : a.begonnen > b.begonnen ? 1 : a.id < b.id ? -1 : 1));
}

export function jahresText(einheiten) {
  return jsonText({ format: EINHEITEN_FORMAT, einheiten: sortiereEinheiten(einheiten) });
}

export function leseJahresdatei(text, pfad = 'einheiten') {
  const d = migriere(pfad, parse(pfad, text), EINHEITEN_FORMAT, MIGRATIONEN.einheiten);
  if (!Array.isArray(d.einheiten)) throw new FormatFehler(`${pfad}: „einheiten“ fehlt.`);
  return d.einheiten.filter((e) => e && typeof e.id === 'string' && typeof e.begonnen === 'string');
}

// Zwei Stände derselben Einheiten zusammenführen: je ID gewinnt der neuere "aktualisiert".
export function fuehreZusammen(...listen) {
  const nachId = new Map();
  for (const liste of listen) {
    for (const e of liste) {
      const vorhanden = nachId.get(e.id);
      if (!vorhanden || e.aktualisiert > vorhanden.aktualisiert) nachId.set(e.id, e);
    }
  }
  return sortiereEinheiten([...nachId.values()]);
}

// ---------- Lokaler Zustand ----------

export function leererSyncStand() {
  return { dateien: {}, programmBasis: null, letzterErfolg: null, letzterVersuch: null, fehler: null, warnung: null, konflikt: null };
}

export function neuerZustand(startProgramm) {
  return { format: ZUSTAND_FORMAT, programm: startProgramm, programmGeaendert: false, einheiten: [], sync: leererSyncStand() };
}

export function leseZustand(text) {
  const z = migriere('Gerätespeicher', parse('Gerätespeicher', text), ZUSTAND_FORMAT, MIGRATIONEN.zustand);
  return { ...z, sync: { ...leererSyncStand(), ...z.sync } };
}
