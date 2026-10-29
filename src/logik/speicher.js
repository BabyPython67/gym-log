// Gerätespeicher (localStorage). Zwei getrennte Einträge:
//   gym-log/zustand        Programm, Einheiten, Sync-Stand – wandert in den Export
//   gym-log/einstellungen  Token, Repo, Ordner – bleibt nur auf dem Gerät, nie im Export

import { leseZustand } from './datenformat.js';

const ZUSTAND = 'gym-log/zustand';
const EINSTELLUNGEN = 'gym-log/einstellungen';

export const STANDARD_EINSTELLUNGEN = {
  token: '',
  tokenBis: '',
  repo: 'BabyPython67/claude-projekte',
  ordner: 'gym',
  branch: '',
};

export function erstelleSpeicher(ablage = globalThis.localStorage) {
  return {
    ladeZustand() {
      const text = ablage.getItem(ZUSTAND);
      return text ? leseZustand(text) : null;
    },
    speichereZustand(zustand) {
      ablage.setItem(ZUSTAND, JSON.stringify(zustand));
    },
    ladeEinstellungen() {
      try {
        return { ...STANDARD_EINSTELLUNGEN, ...JSON.parse(ablage.getItem(EINSTELLUNGEN) ?? '{}') };
      } catch {
        return { ...STANDARD_EINSTELLUNGEN };
      }
    },
    speichereEinstellungen(e) {
      ablage.setItem(EINSTELLUNGEN, JSON.stringify(e));
    },
  };
}

// Für Tests und als Rückfall, wenn localStorage gesperrt ist.
export function speicherImArbeitsspeicher() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}
