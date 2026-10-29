// Programm bearbeiten: Übersicht, ein Programm, eine Übung des Katalogs, eine Phase, Rotation.
// Jede Änderung wird sofort gespeichert; Löschen lässt sich per „Rückgängig“ zurücknehmen.
// Beim Verlassen synchronisiert die App, die Änderung landet so in programm.json.

import { MESSARTEN, messart, spanneAlsText, zahl } from '../../logik/messarten.js';
import { plaetzeVon, platzName, programmNach, rollenName, rollenVon, uebungNach, wirdVerwendet } from '../../logik/programm.js';
import { html } from '../html.js';
import { kopf, wahl } from '../teile.js';

const kurz = (s) => html`<span class="leise">${s}</span>`;

function hatHistorie(z, id) {
  return z.einheiten.some((e) => !e.geloescht && e.uebungen.some((u) => u.uebung === id && u.saetze.length));
}

export function programmUebersicht(s) {
  const p = s.zustand.programm;
  const aktiv = p.uebungen.filter((u) => !u.archiviert).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const archiviert = p.uebungen.filter((u) => u.archiviert).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const katalogZeile = (u) => html`<li><a class="zeile-haupt" href="#/katalog/${u.id}"><span class="name">${u.name}</span>${kurz(messart(u.messart)?.name ?? u.messart)}</a></li>`;
  return html`<div class="seite bearbeiten">
    ${kopf({ zurueck: '#/start', zurueckText: 'Start', titel: 'Programm' })}
    <section class="abschnitt">
      <h2>Programme</h2>
      <ul class="liste">${p.programme.map((pr) => html`<li><a class="zeile-haupt" href="#/programm/${pr.id}">
        <span class="name">${pr.name}</span>
        ${kurz(pr.auszug ? `erste ${pr.auszug.anzahl} von ${programmNach(p, pr.auszug.programm)?.name}` : `${plaetzeVon(p, pr.id).length} Übungen`)}</a></li>`)}</ul>
      <form class="neu" data-form="neuesProgramm"><input name="name" placeholder="Name, z. B. C" aria-label="Name des neuen Programms" autocomplete="off" required><button class="knopf zweit">Programm anlegen</button></form>
    </section>
    <section class="abschnitt">
      <h2>Rotation</h2>
      <a class="zeile-haupt einzeln" href="#/rotation"><span class="name">${p.rotation.map((id) => programmNach(p, id)?.name ?? id).join(' → ') || 'keine'}</span>${kurz('ändern')}</a>
    </section>
    <section class="abschnitt">
      <h2>Phasen</h2>
      <ul class="liste">${p.phasen.map((ph) => html`<li><a class="zeile-haupt" href="#/phase/${ph.id}"><span class="name">${ph.name}</span>${kurz(ph.ab ? `ab ${ph.ab.split('-').reverse().join('.')}` : 'ohne Datum – inaktiv')}</a></li>`)}</ul>
      <form class="neu" data-form="neuePhase"><input name="name" placeholder="Name der Phase" aria-label="Name der neuen Phase" autocomplete="off" required><button class="knopf zweit">Phase anlegen</button></form>
    </section>
    <section class="abschnitt">
      <h2>Übungen</h2>
      <ul class="liste">${aktiv.map(katalogZeile)}</ul>
      <form class="neu" data-form="neueUebung"><input name="name" placeholder="Name der Übung" aria-label="Name der neuen Übung" autocomplete="off" required><button class="knopf zweit">Übung anlegen</button></form>
      ${archiviert.length ? html`<details class="archiv"><summary class="knopf flach">Archiviert (${archiviert.length})</summary><ul class="liste">${archiviert.map(katalogZeile)}</ul></details>` : ''}
    </section>
  </div>`;
}

export function programmBearbeiten(s, id) {
  const p = s.zustand.programm;
  const pr = programmNach(p, id);
  if (!pr) return programmUebersicht(s);
  const andere = p.programme.filter((x) => x.id !== id);
  let plaetze;
  if (pr.auszug) {
    const quelle = programmNach(p, pr.auszug.programm);
    plaetze = html`<section class="abschnitt">
      <h2>Übungen</h2>
      <p>Übernimmt die ersten Übungen von ${wahl(html`data-f="auszugQuelle" data-id="${id}" aria-label="Quelle"`, andere.filter((x) => !x.auszug).map((x) => [x.id, x.name]), pr.auszug.programm)}:</p>
      <div class="stepper klein-stepper">
        <button class="knopf stufe" data-a="auszugAnzahl" data-id="${id}" data-richtung="-1" aria-label="eine weniger">−</button>
        <span class="stepper-wert"><span class="zahl-gross">${pr.auszug.anzahl}</span></span>
        <button class="knopf stufe" data-a="auszugAnzahl" data-id="${id}" data-richtung="1" aria-label="eine mehr">+</button>
      </div>
      <ol class="liste">${plaetzeVon(p, id).map((pl) => html`<li class="zeile-haupt einzeln">${platzName(p, pl)}</li>`)}</ol>
      <p class="leise">Ändert sich ${quelle?.name}, ändert sich ${pr.name} mit.</p>
    </section>`;
  } else {
    plaetze = html`<section class="abschnitt">
      <h2>Übungen in Reihenfolge</h2>
      <ol class="plaetze">${pr.plaetze.map((pl, i) => html`<li class="platz">
        <div class="platz-kopf">
          <span class="nr">${i + 1}</span>
          <input class="platz-name" data-f="platzName" data-id="${id}" data-i="${i}" value="${pl.name ?? ''}" placeholder="${platzName(p, { varianten: pl.varianten })}" aria-label="Name des Platzes ${i + 1}">
        </div>
        <ul class="varianten-liste">${pl.varianten.map((v) => html`<li>
          <a href="#/katalog/${v}">${uebungNach(p, v)?.name ?? v}</a>
          ${pl.varianten.length > 1 ? html`<button class="knopf flach" data-a="varianteEntfernen" data-id="${id}" data-i="${i}" data-uebung="${v}" aria-label="Variante ${uebungNach(p, v)?.name} entfernen">Entfernen</button>` : ''}
        </li>`)}</ul>
        <div class="platz-knoepfe">
          <button class="knopf zweit" data-a="waehlen" data-zweck="variante" data-id="${id}" data-i="${i}">+ Variante</button>
          <button class="knopf zweit" data-a="platzHoch" data-id="${id}" data-i="${i}" aria-label="nach oben" ${i === 0 ? html`disabled` : ''}>↑</button>
          <button class="knopf zweit" data-a="platzRunter" data-id="${id}" data-i="${i}" aria-label="nach unten" ${i === pr.plaetze.length - 1 ? html`disabled` : ''}>↓</button>
          <button class="knopf zweit" data-a="platzEntfernen" data-id="${id}" data-i="${i}" aria-label="Platz ${i + 1} entfernen">✕</button>
        </div>
      </li>`)}</ol>
      <button class="knopf zweit breit" data-a="waehlen" data-zweck="platz" data-id="${id}">+ Übung hinzufügen</button>
    </section>`;
  }
  return html`<div class="seite bearbeiten">
    ${kopf({ zurueck: '#/programm', zurueckText: 'Programm', titel: pr.name })}
    <section class="abschnitt formular">
      <label>Name <input data-f="programmFeld" data-id="${id}" data-feld="name" value="${pr.name}" autocomplete="off"></label>
      <label>Beschreibung <input data-f="programmFeld" data-id="${id}" data-feld="titel" value="${pr.titel ?? ''}" placeholder="z. B. Ganzkörper A" autocomplete="off"></label>
      <label>Zählt in der Rotation als
        ${wahl(html`data-f="programmFeld" data-id="${id}" data-feld="zaehltAls"`, [['', 'sich selbst'], ...andere.map((x) => [x.id, x.name])], pr.zaehltAls ?? '')}
      </label>
      <label class="schalter"><input type="checkbox" data-f="auszugSchalter" data-id="${id}" ${pr.auszug ? html`checked` : ''}> Kurzfassung: übernimmt die ersten Übungen eines anderen Programms</label>
    </section>
    ${plaetze}
    <section class="abschnitt">
      <button class="knopf zweit breit gefahr" data-a="programmLoeschen" data-id="${id}">Programm löschen</button>
      <p class="leise">Einheiten, die mit diesem Programm gemacht wurden, bleiben erhalten.</p>
    </section>
  </div>`;
}

export function katalogBearbeiten(s, id) {
  const z = s.zustand;
  const p = z.programm;
  const u = uebungNach(p, id);
  if (!u) return programmUebersicht(s);
  const art = messart(u.messart);
  const spanne = Array.isArray(u.spanne) ? u.spanne : null;
  const historie = hatHistorie(z, id);
  const verwendet = wirdVerwendet(p, id);
  const feld = art.felder.find((f) => f.id === art.spanneFeld);
  return html`<div class="seite bearbeiten">
    ${kopf({ zurueck: '#/programm', zurueckText: 'Programm', titel: 'Übung' })}
    <section class="abschnitt formular">
      <label>Name <input data-f="uebungFeld" data-id="${id}" data-feld="name" value="${u.name}" autocomplete="off"></label>
      <p class="leise">Kennung „${u.id}“ bleibt beim Umbenennen gleich – die Historie bleibt dran.</p>
      <label>Messart ${wahl(html`data-f="uebungFeld" data-id="${id}" data-feld="messart"`, Object.entries(MESSARTEN).map(([k, m]) => [k, m.name]), u.messart)}</label>
      ${art.spanneFeld ? html`<fieldset class="spanne"><legend>Spanne (${feld.einheit})</legend>
        <label>von <input data-f="spanne" data-id="${id}" data-teil="0" value="${spanne ? spanne[0] : ''}" inputmode="numeric" autocomplete="off"></label>
        <label>bis <input data-f="spanne" data-id="${id}" data-teil="1" value="${spanne ? spanne[1] : ''}" inputmode="numeric" autocomplete="off"></label>
      </fieldset>` : ''}
      ${art.vorschlag ? html`<label>Schrittgröße für den Vorschlag (kg)
        <input data-f="uebungFeld" data-id="${id}" data-feld="schritt" value="${u.schritt ? zahl(u.schritt) : ''}" inputmode="decimal" autocomplete="off"></label>` : ''}
      <label>Rolle (bestimmt Sätze und Reserve je Phase)
        ${wahl(html`data-f="uebungFeld" data-id="${id}" data-feld="rolle"`, rollenVon(p).map((r) => [r.id, r.name]), u.rolle ?? '')}</label>
      <label>Hinweis <input data-f="uebungFeld" data-id="${id}" data-feld="hinweis" value="${u.hinweis ?? ''}" placeholder="z. B. Gewicht je Hand" autocomplete="off"></label>
      <label class="schalter"><input type="checkbox" data-f="archiviert" data-id="${id}" ${u.archiviert ? html`checked` : ''}> Archiviert (taucht bei „Ersetzen“ nicht mehr auf)</label>
    </section>
    <section class="abschnitt">
      ${historie || verwendet
        ? html`<p class="leise">${historie ? 'Hat Sätze in der Historie – wird nie gelöscht, höchstens archiviert.' : 'Steht in einem Programm – dort entfernen, dann lässt sie sich löschen.'}</p>`
        : html`<button class="knopf zweit breit gefahr" data-a="uebungLoeschen" data-id="${id}">Übung löschen</button>`}
    </section>
  </div>`;
}

export function phaseBearbeiten(s, id) {
  const p = s.zustand.programm;
  const ph = p.phasen.find((x) => x.id === id);
  if (!ph) return programmUebersicht(s);
  const rollen = rollenVon(p).filter((r) => p.uebungen.some((u) => u.rolle === r.id) || ph.vorgaben[r.id]);
  return html`<div class="seite bearbeiten">
    ${kopf({ zurueck: '#/programm', zurueckText: 'Programm', titel: 'Phase' })}
    <section class="abschnitt formular">
      <label>Name <input data-f="phaseFeld" data-id="${id}" data-feld="name" value="${ph.name}" autocomplete="off"></label>
      <label>Gilt ab <input type="date" data-f="phaseFeld" data-id="${id}" data-feld="ab" value="${ph.ab ?? ''}"></label>
      <p class="leise">${ph.ab ? 'Aktiv ab diesem Tag, bis eine spätere Phase beginnt.' : 'Ohne Datum ist die Phase vorbereitet, aber nicht aktiv.'}</p>
      ${ph.ab ? html`<button class="knopf flach klein" data-a="phaseOhneDatum" data-id="${id}">Datum entfernen</button>` : ''}
    </section>
    ${rollen.map((r) => {
      const v = ph.vorgaben[r.id] ?? { saetze: 3, reserve: '' };
      return html`<section class="abschnitt formular">
        <h2>${r.name}</h2>
        <div class="stepper klein-stepper">
          <button class="knopf stufe" data-a="phaseSaetze" data-id="${id}" data-rolle="${r.id}" data-richtung="-1" aria-label="ein Satz weniger">−</button>
          <span class="stepper-wert"><span class="zahl-gross">${v.saetze}</span><span class="stepper-einheit">Sätze</span></span>
          <button class="knopf stufe" data-a="phaseSaetze" data-id="${id}" data-rolle="${r.id}" data-richtung="1" aria-label="ein Satz mehr">+</button>
        </div>
        <label>Reserve (Wdh. im Tank) <input data-f="phaseReserve" data-id="${id}" data-rolle="${r.id}" value="${v.reserve ?? ''}" placeholder="z. B. 2 oder 1–2" autocomplete="off"></label>
      </section>`;
    })}
    <section class="abschnitt"><button class="knopf zweit breit gefahr" data-a="phaseLoeschen" data-id="${id}">Phase löschen</button></section>
  </div>`;
}

export function rotationBearbeiten(s) {
  const p = s.zustand.programm;
  const drin = p.rotation;
  const draussen = p.programme.filter((x) => !drin.includes(x.id));
  return html`<div class="seite bearbeiten">
    ${kopf({ zurueck: '#/programm', zurueckText: 'Programm', titel: 'Rotation' })}
    <section class="abschnitt">
      <p class="leise">Die App schlägt das Programm nach dem zuletzt gemachten vor. Kurzfassungen zählen über „Zählt als“ mit.</p>
      <ol class="liste">${drin.map((id, i) => html`<li class="zeile">
        <span class="zeile-haupt"><span class="nr">${i + 1}</span><span class="name">${programmNach(p, id)?.name ?? id}</span></span>
        <button class="knopf zweit" data-a="rotHoch" data-i="${i}" aria-label="früher" ${i === 0 ? html`disabled` : ''}>↑</button>
        <button class="knopf zweit" data-a="rotRunter" data-i="${i}" aria-label="später" ${i === drin.length - 1 ? html`disabled` : ''}>↓</button>
        <button class="knopf zweit" data-a="rotRaus" data-i="${i}" aria-label="aus der Rotation nehmen">✕</button>
      </li>`)}</ol>
      ${draussen.length ? html`<h2>Hinzufügen</h2><div class="auswahl">${draussen.map((x) => html`<button class="knopf chip" data-a="rotRein" data-id="${x.id}">+ ${x.name}</button>`)}</div>` : ''}
    </section>
  </div>`;
}

export function uebungsWahl(s, { titel, zweck, ausser = [], neuText = 'Neue Übung anlegen' }) {
  const p = s.zustand.programm;
  const liste = p.uebungen.filter((u) => !u.archiviert && !ausser.includes(u.id)).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return html`<div class="wahl">
    <input class="suche" type="search" data-f="suche" placeholder="Suchen oder neuen Namen tippen" aria-label="${titel}" autocomplete="off" enterkeyhint="done">
    <button class="knopf zweit breit neu-uebung" data-a="neueGewaehlt" data-zweck="${zweck}" hidden>${neuText}</button>
    <ul class="liste">${liste.map((u) => html`<li data-suchtext="${u.name.toLowerCase()}">
      <button class="zeile-haupt" data-a="gewaehlt" data-zweck="${zweck}" data-id="${u.id}"><span class="name">${u.name}</span>${kurz(spanneAlsText(u) || messart(u.messart)?.name)}</button>
    </li>`)}</ul>
  </div>`;
}

export { rollenName };
