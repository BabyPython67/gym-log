// Übungsansicht – der Bildschirm zwischen den Sätzen. Oben: was war letztes Mal, was ist
// heute schon drin. Unten im Daumenbereich: der vorausgefüllte nächste Satz und ein Knopf.

import { istErledigt, naechsteOffene } from '../../logik/einheit.js';
import { messart, mitEinheit, spanneAlsText, zahl } from '../../logik/messarten.js';
import { kurzDatum } from '../../logik/zeit.js';
import { html } from '../html.js';
import { kopf, satzZellen, stepper } from '../teile.js';
import { eintragName } from './einheit.js';

function vorschlagText(v, vorgabe) {
  if (!v) return '';
  const kg = (x) => mitEinheit(x, messart('gewicht_wdh').felder[0]);
  if (v.art === 'suchen') return html`<p class="vorschlag suchen">Gewicht suchen${vorgabe.reserve ? ` – so wählen, dass ${vorgabe.reserve} Wdh. im Tank bleiben` : ''}.</p>`;
  if (v.art === 'hoeher') return html`<p class="vorschlag hoeher"><strong>${kg(v.kg)}</strong> · alle Sätze bei ${v.oben} Wdh. → +${zahl(v.schritt)} kg</p>`;
  const grund = v.oben == null ? 'keine Spanne hinterlegt' : `${v.fehlt} ${v.fehlt === 1 ? 'Satz' : 'Sätze'} unter ${v.oben} Wdh.`;
  return html`<p class="vorschlag gleich"><strong>${kg(v.kg)}</strong> bleiben · ${grund}</p>`;
}

function tabelle(art, saetze, { aktiv = null, antippbar = false } = {}) {
  return html`<table class="saetze">
    <tbody>${saetze.map((s, j) => html`<tr class="${aktiv === j ? 'aktiv' : ''}">
      <th scope="row">${j + 1}</th>
      ${satzZellen(art, s).map((z, k) => html`<td>${z}<span class="einheit">${messart(art).felder[k].einheit}</span></td>`)}
      ${antippbar ? html`<td class="aendern"><button class="knopf flach" data-a="satzBearbeiten" data-j="${j}" aria-label="Satz ${j + 1} ändern">Ändern</button></td>` : ''}
    </tr>`)}</tbody>
  </table>`;
}

export function uebungAnsicht(s, einheit, i, info) {
  const p = s.zustand.programm;
  const e = einheit.uebungen[i];
  const { uebung, letzte, vorschlag, entwurf } = info;
  const art = messart(e.messart);
  const naechste = naechsteOffene(einheit, i + 1);
  const erledigt = istErledigt(e);
  const bearbeite = entwurf.j;
  const satzNr = bearbeite ?? e.saetze.length;

  const varianten = e.varianten.length > 1
    ? html`<div class="auswahl varianten" role="radiogroup" aria-label="Variante">
        ${e.varianten.map((id) => html`<button class="knopf chip ${id === e.uebung ? 'an' : ''}" role="radio" aria-checked="${id === e.uebung}"
          data-a="variante" data-i="${i}" data-id="${id}" ${e.saetze.length && id !== e.uebung ? html`disabled` : ''}>${eintragName(p, { uebung: id, name: id })}</button>`)}
      </div>`
    : '';
  const meta = [spanneAlsText(uebung), `${e.vorgabe.saetze} Sätze`, e.vorgabe.reserve ? `Reserve ${e.vorgabe.reserve}` : null].filter(Boolean).join(' · ');

  let unten;
  if (e.ausgelassen) {
    unten = html`<p class="panel-titel">Heute ausgelassen</p>
      <button class="knopf haupt" data-a="wiederAufnehmen" data-i="${i}">Doch machen</button>`;
  } else if (erledigt && bearbeite === null && !info.extraSatz) {
    const weiter = naechste >= 0
      ? html`<button class="knopf haupt" data-a="zuUebung" data-i="${naechste}" data-testid="weiter">Weiter: ${eintragName(p, einheit.uebungen[naechste])}</button>`
      : html`<button class="knopf haupt" data-a="beenden" data-testid="beenden">Einheit beenden</button>`;
    unten = html`<p class="panel-titel">${e.saetze.length} von ${e.vorgabe.saetze} Sätzen ✓</p>
      ${weiter}
      <button class="knopf zweit" data-a="extraSatz">Noch ein Satz</button>`;
  } else {
    const titel = bearbeite !== null ? `Satz ${bearbeite + 1} ändern` : `Satz ${satzNr + 1}${satzNr < e.vorgabe.saetze ? ` von ${e.vorgabe.saetze}` : ' (zusätzlich)'}`;
    const knoepfe = bearbeite !== null
      ? html`<div class="reihe">
          <button class="knopf zweit" data-a="satzLoeschen">Löschen</button>
          <button class="knopf zweit" data-a="bearbeitenAbbrechen">Abbrechen</button>
        </div>
        <button class="knopf haupt" data-a="satzAendern">Änderung speichern</button>`
      : html`<button class="knopf haupt" data-a="satzSpeichern" data-testid="satz-speichern">Satz speichern</button>`;
    unten = html`<p class="panel-titel">${titel}</p>
      <div class="eingaben felder-${art.felder.length}">
        ${art.felder.map((f) => stepper(f, entwurf.werte[f.id], uebung))}
      </div>
      ${info.meldung ? html`<p class="meldung" role="alert">${info.meldung}</p>` : ''}
      ${knoepfe}`;
  }

  return html`<div class="seite uebung">
    ${kopf({ zurueck: '#/einheit', zurueckText: 'Übersicht', titel: `${einheit.programmName} · ${i + 1}/${einheit.uebungen.length}`,
      rechts: html`<button class="knopf flach" data-a="menue" data-i="${i}">Ändern</button>` })}
    <div class="kladde">
      ${e.platzName && e.platzName !== uebung.name ? html`<p class="etikett">${e.platzName}</p>` : ''}
      <h1 class="uebung-name">${uebung.name}</h1>
      ${e.ersetzt ? html`<p class="leise">heute statt ${eintragName(p, { uebung: e.ersetzt, name: e.ersetzt })}</p>` : ''}
      ${varianten}
      <p class="meta">${meta}${uebung.hinweis ? html` · <span class="hinweis">${uebung.hinweis}</span>` : ''}</p>

      <section class="block letztes" aria-label="Letztes Mal" data-testid="letztes-mal">
        <h2 class="etikett">${letzte ? `Letztes Mal · ${kurzDatum(letzte.datum)}` : 'Letztes Mal'}</h2>
        ${letzte ? tabelle(e.messart, letzte.saetze, { aktiv: bearbeite === null && !erledigt ? Math.min(satzNr, letzte.saetze.length - 1) : null }) : html`<p class="leise">Noch nie gemacht.</p>`}
        ${vorschlagText(vorschlag, e.vorgabe)}
      </section>

      ${e.saetze.length ? html`<section class="block heute" aria-label="Heute">
        <h2 class="etikett">Heute</h2>
        ${tabelle(e.messart, e.saetze, { aktiv: bearbeite, antippbar: true })}
      </section>` : ''}
    </div>
    <footer class="daumen panel">${unten}</footer>
  </div>`;
}
