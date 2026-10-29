// Startbildschirm: welche Einheit ist dran, starten, Sync-Zustand in einer Zeile.

import { istErledigt, offeneEinheit } from '../../logik/einheit.js';
import { aktivePhase, letzteEinheit, naechstesProgramm, plaetzeVon, programmNach, rollenName, uebungNach, vorgabeFuer } from '../../logik/programm.js';
import { kurzDatum, langDatum, lokalesDatum, uhrzeit } from '../../logik/zeit.js';
import { html } from '../html.js';
import { syncZeile } from './sync-zeile.js';

// „2 Sätze · Reserve 3“ oder je Rolle, wenn sich die Vorgaben unterscheiden.
export function vorgabenZeile(programm, programmId, datum) {
  const phase = aktivePhase(programm, datum);
  const gruppen = new Map();
  for (const platz of plaetzeVon(programm, programmId)) {
    const u = uebungNach(programm, platz.varianten[0]);
    const v = vorgabeFuer(phase, u, platz);
    const text = `${v.saetze} Sätze${v.reserve ? ` · Reserve ${v.reserve}` : ''}`;
    if (!gruppen.has(text)) gruppen.set(text, new Set());
    gruppen.get(text).add(rollenName(programm, u?.rolle));
  }
  const teile = [...gruppen.entries()];
  const vorgaben = teile.length <= 1 ? teile.map(([t]) => t).join('') : teile.map(([t, rollen]) => `${[...rollen].join(', ')}: ${t}`).join(' · ');
  return { phase, vorgaben };
}

export function startAnsicht(s) {
  const { zustand: z, ui, jetzt } = s;
  const p = z.programm;
  const heute = lokalesDatum(jetzt);
  const offen = offeneEinheit(z.einheiten);
  const letzte = letzteEinheit(z.einheiten);
  const konflikt = z.sync.konflikt
    ? html`<a class="banner" href="#/konflikt">Programm wurde im Repo und hier geändert. <strong>Unterschied ansehen</strong></a>`
    : '';

  let haupt;
  let daumen;
  if (offen) {
    const fertig = offen.uebungen.filter(istErledigt).length;
    haupt = html`<p class="etikett">Läuft seit ${uhrzeit(offen.begonnen)} Uhr</p>
      <h1 class="riesig">${offen.programmName}</h1>
      <p class="untertitel">${fertig} von ${offen.uebungen.length} Übungen erledigt</p>`;
    daumen = html`<a class="knopf haupt" href="#/einheit" data-testid="fortsetzen">Weiter mit ${offen.programmName}</a>`;
  } else {
    const vorschlag = naechstesProgramm(p, z.einheiten);
    const gewaehlt = programmNach(p, ui.startAuswahl) ? ui.startAuswahl : vorschlag;
    const pr = programmNach(p, gewaehlt);
    const anzahl = plaetzeVon(p, gewaehlt).length;
    const { phase, vorgaben } = vorgabenZeile(p, gewaehlt, heute);
    haupt = html`<p class="etikett">${gewaehlt === vorschlag ? 'Als Nächstes' : `Gewählt – dran wäre ${programmNach(p, vorschlag)?.name ?? '–'}`}</p>
      <h1 class="riesig">${pr?.name ?? '–'}</h1>
      <p class="untertitel">${pr?.titel ? `${pr.titel} · ` : ''}${anzahl} ${anzahl === 1 ? 'Übung' : 'Übungen'}</p>
      <p class="phase">${phase ? `Phase ${phase.name}: ${vorgaben}` : vorgaben}</p>
      <p class="zuletzt">${letzte ? `Zuletzt: ${letzte.programmName} · ${kurzDatum(letzte.datum)}` : 'Erste Einheit – die Gewichte suchst du heute.'}</p>
      <div class="auswahl" role="radiogroup" aria-label="Einheit wählen">
        ${p.programme.map((x) => html`<button class="knopf chip ${x.id === gewaehlt ? 'an' : ''}" role="radio" aria-checked="${x.id === gewaehlt}" data-a="startWahl" data-id="${x.id}">${x.name}</button>`)}
      </div>`;
    const korrigieren = letzte && letzte.datum === heute
      ? html`<button class="knopf flach klein" data-a="letzteOeffnen">Letzte Einheit korrigieren</button>`
      : '';
    daumen = html`${korrigieren}<button class="knopf haupt" data-a="starten" data-id="${gewaehlt}" ${anzahl ? '' : html`disabled`}>${pr?.name ?? ''} starten</button>`;
  }

  return html`<div class="seite start">
    <header class="start-kopf">
      <nav class="start-nav">
        <a class="knopf flach" href="#/programm">Programm</a>
        <a class="knopf flach" href="#/einstellungen">Einstellungen</a>
      </nav>
    </header>
    ${konflikt}
    <section class="start-haupt"><p class="datum">${langDatum(heute)}</p>${haupt}</section>
    <footer class="daumen">
      ${syncZeile(s)}
      ${daumen}
    </footer>
  </div>`;
}
