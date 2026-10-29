// Übersicht der laufenden Einheit: alle Übungen mit Stand, Ersetzen/Auslassen, Beenden.

import { istErledigt, naechsteOffene } from '../../logik/einheit.js';
import { uebungNach } from '../../logik/programm.js';
import { kurzDatum } from '../../logik/zeit.js';
import { html } from '../html.js';
import { kopf } from '../teile.js';

export function eintragName(programm, eintrag) {
  return uebungNach(programm, eintrag.uebung)?.name ?? eintrag.name;
}

export function einheitAnsicht(s, einheit) {
  const p = s.zustand.programm;
  const naechste = naechsteOffene(einheit, 0);
  const zeilen = einheit.uebungen.map((u, i) => {
    const stand = u.ausgelassen ? 'ausgelassen' : `${u.saetze.length}/${u.vorgabe.saetze}`;
    const statt = u.ersetzt ? html`<small>statt ${uebungNach(p, u.ersetzt)?.name ?? u.ersetzt}</small>` : '';
    return html`<li class="zeile ${istErledigt(u) ? 'erledigt' : ''} ${u.ausgelassen ? 'ausgelassen' : ''}">
      <a class="zeile-haupt" href="#/uebung/${i}">
        <span class="nr">${i + 1}</span>
        <span class="name">${eintragName(p, u)}${statt}</span>
        <span class="stand">${stand}${istErledigt(u) && !u.ausgelassen ? ' ✓' : ''}</span>
      </a>
      <button class="knopf flach mehr" data-a="menue" data-i="${i}" aria-label="Optionen für ${eintragName(p, u)}">···</button>
    </li>`;
  });
  const daumen = naechste >= 0
    ? html`<a class="knopf haupt" href="#/uebung/${naechste}">Weiter: ${eintragName(p, einheit.uebungen[naechste])}</a>
       <button class="knopf zweit" data-a="beenden">Einheit beenden</button>`
    : html`<button class="knopf haupt" data-a="beenden">Einheit beenden</button>`;
  return html`<div class="seite einheit">
    ${kopf({ zurueck: '#/start', zurueckText: 'Start', titel: `${einheit.programmName} · ${kurzDatum(einheit.datum)}` })}
    <ol class="liste">${zeilen}</ol>
    <p class="leise mitte"><button class="knopf flach klein" data-a="verwerfen">Einheit verwerfen</button></p>
    <footer class="daumen">${daumen}</footer>
  </div>`;
}
