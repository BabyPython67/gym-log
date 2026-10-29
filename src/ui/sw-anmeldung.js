// Service Worker anmelden – so, dass nie eine alte Fassung hängen bleibt:
//   • updateViaCache: 'none' → sw.js wird bei jeder Prüfung frisch geladen, nie aus dem HTTP-Cache.
//   • Prüfung beim Öffnen und jedes Mal, wenn die App wieder in den Vordergrund kommt
//     (auf dem iPhone wird eine Home-Bildschirm-App oft nur fortgesetzt, nicht neu geladen).
//   • Der neue Worker übernimmt sofort (skipWaiting/clients.claim in sw.js); die Seite lädt
//     dann einmal neu und läuft mit der neuen Fassung. Daten liegen im localStorage, nichts geht verloren.

export function meldeServiceWorkerAn() {
  if (!('serviceWorker' in navigator)) return;
  const hatteSteuerung = !!navigator.serviceWorker.controller;
  let neuGeladen = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hatteSteuerung || neuGeladen) return;
    neuGeladen = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    const pruefe = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') pruefe();
    });
    pruefe();
  }).catch(() => {});
}
