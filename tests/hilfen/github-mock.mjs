// Nachgebaute GitHub-REST-API (Git-Data-API) für Tests: echte Git-Blob-SHAs, Bäume,
// Commits und ein Branch-Kopf, der nur vorgespult werden darf (wie bei force: false).
// mock.fetch hat dieselbe Form wie window.fetch.

import { createHash } from 'node:crypto';

const sha1 = (data) => createHash('sha1').update(data).digest('hex');

export function erstelleGithubMock({ repo = 'BabyPython67/claude-projekte', branch = 'main', token = 'test-token' } = {}) {
  const blobs = new Map();
  const baeume = new Map(); // sha → [{ path, mode, type, sha }]
  const commits = new Map(); // sha → { tree, parents, message }
  const refs = new Map();
  const anfragen = [];
  const mock = { offline: false, token, vorPatch: null, anfragen, repo, branch };

  function blob(text) {
    const inhalt = Buffer.from(text, 'utf8');
    const sha = sha1(Buffer.concat([Buffer.from(`blob ${inhalt.length}\0`), inhalt]));
    blobs.set(sha, text);
    return sha;
  }

  function baueBaum(dateien) {
    // dateien: Map pfad → blobSha (Pfade relativ zu diesem Baum)
    const gruppen = new Map();
    const eintraege = [];
    for (const [pfad, sha] of dateien) {
      const [kopf, ...rest] = pfad.split('/');
      if (!rest.length) eintraege.push({ path: kopf, mode: '100644', type: 'blob', sha });
      else {
        if (!gruppen.has(kopf)) gruppen.set(kopf, new Map());
        gruppen.get(kopf).set(rest.join('/'), sha);
      }
    }
    for (const [name, inhalt] of gruppen) eintraege.push({ path: name, mode: '040000', type: 'tree', sha: baueBaum(inhalt) });
    eintraege.sort((a, b) => (a.path < b.path ? -1 : 1));
    const sha = sha1(`tree ${JSON.stringify(eintraege)}`);
    baeume.set(sha, eintraege);
    return sha;
  }

  function flach(baumSha, praefix = '', mitBaeumen = false, ziel = new Map()) {
    for (const e of baeume.get(baumSha) ?? []) {
      const pfad = praefix + e.path;
      if (e.type === 'tree') {
        if (mitBaeumen) ziel.set(pfad, e);
        flach(e.sha, `${pfad}/`, mitBaeumen, ziel);
      } else ziel.set(pfad, mitBaeumen ? e : e.sha);
    }
    return ziel;
  }

  function commit(baum, eltern, nachricht) {
    const sha = sha1(`commit ${baum} ${eltern.join(',')} ${nachricht} ${commits.size}`);
    commits.set(sha, { tree: baum, parents: eltern, message: nachricht });
    return sha;
  }

  function istVorfahr(vorfahr, sha) {
    const offen = [sha];
    while (offen.length) {
      const s = offen.pop();
      if (s === vorfahr) return true;
      offen.push(...(commits.get(s)?.parents ?? []));
    }
    return false;
  }

  // Direkt ins Repo schreiben, als hätte jemand anderes gepusht (Garmin-Sync, Claude).
  mock.schreibe = (dateien, nachricht = 'extern') => {
    const kopf = refs.get(branch);
    const basis = kopf ? flach(commits.get(kopf).tree) : new Map();
    for (const [pfad, text] of Object.entries(dateien)) {
      if (text === null) basis.delete(pfad);
      else basis.set(pfad, blob(text));
    }
    refs.set(branch, commit(baueBaum(basis), kopf ? [kopf] : [], nachricht));
  };
  mock.dateien = () => {
    const kopf = refs.get(branch);
    const m = new Map();
    if (!kopf) return m;
    for (const [pfad, sha] of flach(commits.get(kopf).tree)) m.set(pfad, blobs.get(sha));
    return m;
  };
  mock.datei = (pfad) => mock.dateien().get(pfad) ?? null;
  mock.commits = () => {
    const liste = [];
    let s = refs.get(branch);
    while (s) {
      liste.push({ sha: s, ...commits.get(s) });
      s = commits.get(s).parents[0];
    }
    return liste;
  };
  mock.geaendertePfade = (commitSha) => {
    const c = commits.get(commitSha);
    const vorher = c.parents[0] ? flach(commits.get(c.parents[0]).tree) : new Map();
    const nachher = flach(c.tree);
    const pfade = new Set();
    for (const [p, s] of nachher) if (vorher.get(p) !== s) pfade.add(p);
    for (const p of vorher.keys()) if (!nachher.has(p)) pfade.add(p);
    return [...pfade].sort();
  };

  const antwort = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  mock.fetch = async (url, init = {}) => {
    if (mock.offline) throw new TypeError('Failed to fetch');
    const u = new URL(url);
    const methode = (init.method ?? 'GET').toUpperCase();
    anfragen.push({ methode, pfad: u.pathname + u.search });
    const auth = init.headers?.Authorization ?? init.headers?.authorization;
    if (auth !== `Bearer ${mock.token}`) return antwort(401, { message: 'Bad credentials' });
    const basis = `/repos/${repo}`;
    if (!u.pathname.startsWith(basis)) return antwort(404, { message: 'Not Found' });
    const rest = u.pathname.slice(basis.length);
    const body = init.body ? JSON.parse(init.body) : null;
    let m;

    if (methode === 'GET' && rest === '') return antwort(200, { full_name: repo, default_branch: branch });
    if (methode === 'GET' && (m = rest.match(/^\/git\/ref\/heads\/(.+)$/))) {
      const sha = refs.get(decodeURIComponent(m[1]));
      if (!sha) return refs.size ? antwort(404, { message: 'Not Found' }) : antwort(409, { message: 'Git Repository is empty.' });
      return antwort(200, { ref: `refs/heads/${m[1]}`, object: { sha, type: 'commit' } });
    }
    if (methode === 'GET' && (m = rest.match(/^\/git\/commits\/(\w+)$/))) {
      const c = commits.get(m[1]);
      return c ? antwort(200, { sha: m[1], tree: { sha: c.tree }, parents: c.parents.map((sha) => ({ sha })) }) : antwort(404, { message: 'Not Found' });
    }
    if (methode === 'GET' && (m = rest.match(/^\/git\/trees\/(\w+)$/))) {
      if (!baeume.has(m[1])) return antwort(404, { message: 'Not Found' });
      const eintraege = u.searchParams.get('recursive') ? [...flach(m[1], '', true).entries()].map(([path, e]) => ({ ...e, path })) : baeume.get(m[1]);
      return antwort(200, { sha: m[1], tree: eintraege, truncated: false });
    }
    if (methode === 'GET' && (m = rest.match(/^\/git\/blobs\/(\w+)$/))) {
      if (!blobs.has(m[1])) return antwort(404, { message: 'Not Found' });
      const b64 = Buffer.from(blobs.get(m[1]), 'utf8').toString('base64').replace(/(.{60})/g, '$1\n');
      return antwort(200, { sha: m[1], content: b64, encoding: 'base64' });
    }
    if (methode === 'POST' && rest === '/git/trees') {
      const dateien = body.base_tree ? flach(body.base_tree) : new Map();
      for (const e of body.tree) {
        if (e.sha === null) dateien.delete(e.path);
        else dateien.set(e.path, e.content !== undefined ? blob(e.content) : e.sha);
      }
      return antwort(201, { sha: baueBaum(dateien) });
    }
    if (methode === 'POST' && rest === '/git/commits') {
      return antwort(201, { sha: commit(body.tree, body.parents, body.message) });
    }
    if (methode === 'PATCH' && (m = rest.match(/^\/git\/refs\/heads\/(.+)$/))) {
      if (mock.vorPatch) {
        const h = mock.vorPatch;
        mock.vorPatch = null;
        await h();
      }
      const name = decodeURIComponent(m[1]);
      if (!body.force && !istVorfahr(refs.get(name), body.sha)) return antwort(422, { message: 'Update is not a fast forward' });
      refs.set(name, body.sha);
      return antwort(200, { ref: `refs/heads/${name}`, object: { sha: body.sha } });
    }
    return antwort(404, { message: `Mock kennt ${methode} ${rest} nicht` });
  };

  return mock;
}
