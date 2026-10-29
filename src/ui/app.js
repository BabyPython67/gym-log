// Einstieg der App: Zustand laden, Bildschirm zeichnen, Aktionen ausführen, Sync anstoßen.
//
// Muster: Jeder Knopf trägt data-a="aktion" (+ data-*-Parameter). Ein Klick ruft
// aktionen[aktion](dataset) auf, danach wird der Bildschirm neu gezeichnet. Eingabefelder
// tragen data-f="feld" und landen in felder[feld]. Formulare tragen data-form="name".
// Die Logik (src/logik) kennt kein DOM; hier wird sie nur aufgerufen.

import * as bearbeiten from '../logik/bearbeiten.js';
import { leseProgramm, neuerZustand } from '../logik/datenformat.js';
import {
  aendereSatz, beende, beendeVergessene, ersetzeHeute, fuegeSatzEin, hatSaetze, lasseAus, loescheSatz,
  naechsteOffene, nimmWiederAuf, offeneEinheit, oeffneWieder, speichereSatz, starteEinheit, verwerfe, waehleVariante,
} from '../logik/einheit.js';
import { exportCsv, exportDateiname, exportJson, importiere } from '../logik/export.js';
import { SyncFehler, erstelleGithubApi } from '../logik/github.js';
import { feldSchritt, messart, pruefeWert, runde, satzVollstaendig } from '../logik/messarten.js';
import { letzteEinheit, mitNeuerUebung, plaetzeVon, programmNach, pruefeProgramm, uebungNach } from '../logik/programm.js';
import { erstelleSpeicher, speicherImArbeitsspeicher } from '../logik/speicher.js';
import { loeseKonflikt, mitSyncFehler, synchronisiere, wartetAufSync, wendeSyncAn } from '../logik/sync.js';
import { gewichtsVorschlag, letzteWerte, vorbelegung } from '../logik/vorschlag.js';
import { VERSION } from '../version.js';
import { einheitAnsicht, eintragName } from './ansichten/einheit.js';
import { einstellungenAnsicht } from './ansichten/einstellungen.js';
import { konfliktAnsicht } from './ansichten/konflikt.js';
import { katalogBearbeiten, phaseBearbeiten, programmBearbeiten, programmUebersicht, rotationBearbeiten, uebungsWahl } from './ansichten/programm.js';
import { startAnsicht } from './ansichten/start.js';
import { uebungAnsicht } from './ansichten/uebung.js';
import { html, text } from './html.js';
import { meldeServiceWorkerAn } from './sw-anmeldung.js';
import { blatt, toastAnsicht } from './teile.js';

// ---------- Zustand ----------

function ablage() {
  try {
    localStorage.setItem('gym-log/probe', '1');
    localStorage.removeItem('gym-log/probe');
    return localStorage;
  } catch {
    return speicherImArbeitsspeicher();
  }
}

const speicher = erstelleSpeicher(ablage());
let zustand = null;
let einstellungen = speicher.ladeEinstellungen();
const ui = { startAuswahl: null, entwurf: null, extraSatz: null, meldung: null, toast: null, blatt: null, sync: { laeuft: false }, fehler: null };
const wurzel = document.getElementById('app');
document.documentElement.dataset.version = VERSION;

const jetzt = () => new Date();

function speichern() {
  try {
    speicher.speichereZustand(zustand);
  } catch (e) {
    zeigeToast(`Speichern auf dem Gerät fehlgeschlagen: ${e.message}`);
  }
}

function setze(neu) {
  zustand = neu;
  speichern();
}

function mitEinheit(einheit) {
  const da = zustand.einheiten.some((e) => e.id === einheit.id);
  return { ...zustand, einheiten: da ? zustand.einheiten.map((e) => (e.id === einheit.id ? einheit : e)) : [...zustand.einheiten, einheit] };
}

function setzeProgramm(programm, toast = null) {
  const fehler = pruefeProgramm(programm);
  if (fehler.length) {
    zeigeToast(fehler[0]);
    return false;
  }
  const vorher = zustand.programm;
  setze({ ...zustand, programm, programmGeaendert: true });
  if (toast) zeigeToast(toast, () => setze({ ...zustand, programm: vorher, programmGeaendert: true }));
  return true;
}

// ---------- Toast mit Rückgängig ----------

let toastZaehler = 0;
function zeigeToast(textInhalt, rueckgaengig = null, dauer = 6000) {
  const id = ++toastZaehler;
  ui.toast = { id, text: textInhalt, rueckgaengig, hash: location.hash };
  setTimeout(() => {
    if (ui.toast?.id === id) {
      ui.toast = null;
      zeichne();
    }
  }, dauer);
}

// ---------- Navigation ----------

function route() {
  const [name, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: name || 'start', param: rest.map(decodeURIComponent).join('/') };
}

function geheZu(hash) {
  if (location.hash === hash) zeichne();
  else location.hash = hash;
}

const BEARBEITEN = new Set(['programm', 'katalog', 'phase', 'rotation']);
let vorigeRoute = route();

window.addEventListener('hashchange', () => {
  const neu = route();
  if (BEARBEITEN.has(vorigeRoute.name) && !BEARBEITEN.has(neu.name) && zustand?.programmGeaendert) syncStarten();
  if (vorigeRoute.name !== neu.name || vorigeRoute.param !== neu.param) {
    // Ein Toast gehört zu der Ansicht, auf der er erscheint – beim Weiternavigieren verschwindet er.
    // (Aktionen, die navigieren, rufen darum erst geheZu und dann zeigeToast auf.)
    if (ui.toast && ui.toast.hash !== location.hash) ui.toast = null;
    ui.extraSatz = null;
    ui.meldung = null;
    ui.blatt = null;
  }
  vorigeRoute = neu;
  zeichne();
});

// ---------- Übungsansicht: Entwurf des nächsten Satzes ----------

function aktuelleUebung() {
  const einheit = offeneEinheit(zustand.einheiten);
  const r = route();
  const i = Number(r.param);
  if (!einheit || r.name !== 'uebung' || !einheit.uebungen[i]) return null;
  return { einheit, i, eintrag: einheit.uebungen[i] };
}

function uebungFuer(eintrag) {
  const u = uebungNach(zustand.programm, eintrag.uebung);
  return u ? { ...u, messart: eintrag.messart } : { id: eintrag.uebung, name: eintrag.name, messart: eintrag.messart, spanne: eintrag.vorgabe.spanne, schritt: null };
}

function uebungInfo(einheit, i) {
  const e = einheit.uebungen[i];
  const uebung = uebungFuer(e);
  const letzte = letzteWerte(zustand.einheiten, e.uebung, einheit.id);
  const vorschlag = gewichtsVorschlag(uebung, letzte);
  const schluessel = `${einheit.id}|${i}|${e.uebung}|${e.saetze.length}`;
  if (ui.entwurf?.schluessel !== schluessel) {
    ui.entwurf = { schluessel, j: null, werte: vorbelegung(uebung, letzte, vorschlag, e.saetze, e.saetze.length) };
    ui.meldung = null;
  }
  return { uebung, letzte, vorschlag, entwurf: ui.entwurf, extraSatz: ui.extraSatz === schluessel, meldung: ui.meldung };
}

function parseZahl(t) {
  const s = String(t ?? '').trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : Number.NaN;
}

function entwurfPruefen(eintrag) {
  const art = messart(eintrag.messart);
  const falsch = art.felder.filter((f) => !pruefeWert(f, ui.entwurf.werte[f.id]));
  if (!falsch.length) return true;
  ui.meldung = `${falsch.map((f) => f.name).join(' und ')} fehlt oder ist ungültig.`;
  return false;
}

function satzWerte(eintrag) {
  return Object.fromEntries(messart(eintrag.messart).felder.map((f) => [f.id, ui.entwurf.werte[f.id]]));
}

// ---------- Aktionen ----------

const aktionen = {
  startWahl: ({ id }) => {
    ui.startAuswahl = id;
  },
  starten: ({ id }) => {
    if (offeneEinheit(zustand.einheiten)) return geheZu('#/einheit');
    if (!plaetzeVon(zustand.programm, id).length) return undefined;
    const e = starteEinheit(zustand.programm, id, zustand.einheiten, jetzt());
    setze(mitEinheit(e));
    ui.startAuswahl = null;
    return geheZu(`#/uebung/${Math.max(0, naechsteOffene(e, 0))}`);
  },
  letzteOeffnen: () => {
    const l = letzteEinheit(zustand.einheiten);
    if (!l || offeneEinheit(zustand.einheiten)) return undefined;
    setze(mitEinheit(oeffneWieder(l, jetzt())));
    return geheZu('#/einheit');
  },
  zuUebung: ({ i }) => geheZu(`#/uebung/${i}`),

  stufe: ({ feld, richtung }) => {
    const a = aktuelleUebung();
    if (!a) return;
    const uebung = uebungFuer(a.eintrag);
    const f = messart(a.eintrag.messart).felder.find((x) => x.id === feld);
    let v = ui.entwurf.werte[feld];
    if (v === null || v === undefined || Number.isNaN(v)) {
      const art = messart(a.eintrag.messart);
      v = art.spanneFeld === feld && uebung.spanne ? uebung.spanne[0] : feld === 'kg' ? 0 : f.minimum;
      if (feld !== 'kg' || Number(richtung) < 0) {
        ui.entwurf.werte[feld] = v;
        return;
      }
    }
    v = runde(v + Number(richtung) * feldSchritt(f, uebung), 2);
    ui.entwurf.werte[feld] = Math.max(f.minimum ?? 0, v);
    ui.meldung = null;
  },
  satzSpeichern: () => {
    const a = aktuelleUebung();
    if (!a || !entwurfPruefen(a.eintrag)) return;
    const n = a.eintrag.saetze.length;
    const neu = speichereSatz(a.einheit, a.i, satzWerte(a.eintrag), jetzt());
    setze(mitEinheit(neu));
    ui.extraSatz = null;
    zeigeToast(`Satz ${n + 1} gespeichert`, () => {
      const akt = offeneEinheit(zustand.einheiten);
      if (akt?.id === neu.id && akt.uebungen[a.i]?.saetze.length === n + 1) setze(mitEinheit(loescheSatz(akt, a.i, n, jetzt())));
    }, 5000);
  },
  satzBearbeiten: ({ j }) => {
    const a = aktuelleUebung();
    if (!a) return;
    const satz = a.eintrag.saetze[Number(j)];
    ui.entwurf = { ...ui.entwurf, j: Number(j), werte: Object.fromEntries(Object.entries(satz).filter(([k]) => k !== 't')) };
    ui.meldung = null;
  },
  satzAendern: () => {
    const a = aktuelleUebung();
    if (!a || ui.entwurf.j === null || !entwurfPruefen(a.eintrag)) return;
    setze(mitEinheit(aendereSatz(a.einheit, a.i, ui.entwurf.j, satzWerte(a.eintrag), jetzt())));
    ui.entwurf = null;
    zeigeToast('Satz geändert');
  },
  satzLoeschen: () => {
    const a = aktuelleUebung();
    if (!a || ui.entwurf.j === null) return;
    const j = ui.entwurf.j;
    const satz = a.eintrag.saetze[j];
    setze(mitEinheit(loescheSatz(a.einheit, a.i, j, jetzt())));
    ui.entwurf = null;
    zeigeToast(`Satz ${j + 1} gelöscht`, () => {
      const akt = offeneEinheit(zustand.einheiten);
      if (akt?.id === a.einheit.id) setze(mitEinheit(fuegeSatzEin(akt, a.i, j, satz, jetzt())));
    });
  },
  bearbeitenAbbrechen: () => {
    ui.entwurf = null;
    ui.meldung = null;
  },
  extraSatz: () => {
    const a = aktuelleUebung();
    if (a) ui.extraSatz = `${a.einheit.id}|${a.i}|${a.eintrag.uebung}|${a.eintrag.saetze.length}`;
  },
  variante: ({ i, id }) => {
    const e = offeneEinheit(zustand.einheiten);
    if (e) setze(mitEinheit(waehleVariante(zustand.programm, e, Number(i), id, jetzt())));
  },
  wiederAufnehmen: ({ i }) => {
    const e = offeneEinheit(zustand.einheiten);
    if (e) setze(mitEinheit(nimmWiederAuf(e, Number(i), jetzt())));
    ui.blatt = null;
  },
  auslassen: ({ i }) => {
    const e = offeneEinheit(zustand.einheiten);
    if (!e) return;
    const idx = Number(i);
    setze(mitEinheit(lasseAus(e, idx, jetzt())));
    ui.blatt = null;
    if (route().name === 'uebung') {
      const weiter = naechsteOffene(offeneEinheit(zustand.einheiten), idx + 1);
      geheZu(weiter >= 0 ? `#/uebung/${weiter}` : '#/einheit');
    }
    zeigeToast(`${eintragName(zustand.programm, e.uebungen[idx])} heute ausgelassen`, () => {
      const akt = offeneEinheit(zustand.einheiten);
      if (akt?.id === e.id) setze(mitEinheit(nimmWiederAuf(akt, idx, jetzt())));
    });
  },
  beenden: () => {
    const e = offeneEinheit(zustand.einheiten);
    if (!e) return geheZu('#/start');
    if (!hatSaetze(e)) {
      setze(mitEinheit(verwerfe(e, jetzt())));
      geheZu('#/start');
      return zeigeToast('Leere Einheit verworfen');
    }
    const fertig = beende(e, jetzt());
    setze(mitEinheit(fertig));
    geheZu('#/start');
    zeigeToast(`Einheit ${e.programmName} gespeichert`, () => {
      const akt = zustand.einheiten.find((x) => x.id === fertig.id);
      if (akt?.beendet !== fertig.beendet || offeneEinheit(zustand.einheiten)) return;
      clearTimeout(syncTimer);
      setze(mitEinheit(oeffneWieder(akt, jetzt())));
      geheZu('#/einheit');
    });
    return syncSpaeter(8000);
  },
  verwerfen: () => {
    const e = offeneEinheit(zustand.einheiten);
    if (!e) return undefined;
    setze(mitEinheit(verwerfe(e, jetzt())));
    geheZu('#/start');
    return zeigeToast(`Einheit ${e.programmName} verworfen`, () => {
      if (!offeneEinheit(zustand.einheiten)) setze(mitEinheit({ ...e, aktualisiert: jetzt().toISOString() }));
      geheZu('#/einheit');
    });
  },

  // Blätter (Ersetzen, Auswahl)
  menue: ({ i }) => {
    ui.blatt = { art: 'menue', i: Number(i) };
  },
  blattZu: () => {
    ui.blatt = null;
  },
  ersetzenOeffnen: ({ i }) => {
    ui.blatt = { art: 'wahl', zweck: 'ersetzen', i: Number(i) };
  },
  waehlen: ({ zweck, id, i }) => {
    ui.blatt = { art: 'wahl', zweck, id, i: i === undefined ? null : Number(i) };
  },
  gewaehlt: ({ zweck, id }) => waehleUebung(zweck, id),
  neueGewaehlt: ({ zweck }) => {
    const name = wurzel.querySelector('.suche')?.value.trim();
    if (!name) return;
    const { programm, id } = mitNeuerUebung(zustand.programm, name);
    if (!setzeProgramm(programm)) return;
    waehleUebung(zweck, id);
  },

  rueckgaengig: () => {
    const t = ui.toast;
    ui.toast = null;
    t?.rueckgaengig?.();
  },

  // Programm bearbeiten
  platzHoch: ({ id, i }) => setzeProgramm(bearbeiten.verschiebePlatz(zustand.programm, id, Number(i), -1)),
  platzRunter: ({ id, i }) => setzeProgramm(bearbeiten.verschiebePlatz(zustand.programm, id, Number(i), 1)),
  platzEntfernen: ({ id, i }) => setzeProgramm(bearbeiten.entfernePlatz(zustand.programm, id, Number(i)), 'Übung aus dem Programm genommen'),
  varianteEntfernen: ({ id, i, uebung }) => setzeProgramm(bearbeiten.entferneVariante(zustand.programm, id, Number(i), uebung), 'Variante entfernt'),
  auszugAnzahl: ({ id, richtung }) => {
    const pr = programmNach(zustand.programm, id);
    const max = plaetzeVon(zustand.programm, pr.auszug.programm).length;
    const anzahl = Math.min(Math.max(1, pr.auszug.anzahl + Number(richtung)), Math.max(1, max));
    setzeProgramm(bearbeiten.aendereProgramm(zustand.programm, id, { auszug: { ...pr.auszug, anzahl } }));
  },
  programmLoeschen: ({ id }) => {
    const r = bearbeiten.loescheProgramm(zustand.programm, id);
    if (r.fehler) return zeigeToast(r.fehler);
    geheZu('#/programm');
    return setzeProgramm(r.programm, 'Programm gelöscht');
  },
  uebungLoeschen: ({ id }) => {
    const r = bearbeiten.loescheUebung(zustand.programm, id, zustand.einheiten.some((e) => e.uebungen.some((u) => u.uebung === id && u.saetze.length)));
    if (r.fehler) return zeigeToast(r.fehler);
    geheZu('#/programm');
    return setzeProgramm(r.programm, 'Übung gelöscht');
  },
  phaseOhneDatum: ({ id }) => setzeProgramm(bearbeiten.aenderePhase(zustand.programm, id, { ab: null })),
  phaseSaetze: ({ id, rolle, richtung }) => {
    const ph = zustand.programm.phasen.find((x) => x.id === id);
    const v = ph.vorgaben[rolle] ?? { saetze: 3, reserve: null };
    const vorgaben = { ...ph.vorgaben, [rolle]: { ...v, saetze: Math.min(20, Math.max(1, v.saetze + Number(richtung))) } };
    setzeProgramm(bearbeiten.aenderePhase(zustand.programm, id, { vorgaben }));
  },
  phaseLoeschen: ({ id }) => {
    geheZu('#/programm');
    return setzeProgramm(bearbeiten.loeschePhase(zustand.programm, id), 'Phase gelöscht');
  },
  rotHoch: ({ i }) => rotation((r) => tausche(r, Number(i), Number(i) - 1)),
  rotRunter: ({ i }) => rotation((r) => tausche(r, Number(i), Number(i) + 1)),
  rotRaus: ({ i }) => rotation((r) => r.filter((_, k) => k !== Number(i))),
  rotRein: ({ id }) => rotation((r) => [...r, id]),

  // Konflikt
  konfliktRepo: () => {
    setze(loeseKonflikt(zustand, 'repo'));
    geheZu('#/start');
    zeigeToast('Fassung aus dem Repo übernommen');
    return syncStarten();
  },
  konfliktMeins: () => {
    setze(loeseKonflikt(zustand, 'meins'));
    geheZu('#/start');
    zeigeToast('Deine Fassung wird ins Repo geschrieben');
    return syncStarten();
  },

  // Einstellungen und Daten
  jetztSync: () => {
    syncStarten();
  },
  tokenEntfernen: () => {
    einstellungen = { ...einstellungen, token: '', tokenBis: '' };
    speicher.speichereEinstellungen(einstellungen);
    zeigeToast('Token entfernt – Daten bleiben auf dem Gerät');
  },
  exportJson: () => herunterladen(exportJson(zustand, { jetzt: jetzt(), appVersion: VERSION }), exportDateiname('json', jetzt()), 'application/json'),
  exportCsv: () => herunterladen(exportCsv(zustand), exportDateiname('csv', jetzt()), 'text/csv'),
};

function tausche(liste, a, b) {
  const r = [...liste];
  if (b < 0 || b >= r.length) return r;
  [r[a], r[b]] = [r[b], r[a]];
  return r;
}

function rotation(aenderung) {
  setzeProgramm(bearbeiten.setzeRotation(zustand.programm, aenderung(zustand.programm.rotation)));
}

function waehleUebung(zweck, id) {
  const b = ui.blatt;
  ui.blatt = null;
  if (zweck === 'ersetzen') {
    const e = offeneEinheit(zustand.einheiten);
    if (!e) return;
    const r = ersetzeHeute(zustand.programm, e, b.i, id, jetzt());
    setze(mitEinheit(r.einheit));
    geheZu(`#/uebung/${r.index}`);
    zeigeToast(`Heute: ${uebungNach(zustand.programm, id)?.name}`);
  } else if (zweck === 'platz') {
    setzeProgramm(bearbeiten.fuegePlatzHinzu(zustand.programm, b.id, id));
  } else if (zweck === 'variante') {
    setzeProgramm(bearbeiten.fuegeVarianteHinzu(zustand.programm, b.id, b.i, id));
  }
}

// Eingaben, die beim Verlassen des Felds (change) übernommen werden. Kein Neuzeichnen bei
// Textfeldern: sonst ginge der Tipp auf den nächsten Knopf verloren.
const felder = {
  programmFeld: (wert, { id, feld }) => {
    if (feld === 'name' && !wert.trim()) return false;
    return setzeProgramm(bearbeiten.aendereProgramm(zustand.programm, id, { [feld]: feld === 'name' ? wert.trim() : wert || null })) && feld === 'zaehltAls';
  },
  auszugQuelle: (wert, { id }) => {
    const pr = programmNach(zustand.programm, id);
    setzeProgramm(bearbeiten.aendereProgramm(zustand.programm, id, { auszug: { programm: wert, anzahl: Math.min(pr.auszug.anzahl, plaetzeVon(zustand.programm, wert).length || 1) } }));
    return true;
  },
  auszugSchalter: (an, { id }) => {
    const p = zustand.programm;
    const pr = programmNach(p, id);
    if (an) {
      const quelle = p.programme.find((x) => x.id !== id && !x.auszug);
      if (!quelle) {
        zeigeToast('Es gibt kein anderes Programm, aus dem die Übungen kommen könnten.');
        return true;
      }
      setzeProgramm(bearbeiten.aendereProgramm(p, id, { auszug: { programm: quelle.id, anzahl: Math.min(3, plaetzeVon(p, quelle.id).length || 1) }, zaehltAls: pr.zaehltAls ?? quelle.id }), pr.plaetze?.length ? 'Eigene Übungsliste ersetzt' : null);
    } else {
      setzeProgramm(bearbeiten.aendereProgramm(p, id, { auszug: null, plaetze: plaetzeVon(p, id) }));
    }
    return true;
  },
  platzName: (wert, { id, i }) => setzeProgramm(bearbeiten.aenderePlatz(zustand.programm, id, Number(i), { name: wert.trim() || null })) && false,
  uebungFeld: (wert, { id, feld }) => {
    let v = wert;
    if (feld === 'name') {
      v = wert.trim();
      if (!v) return true;
    }
    if (feld === 'schritt') {
      v = parseZahl(wert);
      if (!(v > 0)) {
        zeigeToast('Schrittgröße muss größer als 0 sein.');
        return true;
      }
    }
    if (feld === 'hinweis') v = wert.trim();
    setzeProgramm(bearbeiten.aendereUebung(zustand.programm, id, { [feld]: v }));
    return feld === 'messart' || feld === 'rolle';
  },
  spanne: (wert, { id, teil }, el) => {
    const u = uebungNach(zustand.programm, id);
    const andere = el.closest('fieldset').querySelector(`[data-teil="${teil === '0' ? 1 : 0}"]`).value;
    const werte = teil === '0' ? [parseZahl(wert), parseZahl(andere)] : [parseZahl(andere), parseZahl(wert)];
    if (werte.every((x) => x === null)) return setzeProgramm(bearbeiten.aendereUebung(zustand.programm, id, { spanne: null }));
    if (!werte.every((x) => x > 0) || werte[0] > werte[1]) {
      if (werte.every((x) => x > 0)) zeigeToast('„von“ muss kleiner oder gleich „bis“ sein.');
      return false;
    }
    if (JSON.stringify(werte) !== JSON.stringify(u.spanne)) setzeProgramm(bearbeiten.aendereUebung(zustand.programm, id, { spanne: werte }));
    return false;
  },
  archiviert: (an, { id }) => setzeProgramm(bearbeiten.aendereUebung(zustand.programm, id, { archiviert: an })),
  phaseFeld: (wert, { id, feld }) => {
    if (feld === 'name' && !wert.trim()) return true;
    setzeProgramm(bearbeiten.aenderePhase(zustand.programm, id, { [feld]: feld === 'ab' ? wert || null : wert.trim() }));
    return feld === 'ab';
  },
  phaseReserve: (wert, { id, rolle }) => {
    const ph = zustand.programm.phasen.find((x) => x.id === id);
    const v = ph.vorgaben[rolle] ?? { saetze: 3 };
    setzeProgramm(bearbeiten.aenderePhase(zustand.programm, id, { vorgaben: { ...ph.vorgaben, [rolle]: { ...v, reserve: wert.trim() || null } } }));
    return false;
  },
  import: async (_, __, el) => {
    const datei = el.files?.[0];
    if (!datei) return false;
    try {
      const r = importiere(zustand, await datei.text());
      setze(r.zustand);
      zeigeToast(`${r.neu} ${r.neu === 1 ? 'Einheit' : 'Einheiten'} importiert${r.programmUebernommen ? ', Programm übernommen' : ''}`);
      syncStarten();
    } catch (e) {
      zeigeToast(e.message);
    }
    el.value = '';
    return true;
  },
};

const formulare = {
  neuesProgramm: (d) => {
    const { programm, id } = bearbeiten.neuesProgramm(zustand.programm, d.get('name'));
    if (setzeProgramm(programm)) geheZu(`#/programm/${id}`);
  },
  neuePhase: (d) => {
    const { programm, id } = bearbeiten.neuePhase(zustand.programm, d.get('name'));
    if (setzeProgramm(programm)) geheZu(`#/phase/${id}`);
  },
  neueUebung: (d) => {
    const { programm, id } = mitNeuerUebung(zustand.programm, d.get('name'));
    if (setzeProgramm(programm)) geheZu(`#/katalog/${id}`);
  },
  einstellungen: (d, form) => {
    const tokenFeld = form.elements.token;
    let token = String(d.get('token') ?? '').trim();
    if (tokenFeld.dataset.gesetzt === 'ja' && token === '••••••••') token = einstellungen.token;
    const repo = String(d.get('repo')).trim().replace(/^https:\/\/github\.com\//, '').replace(/\/+$/, '');
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return zeigeToast('Repo bitte als besitzer/name angeben.');
    const ordner = String(d.get('ordner')).trim().replace(/^\/+|\/+$/g, '');
    if (!ordner || ordner.split('/').some((t) => !t || t === '.' || t === '..')) return zeigeToast('Ordner ist ungültig.');
    einstellungen = { ...einstellungen, token, tokenBis: String(d.get('tokenBis') ?? ''), repo, ordner, branch: String(d.get('branch')).trim() };
    speicher.speichereEinstellungen(einstellungen);
    if (!token) return zeigeToast('Gespeichert. Ohne Token bleiben die Daten nur auf diesem Gerät.');
    zeigeToast('Gespeichert');
    return syncStarten();
  },
};

// ---------- Herunterladen (iPhone: Teilen-Menü, sonst Download) ----------

async function herunterladen(inhalt, name, typ) {
  const datei = new File([inhalt], name, { type: typ });
  if (navigator.canShare?.({ files: [datei] }) && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
    try {
      await navigator.share({ files: [datei], title: name });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(datei);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// ---------- Sync ----------

let syncTimer = null;
let syncNochmal = false;

async function syncStarten() {
  clearTimeout(syncTimer);
  syncTimer = null;
  if (!einstellungen.token || !zustand) return zeichne();
  if (ui.sync.laeuft) {
    syncNochmal = true;
    return undefined;
  }
  ui.sync.laeuft = true;
  zeichne();
  try {
    const api = erstelleGithubApi({ token: einstellungen.token, repo: einstellungen.repo });
    const vorher = zustand.programm;
    const erg = await synchronisiere(zustand, { api, branch: einstellungen.branch, ordner: einstellungen.ordner, appVersion: VERSION });
    setze(wendeSyncAn(zustand, erg));
    if (erg.programm.aktion === 'uebernommen' && zustand.programm !== vorher) zeigeToast('Programm aus dem Repo übernommen');
    if (erg.programm.aktion === 'konflikt') zeigeToast('Programm an zwei Stellen geändert – bitte wählen');
  } catch (e) {
    const fehler = e instanceof SyncFehler ? e : new SyncFehler('unbekannt', `Sync fehlgeschlagen: ${e.message}`);
    setze(mitSyncFehler(zustand, fehler, jetzt()));
  } finally {
    ui.sync.laeuft = false;
    zeichne();
  }
  if (syncNochmal) {
    syncNochmal = false;
    return syncStarten();
  }
  return undefined;
}

function syncSpaeter(ms) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncStarten, ms);
}

// Wartet etwas auf den Sync und war der letzte Versuch offline: regelmäßig neu probieren.
setInterval(() => {
  if (zustand && einstellungen.token && !ui.sync.laeuft && zustand.sync.fehler?.art === 'offline' && wartetAufSync(zustand) && navigator.onLine !== false) syncStarten();
}, 60000);
window.addEventListener('online', () => syncStarten());
document.addEventListener('visibilitychange', () => {
  if (!zustand) return;
  if (document.visibilityState === 'hidden') {
    if (syncTimer) syncStarten(); // App geht in den Hintergrund: ausstehenden Sync nicht verschieben
    return;
  }
  pruefeVergessene();
  const zuletzt = zustand.sync.letzterVersuch ? Date.parse(zustand.sync.letzterVersuch) : 0;
  if (wartetAufSync(zustand) || Date.now() - zuletzt > 5 * 60000) syncStarten();
  zeichne();
});

function pruefeVergessene() {
  const r = beendeVergessene(zustand.einheiten, jetzt());
  if (!r.beendet.length) return;
  setze({ ...zustand, einheiten: r.einheiten });
  if (['einheit', 'uebung'].includes(route().name)) location.replace('#/start');
  zeigeToast('Offene Einheit vom letzten Mal wurde beendet');
}

// ---------- Zeichnen ----------

function blattAnsicht(s) {
  const b = ui.blatt;
  if (!b) return '';
  if (b.art === 'menue') {
    const e = offeneEinheit(zustand.einheiten);
    const eintrag = e?.uebungen[b.i];
    if (!eintrag) return '';
    const varianten = eintrag.varianten.length > 1 && !eintrag.saetze.length
      ? html`<p class="etikett">Variante</p><div class="auswahl">${eintrag.varianten.map((id) => html`<button class="knopf chip ${id === eintrag.uebung ? 'an' : ''}" data-a="variante" data-i="${b.i}" data-id="${id}">${uebungNach(zustand.programm, id)?.name ?? id}</button>`)}</div>`
      : '';
    return blatt({
      titel: eintragName(zustand.programm, eintrag),
      inhalt: html`${varianten}
        <p class="leise">Gilt nur für heute – das Programm bleibt, wie es ist.</p>
        <button class="knopf zweit breit" data-a="ersetzenOeffnen" data-i="${b.i}">Nur heute ersetzen</button>
        ${eintrag.ausgelassen
          ? html`<button class="knopf zweit breit" data-a="wiederAufnehmen" data-i="${b.i}">Doch machen</button>`
          : html`<button class="knopf zweit breit" data-a="auslassen" data-i="${b.i}">Heute auslassen</button>`}`,
    });
  }
  if (b.art === 'wahl') {
    const titel = { ersetzen: 'Heute ersetzen durch', platz: 'Übung hinzufügen', variante: 'Variante hinzufügen' }[b.zweck];
    const e = offeneEinheit(zustand.einheiten);
    const ausser = b.zweck === 'ersetzen' ? [e?.uebungen[b.i]?.uebung] : b.zweck === 'variante' ? programmNach(zustand.programm, b.id)?.plaetze?.[b.i]?.varianten ?? [] : [];
    return blatt({ titel, inhalt: uebungsWahl(s, { titel, zweck: b.zweck, ausser, neuText: 'Als neue Übung anlegen' }) });
  }
  return '';
}

let gezeichneteRoute = null;

function zeichne() {
  if (!zustand) return;
  const r = route();
  const s = { zustand, einstellungen, ui, jetzt: jetzt() };
  const offen = offeneEinheit(zustand.einheiten);
  let inhalt;
  if ((r.name === 'einheit' || r.name === 'uebung') && !offen) {
    location.replace('#/start');
    return;
  }
  if (r.name === 'uebung' && !offen.uebungen[Number(r.param)]) {
    location.replace('#/einheit');
    return;
  }
  switch (r.name) {
    case 'einheit': inhalt = einheitAnsicht(s, offen); break;
    case 'uebung': inhalt = uebungAnsicht(s, offen, Number(r.param), uebungInfo(offen, Number(r.param))); break;
    case 'programm': inhalt = r.param ? programmBearbeiten(s, r.param) : programmUebersicht(s); break;
    case 'katalog': inhalt = katalogBearbeiten(s, r.param); break;
    case 'phase': inhalt = phaseBearbeiten(s, r.param); break;
    case 'rotation': inhalt = rotationBearbeiten(s); break;
    case 'einstellungen': inhalt = einstellungenAnsicht(s); break;
    case 'konflikt': inhalt = konfliktAnsicht(s); break;
    default: inhalt = startAnsicht(s);
  }
  const schluessel = location.hash;
  const scroll = schluessel === gezeichneteRoute ? window.scrollY : 0;
  const fokus = document.activeElement?.closest?.('#app') ? document.activeElement.dataset.f : null;
  wurzel.innerHTML = text(inhalt) + text(blattAnsicht(s));
  // Toast im Daumenbereich: über den Knöpfen statt über der Überschrift. Die Knöpfe bleiben,
  // wo sie sind, weil der Bereich unten verankert ist.
  if (ui.toast) {
    const daumen = wurzel.querySelector('.daumen');
    if (daumen) daumen.insertAdjacentHTML('afterbegin', text(toastAnsicht(ui.toast)));
    else wurzel.insertAdjacentHTML('beforeend', text(toastAnsicht(ui.toast)));
  }
  wurzel.dataset.seite = r.name;
  document.body.classList.toggle('mit-blatt', !!ui.blatt);
  window.scrollTo(0, scroll);
  gezeichneteRoute = schluessel;
  if (fokus === 'suche') wurzel.querySelector('.suche')?.focus();
}

// ---------- Ereignisse ----------

wurzel.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-a]');
  if (!el || el.disabled || !wurzel.contains(el)) return;
  const aktion = aktionen[el.dataset.a];
  if (!aktion) return;
  ev.preventDefault();
  const ergebnis = aktion({ ...el.dataset }, el);
  if (!(ergebnis instanceof Promise)) zeichne();
});

wurzel.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.dataset.f === 'entwurf' && ui.entwurf) {
    ui.entwurf.werte[el.dataset.feld] = parseZahl(el.value);
  } else if (el.dataset.f === 'suche') {
    const q = el.value.trim().toLowerCase();
    let exakt = false;
    for (const li of wurzel.querySelectorAll('[data-suchtext]')) {
      li.hidden = !!q && !li.dataset.suchtext.includes(q);
      if (li.dataset.suchtext === q) exakt = true;
    }
    const neu = wurzel.querySelector('.neu-uebung');
    if (neu) {
      neu.hidden = !q || exakt;
      neu.textContent = `„${el.value.trim()}“ als neue Übung anlegen`;
    }
  }
});

wurzel.addEventListener('change', async (ev) => {
  const el = ev.target;
  const feld = felder[el.dataset.f];
  if (!feld) return;
  const wert = el.type === 'checkbox' ? el.checked : el.value;
  const neuZeichnen = await feld(wert, { ...el.dataset }, el);
  if (neuZeichnen || el.tagName === 'SELECT' || el.type === 'checkbox') zeichne();
});

wurzel.addEventListener('submit', (ev) => {
  const form = ev.target.closest('[data-form]');
  if (!form) return;
  ev.preventDefault();
  const name = form.dataset.form;
  formulare[name]?.(new FormData(form), form);
  zeichne();
});

wurzel.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && ev.target.dataset?.f === 'entwurf') ev.target.blur();
});

// ---------- Start ----------

async function starte() {
  try {
    zustand = speicher.ladeZustand();
  } catch (e) {
    wurzel.innerHTML = text(html`<div class="seite"><section class="abschnitt">
      <h1>Gerätespeicher nicht lesbar</h1><p>${e.message}</p>
      <p>Die Rohdaten sind unverändert im Browser. Neu laden oder die App aktualisieren hilft meist.</p></section></div>`);
    return;
  }
  if (!zustand) {
    const antwort = await fetch('startinhalt/programm.json');
    zustand = neuerZustand(leseProgramm(await antwort.text()));
    speichern();
  }
  pruefeVergessene();
  zeichne();
  navigator.storage?.persist?.().catch(() => {});
  syncStarten();
}

meldeServiceWorkerAn();
starte();
