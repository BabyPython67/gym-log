// Setzt die App-Version: Hash über alle ausgelieferten Dateien → src/version.js und sw.js
// (Versionskonstante und Dateiliste). Jede Änderung an einer Datei ändert damit sw.js, und
// der Browser übernimmt die neue Fassung beim nächsten Öffnen.
//
//   node scripts/version.mjs            aktualisieren
//   node scripts/version.mjs --pruefen  nur prüfen (Exit 1, wenn veraltet) – läuft in npm test
//   node scripts/version.mjs <ordner>   anderen Ordner (für den Update-Test)

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const pruefen = args.includes('--pruefen');
const wurzel = args.find((a) => !a.startsWith('--')) ?? fileURLToPath(new URL('..', import.meta.url));

const FEST = ['index.html', 'styles.css', 'manifest.webmanifest', 'startinhalt/programm.json'];
const ORDNER = ['src', 'icons'];

function alle(ordner) {
  return readdirSync(join(wurzel, ordner)).flatMap((name) => {
    const pfad = join(ordner, name);
    return statSync(join(wurzel, pfad)).isDirectory() ? alle(pfad) : [pfad];
  });
}

export function dateiliste() {
  return [...FEST, ...ORDNER.flatMap(alle)].map((p) => relative(wurzel, join(wurzel, p)).split('\\').join('/')).sort();
}

const dateien = dateiliste();
const hash = createHash('sha256');
for (const pfad of dateien) {
  if (pfad === 'src/version.js') continue;
  hash.update(`${pfad}\n`);
  hash.update(readFileSync(join(wurzel, pfad)));
}
const version = hash.digest('hex').slice(0, 10);

const versionJs = `// Von scripts/version.mjs erzeugt – nicht von Hand ändern.\nexport const VERSION = '${version}';\n`;
const swPfad = join(wurzel, 'sw.js');
const swAlt = readFileSync(swPfad, 'utf8');
const swNeu = swAlt
  .replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`)
  .replace(/const DATEIEN = \[[\s\S]*?\];/, `const DATEIEN = [\n  './',\n${dateien.map((d) => `  '${d}',`).join('\n')}\n];`);

let versionAlt = '';
try { versionAlt = readFileSync(join(wurzel, 'src/version.js'), 'utf8'); } catch { /* erstes Mal */ }

if (pruefen) {
  if (swNeu !== swAlt || versionJs !== versionAlt) {
    console.error(`Version veraltet (neu wäre ${version}). „npm run version“ ausführen und mit committen.`);
    process.exit(1);
  }
  console.log(`Version ${version} ist aktuell.`);
} else {
  writeFileSync(join(wurzel, 'src/version.js'), versionJs);
  writeFileSync(swPfad, swNeu);
  console.log(`Version ${version} (${dateien.length} Dateien)`);
}
