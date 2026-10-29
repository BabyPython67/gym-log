// Programm gleichzeitig im Repo und auf dem Gerät geändert: Unterschied zeigen, Mirko wählt.

import { programmUnterschiede } from '../../logik/unterschiede.js';
import { zeitpunktText } from '../../logik/zeit.js';
import { html } from '../html.js';
import { kopf } from '../teile.js';

export function konfliktAnsicht(s) {
  const z = s.zustand;
  const k = z.sync.konflikt;
  if (!k) {
    return html`<div class="seite bearbeiten">${kopf({ zurueck: '#/start', zurueckText: 'Start', titel: 'Programm' })}
      <section class="abschnitt"><p>Kein Konflikt mehr – alles ist abgeglichen.</p></section></div>`;
  }
  const basis = k.basis ?? k.repo;
  const imRepo = k.basis ? programmUnterschiede(k.basis, k.repo) : programmUnterschiede(z.programm, k.repo);
  const hier = k.basis ? programmUnterschiede(basis, z.programm) : [];
  const liste = (zeilen) => (zeilen.length ? html`<ul class="unterschiede">${zeilen.map((t) => html`<li>${t}</li>`)}</ul>` : html`<p class="leise">keine</p>`);
  return html`<div class="seite bearbeiten konflikt">
    ${kopf({ zurueck: '#/start', zurueckText: 'Start', titel: 'Programm abgleichen' })}
    <section class="abschnitt">
      <p>Seit dem letzten Sync wurde das Programm an beiden Stellen geändert. Nichts wurde überschrieben. Welche Fassung soll gelten?</p>
      <p class="leise">Festgestellt: ${zeitpunktText(k.seit)}</p>
    </section>
    <section class="abschnitt">
      <h2>${k.basis ? 'Im Repo geändert (z. B. von Claude)' : 'Fassung im Repo weicht ab'}</h2>
      ${liste(imRepo)}
      <button class="knopf zweit breit" data-a="konfliktRepo" data-testid="konflikt-repo">Fassung aus dem Repo übernehmen</button>
    </section>
    ${k.basis ? html`<section class="abschnitt">
      <h2>Hier auf dem Gerät geändert</h2>
      ${liste(hier)}
      <button class="knopf zweit breit" data-a="konfliktMeins" data-testid="konflikt-meins">Meine Fassung behalten</button>
    </section>` : html`<section class="abschnitt"><button class="knopf zweit breit" data-a="konfliktMeins" data-testid="konflikt-meins">Fassung dieses Geräts behalten</button></section>`}
    <p class="leise abschnitt">Die nicht gewählte Änderung ist danach weg und lässt sich bei Bedarf von Hand nachtragen. Einheiten sind davon nicht betroffen.</p>
  </div>`;
}
