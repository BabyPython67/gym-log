// Messarten: wie ein Satz einer Übung gemessen, eingegeben und angezeigt wird.
// Übungen verweisen in programm.json über "messart" auf einen Schlüssel dieser Liste.
// Neue Messart: einen Eintrag ergänzen (README, „Aufbau des Codes“). Mehr ist nicht nötig:
// Eingabe, Anzeige, Export und uebersicht.md lesen alles aus diesen Feldern.
//
// Feld:  id        Schlüssel im gespeicherten Satz ({ "kg": 40, "wdh": 8 })
//        einheit   Anzeige hinter der Zahl
//        schritt   Schritt der +/–-Tasten; 'uebung' = Schrittgröße der Übung
//        nachkomma höchstens so viele Nachkommastellen; minNachkomma für feste Stellen
//        ganzzahl  nur ganze Zahlen
//        minimum   kleinster gültiger Wert (Gewicht darf 0 sein, Wiederholungen nicht)

export const MESSARTEN = {
  gewicht_wdh: {
    name: 'Gewicht × Wiederholungen',
    felder: [
      { id: 'kg', name: 'Gewicht', einheit: 'kg', schritt: 'uebung', nachkomma: 2, minimum: 0 },
      { id: 'wdh', name: 'Wiederholungen', einheit: 'Wdh.', schritt: 1, ganzzahl: true, minimum: 1 },
    ],
    spanneFeld: 'wdh',
    vorschlag: true,
  },
  wdh: {
    name: 'Wiederholungen (Körpergewicht)',
    felder: [{ id: 'wdh', name: 'Wiederholungen', einheit: 'Wdh.', schritt: 1, ganzzahl: true, minimum: 1 }],
    spanneFeld: 'wdh',
  },
  zeit: {
    name: 'Zeit (halten)',
    felder: [{ id: 's', name: 'Zeit', einheit: 's', schritt: 5, ganzzahl: true, minimum: 1 }],
    spanneFeld: 's',
  },
  laufzeit: {
    name: 'Laufzeit (Sprint)',
    felder: [{ id: 's', name: 'Zeit', einheit: 's', schritt: 0.1, nachkomma: 2, minNachkomma: 2, minimum: 0.01 }],
    spanneFeld: null,
  },
  weite: {
    name: 'Weite (Stoß, Sprung)',
    felder: [{ id: 'm', name: 'Weite', einheit: 'm', schritt: 0.1, nachkomma: 2, minNachkomma: 2, minimum: 0.01 }],
    spanneFeld: null,
  },
};

export const STANDARD_MESSART = 'gewicht_wdh';

export function messart(id) {
  return Object.hasOwn(MESSARTEN, id) ? MESSARTEN[id] : null;
}

export function runde(x, stellen = 2) {
  const f = 10 ** stellen;
  return Math.round((x + Number.EPSILON) * f) / f;
}

export function feldSchritt(feld, uebung) {
  if (feld.schritt === 'uebung') return uebung?.schritt > 0 ? uebung.schritt : 2.5;
  return feld.schritt;
}

const zahlFormate = new Map();
export function zahl(x, feld = { nachkomma: 2 }) {
  const key = `${feld.minNachkomma ?? 0}-${feld.ganzzahl ? 0 : feld.nachkomma ?? 2}`;
  if (!zahlFormate.has(key)) {
    zahlFormate.set(key, new Intl.NumberFormat('de-DE', {
      minimumFractionDigits: feld.minNachkomma ?? 0,
      maximumFractionDigits: feld.ganzzahl ? 0 : feld.nachkomma ?? 2,
      useGrouping: false,
    }));
  }
  return zahlFormate.get(key).format(x);
}

// Ein Wert mit Einheit, z. B. „42,5 kg“, „45 s“, „8,20 m“.
export function mitEinheit(wert, feld) {
  return `${zahl(wert, feld)} ${feld.einheit}`;
}

export function pruefeWert(feld, wert) {
  if (typeof wert !== 'number' || !Number.isFinite(wert)) return false;
  if (feld.ganzzahl && !Number.isInteger(wert)) return false;
  return wert >= (feld.minimum ?? 0);
}

export function satzVollstaendig(messartId, werte) {
  const art = messart(messartId);
  return !!art && art.felder.every((f) => pruefeWert(f, werte?.[f.id]));
}

// Sätze einer Übung als Text, wie in uebersicht.md:
//   gleiches Gewicht:   „16 kg: 10, 10“
//   wechselndes:        „40 kg × 10, 42,5 kg × 8“
//   ein Feld:           „6, 5, 5“ (Wdh.) · „45 s, 40 s“ · „8,20 m, 8,45 m“
export function saetzeAlsText(messartId, saetze) {
  const art = messart(messartId);
  if (!art || !saetze.length) return '';
  const [erstes, zweites] = art.felder;
  if (art.felder.length === 1) {
    const ohneEinheit = erstes.id === 'wdh';
    return saetze.map((s) => (ohneEinheit ? zahl(s[erstes.id], erstes) : mitEinheit(s[erstes.id], erstes))).join(', ');
  }
  const gleich = saetze.every((s) => s[erstes.id] === saetze[0][erstes.id]);
  if (gleich) {
    return `${mitEinheit(saetze[0][erstes.id], erstes)}: ${saetze.map((s) => zahl(s[zweites.id], zweites)).join(', ')}`;
  }
  return saetze.map((s) => `${mitEinheit(s[erstes.id], erstes)} × ${zahl(s[zweites.id], zweites)}`).join(', ');
}

export function spanneAlsText(uebung) {
  const art = messart(uebung.messart);
  if (!art?.spanneFeld || !Array.isArray(uebung.spanne)) return '';
  const feld = art.felder.find((f) => f.id === art.spanneFeld);
  return `${zahl(uebung.spanne[0], feld)}–${zahl(uebung.spanne[1], feld)} ${feld.einheit}`;
}
