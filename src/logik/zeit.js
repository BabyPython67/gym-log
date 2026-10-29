// Datumshilfen. Ein Trainingstag ist das lokale Kalenderdatum des Geräts (JJJJ-MM-TT),
// Zeitpunkte werden als ISO-Zeit in UTC gespeichert.

const zwei = (n) => String(n).padStart(2, '0');

export function lokalesDatum(d = new Date()) {
  return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;
}

export function istDatum(text) {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [j, m, t] = text.split('-').map(Number);
  const d = new Date(j, m - 1, t);
  return d.getFullYear() === j && d.getMonth() === m - 1 && d.getDate() === t;
}

const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function ausDatum(datum) {
  const [j, m, t] = datum.split('-').map(Number);
  return new Date(j, m - 1, t);
}

// „Do 29.10.“
export function kurzDatum(datum) {
  const d = ausDatum(datum);
  return `${WOCHENTAGE[d.getDay()]} ${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}.`;
}

// „Donnerstag, 29. Oktober“
export function langDatum(datum) {
  const d = ausDatum(datum);
  const tag = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][d.getDay()];
  return `${tag}, ${d.getDate()}. ${MONATE[d.getMonth()]}`;
}

// „29.10.2026, 18:42 Uhr“ in Ortszeit
export function zeitpunktText(iso) {
  const d = new Date(iso);
  return `${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}.${d.getFullYear()}, ${zwei(d.getHours())}:${zwei(d.getMinutes())} Uhr`;
}

export function uhrzeit(iso) {
  const d = new Date(iso);
  return `${zwei(d.getHours())}:${zwei(d.getMinutes())}`;
}

export function tageZwischen(vonDatum, bisDatum) {
  return Math.round((ausDatum(bisDatum) - ausDatum(vonDatum)) / 86400000);
}
