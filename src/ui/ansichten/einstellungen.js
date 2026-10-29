// Einstellungen: Sync mit GitHub, Export/Import, Version.

import { zeitpunktText } from '../../logik/zeit.js';
import { VERSION } from '../../version.js';
import { html } from '../html.js';
import { kopf } from '../teile.js';
import { syncStand } from './sync-zeile.js';

export function einstellungenAnsicht(s) {
  const { einstellungen: e, zustand: z, ui } = s;
  const st = syncStand(s);
  const anzahl = z.einheiten.filter((x) => !x.geloescht && x.beendet).length;
  return html`<div class="seite bearbeiten">
    ${kopf({ zurueck: '#/start', zurueckText: 'Start', titel: 'Einstellungen' })}
    <section class="abschnitt">
      <h2>Sync mit GitHub</h2>
      <p class="sync-zeile sync-${st.art}">${st.text}</p>
      ${z.sync.letzterErfolg ? html`<p class="leise">Zuletzt erfolgreich: ${zeitpunktText(z.sync.letzterErfolg)}</p>` : ''}
      <form class="formular" data-form="einstellungen" autocomplete="off">
        <label>Token (fine-grained, nur für das Daten-Repo)
          <input name="token" type="password" value="${e.token ? '••••••••' : ''}" data-gesetzt="${e.token ? 'ja' : 'nein'}" placeholder="github_pat_…" autocomplete="off" spellcheck="false"></label>
        <label>Token gültig bis (für die Erinnerung)
          <input name="tokenBis" type="date" value="${e.tokenBis}"></label>
        <label>Repo <input name="repo" value="${e.repo}" spellcheck="false" autocapitalize="off"></label>
        <label>Ordner im Repo <input name="ordner" value="${e.ordner}" spellcheck="false" autocapitalize="off"></label>
        <label>Branch (leer = Standard-Branch) <input name="branch" value="${e.branch}" spellcheck="false" autocapitalize="off"></label>
        <button class="knopf haupt">Speichern und synchronisieren</button>
      </form>
      <button class="knopf zweit breit" data-a="jetztSync" ${e.token && !ui.sync.laeuft ? '' : html`disabled`}>Jetzt synchronisieren</button>
      <button class="knopf zweit breit" data-a="tokenEntfernen" ${e.token ? '' : html`disabled`}>Token entfernen</button>
      <p class="leise">Der Token bleibt nur auf diesem Gerät. Er steht nicht im Export und wird nur an api.github.com geschickt.</p>
    </section>
    <section class="abschnitt">
      <h2>Daten</h2>
      <p>${anzahl} ${anzahl === 1 ? 'Einheit' : 'Einheiten'} auf diesem Gerät.</p>
      <div class="reihe">
        <button class="knopf zweit" data-a="exportJson">Export JSON</button>
        <button class="knopf zweit" data-a="exportCsv">Export CSV</button>
      </div>
      <label class="knopf zweit breit datei">Export-Datei importieren <input type="file" accept="application/json,.json" data-f="import" hidden></label>
      <p class="leise">JSON enthält alles (Programm und Einheiten) und lässt sich hier wieder importieren. CSV: ein Satz pro Zeile, z. B. für eine Tabelle.</p>
    </section>
    <section class="abschnitt">
      <h2>App</h2>
      <p class="leise">Version ${VERSION}. Neue Versionen werden beim Öffnen automatisch übernommen.</p>
    </section>
  </div>`;
}
