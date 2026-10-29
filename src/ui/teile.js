// Wiederkehrende Bausteine der Oberfläche. Aktionen hängen als data-a="name" an Knöpfen,
// Parameter als data-*; app.js verteilt Klicks und Eingaben (siehe dort).

import { feldSchritt, messart, zahl } from '../logik/messarten.js';
import { html } from './html.js';

export function kopf({ zurueck, zurueckText = 'Zurück', titel, rechts = '' }) {
  return html`<header class="kopf">
    ${zurueck ? html`<a class="knopf flach zurueck" href="${zurueck}">‹ ${zurueckText}</a>` : html`<span></span>`}
    <span class="kopf-titel">${titel}</span>
    ${rechts || html`<span></span>`}
  </header>`;
}

// Eingabe eines Werts mit −/+ (Daumen) und Tippen auf die Zahl (Tastatur, für große Sprünge).
export function stepper(feld, wert, uebung, { label = true } = {}) {
  const schritt = feldSchritt(feld, uebung);
  const anzeige = wert === null || wert === undefined ? '' : zahl(wert, feld);
  return html`<div class="stepper" data-feld="${feld.id}">
    <button class="knopf stufe" data-a="stufe" data-feld="${feld.id}" data-richtung="-1" aria-label="${feld.name} minus ${zahl(schritt, feld)}">−</button>
    <label class="stepper-wert">
      <input class="zahl-eingabe" data-f="entwurf" data-feld="${feld.id}" value="${anzeige}"
        inputmode="${feld.ganzzahl ? 'numeric' : 'decimal'}" autocomplete="off" enterkeyhint="done"
        placeholder="–" aria-label="${feld.name} in ${feld.einheit}">
      ${label ? html`<span class="stepper-einheit">${feld.einheit}</span>` : ''}
    </label>
    <button class="knopf stufe" data-a="stufe" data-feld="${feld.id}" data-richtung="1" aria-label="${feld.name} plus ${zahl(schritt, feld)}">+</button>
  </div>`;
}

// Satz in Kurzform für Tabellen: [„16“, „10“] je nach Messart.
export function satzZellen(messartId, satz) {
  const art = messart(messartId);
  return art.felder.map((f) => (satz[f.id] === undefined || satz[f.id] === null ? '–' : zahl(satz[f.id], f)));
}

export function toastAnsicht(toast) {
  if (!toast) return '';
  return html`<div class="toast" role="status">
    <span>${toast.text}</span>
    ${toast.rueckgaengig ? html`<button class="knopf flach toast-knopf" data-a="rueckgaengig">Rückgängig</button>` : ''}
  </div>`;
}

export function blatt({ titel, inhalt }) {
  return html`<div class="blatt-hintergrund" data-a="blattZu"></div>
  <section class="blatt" role="dialog" aria-modal="true" aria-label="${titel}">
    <div class="blatt-kopf"><h2>${titel}</h2><button class="knopf flach" data-a="blattZu">Schließen</button></div>
    <div class="blatt-inhalt">${inhalt}</div>
  </section>`;
}

export function wahl(daten, optionen, aktuell) {
  return html`<select ${daten}>${optionen.map(([wert, name]) => html`<option value="${wert}" ${wert === aktuell ? html`selected` : ''}>${name}</option>`)}</select>`;
}
