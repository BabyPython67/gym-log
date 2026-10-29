// Eine unaufdringliche Zeile zum Sync-Stand. Bei Problemen führt sie zu den Einstellungen.

import { wartetAufSync } from '../../logik/sync.js';
import { kurzDatum, lokalesDatum, tageZwischen, uhrzeit } from '../../logik/zeit.js';
import { html } from '../html.js';

export function syncStand(s) {
  const { zustand: z, einstellungen: e, ui, jetzt } = s;
  const heute = lokalesDatum(jetzt);
  const wartet = wartetAufSync(z);
  if (!e.token) return { art: 'aus', text: 'Nur auf diesem Gerät gespeichert – Sync einrichten' };
  if (ui.sync.laeuft) return { art: 'laeuft', text: 'Wird gesichert …' };
  if (e.tokenBis && tageZwischen(heute, e.tokenBis) <= 14) {
    const tage = tageZwischen(heute, e.tokenBis);
    return { art: 'fehler', text: tage < 0 ? 'Token abgelaufen – neuen eintragen' : `Token läuft ${tage === 0 ? 'heute' : `in ${tage} ${tage === 1 ? 'Tag' : 'Tagen'}`} ab – erneuern` };
  }
  const f = z.sync.fehler;
  if (f) {
    if (f.art === 'offline') return { art: 'offline', text: wartet ? 'Offline – wird gesichert, sobald Netz da ist' : 'Offline' };
    return { art: 'fehler', text: f.text };
  }
  if (z.sync.warnung) return { art: 'fehler', text: z.sync.warnung };
  if (wartet) return { art: 'wartet', text: 'Noch nicht gesichert – gleich' };
  if (!z.sync.letzterErfolg) return { art: 'wartet', text: 'Noch nicht synchronisiert' };
  const d = lokalesDatum(new Date(z.sync.letzterErfolg));
  return { art: 'ok', text: `Gesichert ${d === heute ? `um ${uhrzeit(z.sync.letzterErfolg)}` : `am ${kurzDatum(d)}`}` };
}

export function syncZeile(s) {
  const st = syncStand(s);
  return html`<a class="sync-zeile sync-${st.art}" href="#/einstellungen" data-testid="sync-zeile">${st.text}</a>`;
}
