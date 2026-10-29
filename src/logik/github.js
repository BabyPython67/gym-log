// Schmaler Client für die GitHub-REST-API (Git-Data-API), nur was der Sync braucht.
// Der Token wird ausschließlich im Authorization-Header verschickt und taucht in keiner
// Fehlermeldung auf.

export class SyncFehler extends Error {
  constructor(art, text) {
    super(text);
    this.art = art; // offline | token | rechte | nicht-gefunden | leer | veraltet | limit | server | daten
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export function utf8ZuBase64(text) {
  const bytes = enc.encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ZuUtf8(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return dec.decode(bytes);
}

// SHA eines Git-Blobs: sha1("blob <länge>\0<inhalt>"). So lässt sich ohne Download
// vergleichen, ob eine Datei im Repo schon genau diesen Inhalt hat.
export async function gitBlobSha(text) {
  const inhalt = enc.encode(text);
  const kopf = enc.encode(`blob ${inhalt.length}\0`);
  const alles = new Uint8Array(kopf.length + inhalt.length);
  alles.set(kopf);
  alles.set(inhalt, kopf.length);
  const hash = await crypto.subtle.digest('SHA-1', alles);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function erstelleGithubApi({ token, repo, fetch: abruf = globalThis.fetch.bind(globalThis), basis = 'https://api.github.com' }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? '')) throw new SyncFehler('nicht-gefunden', `Repo „${repo}“ hat nicht die Form besitzer/name.`);

  async function anfrage(methode, pfad, body) {
    let res;
    try {
      res = await abruf(`${basis}/repos/${repo}${pfad}`, {
        method: methode,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });
    } catch {
      throw new SyncFehler('offline', 'Keine Verbindung zu GitHub. Die Daten bleiben auf dem Gerät und werden später gesichert.');
    }
    if (res.ok) return res.json();
    let meldung = '';
    try { meldung = (await res.json()).message ?? ''; } catch { /* Antwort ohne JSON */ }
    if (res.status === 401) throw new SyncFehler('token', 'Token ungültig oder abgelaufen. In den Einstellungen einen neuen eintragen.');
    if (res.status === 403 || res.status === 429) {
      if (res.headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(meldung)) throw new SyncFehler('limit', 'GitHub-Limit erreicht. Später klappt es wieder.');
      throw new SyncFehler('rechte', `Token darf nicht schreiben. Recht „Contents: Read and write“ für ${repo} prüfen.`);
    }
    if (res.status === 404) throw new SyncFehler('nicht-gefunden', `Repo ${repo} oder Branch nicht gefunden – oder der Token hat keinen Zugriff darauf.`);
    if (res.status === 409) throw new SyncFehler('leer', `Repo ${repo} ist leer. Einmal eine Datei (z. B. README) anlegen, dann klappt der Sync.`);
    if (res.status === 422 && methode === 'PATCH') throw new SyncFehler('veraltet', 'Branch hat sich inzwischen geändert.');
    throw new SyncFehler('server', `GitHub antwortet mit Fehler ${res.status}${meldung ? `: ${meldung}` : ''}.`);
  }

  return {
    repo,
    async standardBranch() {
      return (await anfrage('GET', '')).default_branch;
    },
    async kopf(branch) {
      return (await anfrage('GET', `/git/ref/heads/${encodeURIComponent(branch)}`)).object.sha;
    },
    async baumVonCommit(commitSha) {
      return (await anfrage('GET', `/git/commits/${commitSha}`)).tree.sha;
    },
    async baum(sha, rekursiv = false) {
      const t = await anfrage('GET', `/git/trees/${sha}${rekursiv ? '?recursive=1' : ''}`);
      if (t.truncated) throw new SyncFehler('daten', 'Ordnerinhalt zu groß für einen Abruf.');
      return t.tree;
    },
    async blob(sha) {
      const b = await anfrage('GET', `/git/blobs/${sha}`);
      return b.encoding === 'base64' ? base64ZuUtf8(b.content) : b.content;
    },
    async erstelleBaum(basisBaum, eintraege) {
      return (await anfrage('POST', '/git/trees', { base_tree: basisBaum, tree: eintraege })).sha;
    },
    async erstelleCommit(nachricht, baumSha, eltern) {
      return (await anfrage('POST', '/git/commits', { message: nachricht, tree: baumSha, parents: eltern })).sha;
    },
    async setzeKopf(branch, sha) {
      await anfrage('PATCH', `/git/refs/heads/${encodeURIComponent(branch)}`, { sha, force: false });
    },
  };
}
