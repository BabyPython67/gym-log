// Sync mit dem Daten-Repo (Standard: BabyPython67/claude-projekte, Ordner gym/).
//
// Ablauf je Versuch:
//   1. Branch-Kopf, Wurzelbaum und Inhalt von gym/ lesen (nur geänderte Dateien herunterladen).
//   2. Einheiten aus dem Repo mit den lokalen zusammenführen (je ID gewinnt die neuere).
//   3. programm.json dreiseitig abgleichen: Basis (Stand beim letzten Sync), Gerät, Repo.
//      Haben beide Seiten geändert, wird nichts überschrieben: Ergebnis „konflikt“.
//   4. Gewünschte Dateien erzeugen und per Git-SHA mit dem Repo vergleichen; nur
//      abweichende kommen in EINEN Commit (Git-Data-API, base_tree = aktueller Baum).
//   5. Branch vorspulen (force: false). Hat ein anderer (z. B. der Garmin-Sync) dazwischen
//      gepusht, lehnt GitHub ab → alles neu laden und wiederholen.
// Geschrieben wird ausschließlich unterhalb des Ordners.
//
// synchronisiere() verändert den Zustand nicht, sondern liefert ein Ergebnis, das
// wendeSyncAn() auf den dann aktuellen Zustand anwendet – so gehen Sätze, die während
// des Syncs eingetragen werden, nicht verloren.

import { FormatFehler, JAHRES_MUSTER, fuehreZusammen, jahresDatei, jahresText, jsonText, leseJahresdatei, leseProgramm } from './datenformat.js';
import { SyncFehler, gitBlobSha } from './github.js';
import { sichereHistorie } from './programm.js';
import { standText, uebersichtText } from './texte.js';
import { lokalesDatum } from './zeit.js';

export function normalisiereOrdner(ordner) {
  const o = (ordner ?? '').trim().replace(/^\/+|\/+$/g, '');
  if (!o || o.split('/').some((t) => !t || t === '.' || t === '..')) throw new SyncFehler('daten', `Ordner „${ordner}“ ist ungültig.`);
  return o;
}

async function ordnerInhalt(api, wurzelBaum, ordner) {
  let sha = wurzelBaum;
  for (const teil of ordner.split('/')) {
    const e = (await api.baum(sha)).find((x) => x.path === teil && x.type === 'tree');
    if (!e) return new Map();
    sha = e.sha;
  }
  return new Map((await api.baum(sha, true)).filter((x) => x.type === 'blob').map((x) => [x.path, x.sha]));
}

function commitNachricht(geaenderte, programmAktion) {
  const teile = [];
  const aktiv = geaenderte.filter((e) => !e.geloescht);
  const geloescht = geaenderte.filter((e) => e.geloescht);
  if (aktiv.length === 1) teile.push(`Einheit ${aktiv[0].programmName ?? aktiv[0].programm} vom ${aktiv[0].datum}`);
  else if (aktiv.length > 1) teile.push(`${aktiv.length} Einheiten (${aktiv[0].datum} bis ${aktiv[aktiv.length - 1].datum})`);
  if (geloescht.length) teile.push(`${geloescht.length === 1 ? `Einheit vom ${geloescht[0].datum}` : `${geloescht.length} Einheiten`} gelöscht`);
  if (programmAktion === 'angelegt') teile.push('programm.json angelegt');
  else if (programmAktion) teile.push('Programm geändert');
  return `gym: ${teile.join(', ') || 'Übersicht aktualisiert'}`;
}

export async function synchronisiere(zustand, { api, branch: gewaehlterBranch = '', ordner: ordnerRoh = 'gym', jetzt = () => new Date(), appVersion = '', maxVersuche = 5 }) {
  const ordner = normalisiereOrdner(ordnerRoh);
  const branch = gewaehlterBranch || (await api.standardBranch());
  const lokalProgrammText = jsonText(zustand.programm);
  const basisText = zustand.sync.programmBasis;
  const cache = { ...zustand.sync.dateien };

  for (let versuch = 1; ; versuch++) {
    const kopf = await api.kopf(branch);
    const wurzel = await api.baumVonCommit(kopf);
    const imRepo = await ordnerInhalt(api, wurzel, ordner);
    const lade = async (rel) => {
      const sha = imRepo.get(rel);
      if (!sha) return null;
      if (cache[rel]?.sha !== sha) cache[rel] = { sha, text: await api.blob(sha) };
      return cache[rel].text;
    };

    // 1.–2. Einheiten
    const repoJahre = {};
    for (const rel of imRepo.keys()) {
      if (!JAHRES_MUSTER.test(rel)) continue;
      try {
        repoJahre[rel] = leseJahresdatei(await lade(rel), `${ordner}/${rel}`);
      } catch (e) {
        if (e instanceof FormatFehler) throw new SyncFehler('daten', `${e.message} Bitte die Datei im Repo reparieren; bis dahin bleibt alles auf dem Gerät.`);
        throw e;
      }
    }
    const einheiten = fuehreZusammen(zustand.einheiten, ...Object.values(repoJahre));

    // 3. Programm
    let warnung = null;
    let repoProgramm = null;
    const repoText = await lade('programm.json');
    if (repoText != null) {
      try {
        repoProgramm = leseProgramm(repoText);
      } catch (e) {
        if (!(e instanceof FormatFehler)) throw e;
        warnung = `programm.json im Repo wird nicht übernommen. ${e.message}`;
      }
    }
    const repoKanon = repoProgramm ? jsonText(repoProgramm) : null;
    let aktion;
    let neuesProgramm = null;
    let zuSchreiben = null;
    let konflikt = null;
    if (repoText == null) {
      aktion = 'angelegt';
      zuSchreiben = zustand.programm;
    } else if (!repoProgramm) {
      aktion = 'ungueltig';
    } else if (repoKanon === lokalProgrammText) {
      aktion = 'gleich';
    } else if (!zustand.programmGeaendert) {
      aktion = 'uebernommen';
      const gesichert = sichereHistorie(repoProgramm, einheiten, zustand.programm.uebungen);
      neuesProgramm = gesichert.programm;
      if (gesichert.ergaenzt.length) zuSchreiben = neuesProgramm;
    } else if (basisText != null && repoKanon === basisText) {
      aktion = 'geschrieben';
      zuSchreiben = zustand.programm;
    } else {
      aktion = 'konflikt';
      konflikt = { repo: repoProgramm, basis: basisText ? JSON.parse(basisText) : null, seit: jetzt().toISOString() };
    }

    // 4. Gewünschte Dateien
    const schreiben = [];
    const geaenderteEinheiten = [];
    const jahre = new Set(Object.keys(repoJahre));
    for (const e of einheiten) if (e.beendet || e.geloescht) jahre.add(jahresDatei(e.datum));
    for (const rel of [...jahre].sort()) {
      const alt = new Map((repoJahre[rel] ?? []).map((e) => [e.id, e]));
      const inhalt = [];
      for (const e of einheiten) {
        if (jahresDatei(e.datum) !== rel) continue;
        if (e.beendet || (e.geloescht && alt.has(e.id))) {
          inhalt.push(e);
          if (alt.get(e.id)?.aktualisiert !== e.aktualisiert) geaenderteEinheiten.push(e);
        } else if (alt.has(e.id)) {
          inhalt.push(alt.get(e.id)); // wieder geöffnet: bis zum Beenden bleibt die alte Fassung stehen
        }
      }
      const text = jahresText(inhalt);
      if ((await gitBlobSha(text)) !== imRepo.get(rel)) schreiben.push({ rel, text });
    }
    if (zuSchreiben) schreiben.push({ rel: 'programm.json', text: jsonText(zuSchreiben) });

    const zeit = jetzt();
    if (schreiben.length) {
      const fuerTexte = neuesProgramm ?? zustand.programm;
      const texte = [
        ['uebersicht.md', uebersichtText(fuerTexte, einheiten)],
        ['stand.md', standText(fuerTexte, einheiten, { jetzt: zeit, appVersion, datum: lokalesDatum(zeit) })],
      ];
      for (const [rel, text] of texte) if ((await gitBlobSha(text)) !== imRepo.get(rel)) schreiben.push({ rel, text });
    }

    // 5. Ein Commit
    let commit = null;
    if (schreiben.length) {
      const baum = await api.erstelleBaum(wurzel, schreiben.map(({ rel, text }) => ({ path: `${ordner}/${rel}`, mode: '100644', type: 'blob', content: text })));
      commit = await api.erstelleCommit(commitNachricht(geaenderteEinheiten, zuSchreiben ? aktion : null), baum, [kopf]);
      try {
        await api.setzeKopf(branch, commit);
      } catch (e) {
        if (e instanceof SyncFehler && e.art === 'veraltet' && versuch < maxVersuche) continue;
        if (e instanceof SyncFehler && e.art === 'veraltet') throw new SyncFehler('veraltet', 'Das Repo ändert sich gerade laufend. Später noch einmal versuchen.');
        throw e;
      }
    }

    const dateien = {};
    for (const rel of imRepo.keys()) if (cache[rel] && (JAHRES_MUSTER.test(rel) || rel === 'programm.json')) dateien[rel] = cache[rel];
    for (const { rel, text } of schreiben) if (JAHRES_MUSTER.test(rel) || rel === 'programm.json') dateien[rel] = { sha: await gitBlobSha(text), text };

    let programmBasis = basisText;
    if (zuSchreiben) programmBasis = jsonText(zuSchreiben);
    else if (aktion === 'gleich' || aktion === 'uebernommen') programmBasis = repoKanon;

    return {
      branch,
      commit,
      versuche: versuch,
      geschrieben: schreiben.map((s) => `${ordner}/${s.rel}`),
      einheiten,
      lokalProgrammText,
      programm: { aktion, neu: neuesProgramm, konflikt },
      sync: { dateien, programmBasis, letzterErfolg: zeit.toISOString(), warnung },
    };
  }
}

// Ergebnis auf den aktuellen Zustand anwenden (der sich während des Syncs geändert haben kann).
export function wendeSyncAn(aktuell, erg) {
  const einheiten = fuehreZusammen(aktuell.einheiten, erg.einheiten);
  const unveraendert = jsonText(aktuell.programm) === erg.lokalProgrammText;
  let { programm, programmGeaendert } = aktuell;
  let programmBasis = erg.sync.programmBasis;
  const { aktion } = erg.programm;
  if (unveraendert) {
    if (aktion === 'uebernommen') programm = erg.programm.neu;
    if (aktion !== 'konflikt' && aktion !== 'ungueltig') programmGeaendert = false;
  } else if (aktion === 'uebernommen') {
    // Während des Syncs lokal bearbeitet: Basis nicht vorrücken, sonst würde der nächste
    // Sync die Repo-Änderung still überschreiben. So meldet er sauber einen Konflikt.
    programmBasis = aktuell.sync.programmBasis;
  }
  return {
    ...aktuell,
    einheiten,
    programm,
    programmGeaendert,
    sync: {
      ...aktuell.sync,
      dateien: erg.sync.dateien,
      programmBasis,
      letzterErfolg: erg.sync.letzterErfolg,
      letzterVersuch: erg.sync.letzterErfolg,
      warnung: erg.sync.warnung,
      fehler: null,
      konflikt: erg.programm.konflikt,
      branch: erg.branch,
    },
  };
}

export function mitSyncFehler(zustand, fehler, jetzt) {
  return {
    ...zustand,
    sync: { ...zustand.sync, letzterVersuch: jetzt.toISOString(), fehler: { art: fehler.art ?? 'unbekannt', text: fehler.message, zeit: jetzt.toISOString() } },
  };
}

// Konflikt auflösen: 'repo' übernimmt die Fassung aus dem Repo, 'meins' behält die des
// Geräts und schreibt sie beim nächsten Sync ins Repo.
export function loeseKonflikt(zustand, wahl) {
  const k = zustand.sync.konflikt;
  if (!k) return zustand;
  const sync = { ...zustand.sync, programmBasis: jsonText(k.repo), konflikt: null };
  if (wahl === 'repo') {
    const gesichert = sichereHistorie(k.repo, zustand.einheiten, zustand.programm.uebungen);
    return { ...zustand, programm: gesichert.programm, programmGeaendert: gesichert.ergaenzt.length > 0, sync };
  }
  return { ...zustand, programmGeaendert: true, sync };
}

// Gibt es lokal etwas, das noch nicht im Repo ist?
export function wartetAufSync(zustand) {
  if (zustand.programmGeaendert) return true;
  const bekannt = new Map();
  for (const [rel, d] of Object.entries(zustand.sync.dateien)) {
    if (!JAHRES_MUSTER.test(rel)) continue;
    try {
      for (const e of leseJahresdatei(d.text)) bekannt.set(e.id, e.aktualisiert);
    } catch { /* kaputter Cache: dann eben „wartet“ */ }
  }
  return zustand.einheiten.some((e) => (e.beendet || (e.geloescht && bekannt.has(e.id))) && bekannt.get(e.id) !== e.aktualisiert);
}
