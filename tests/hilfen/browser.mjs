// Browser-Tests in iPhone-Größe: statischer Server, Chromium mit Touch, feste Uhrzeit in
// Köln, vorbereitete Daten im localStorage und die nachgebaute GitHub-API per Routing.

import { chromium } from 'playwright';
import { starteServer } from '../../scripts/server.mjs';

export const IPHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'de-DE', timezoneId: 'Europe/Berlin' };

let browser = null;
let server = null;

export async function oeffneBrowser(wurzel) {
  browser ??= await chromium.launch();
  server = await starteServer(wurzel ? { wurzel } : {});
  return { url: server.url };
}

export async function schliesseBrowser() {
  await browser?.close();
  browser = null;
  await server?.schliessen();
}

// daten: Zustand (wird nur gesetzt, wenn das Gerät noch leer ist – Neuladen behält Änderungen)
export async function neueSeite({ zustand = null, einstellungen = null, mock = null, zeit = '2026-10-29T18:00:00', serviceWorkers = 'block', url = server.url } = {}) {
  const kontext = await browser.newContext({ ...IPHONE, serviceWorkers });
  if (zustand || einstellungen) {
    await kontext.addInitScript(([z, e]) => {
      if (z && !localStorage.getItem('gym-log/zustand')) localStorage.setItem('gym-log/zustand', z);
      if (e && !localStorage.getItem('gym-log/einstellungen')) localStorage.setItem('gym-log/einstellungen', e);
    }, [zustand && JSON.stringify(zustand), einstellungen && JSON.stringify(einstellungen)]);
  }
  if (mock) {
    await kontext.route('https://api.github.com/**', async (route) => {
      const req = route.request();
      try {
        const res = await mock.fetch(req.url(), { method: req.method(), headers: await req.allHeaders(), body: req.postData() ?? undefined });
        await route.fulfill({ status: res.status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: await res.text() });
      } catch {
        await route.abort('internetdisconnected');
      }
    });
  }
  const seite = await kontext.newPage();
  const fehler = [];
  seite.on('pageerror', (e) => fehler.push(e.message));
  if (zeit) await seite.clock.setFixedTime(new Date(`${zeit}+01:00`));
  await seite.goto(url);
  await seite.waitForSelector('#app .seite');
  return { seite, kontext, fehler };
}

export async function geraeteZustand(seite) {
  return seite.evaluate(() => JSON.parse(localStorage.getItem('gym-log/zustand')));
}

export const TOKEN_EINSTELLUNGEN = { token: 'test-token', tokenBis: '', repo: 'BabyPython67/claude-projekte', ordner: 'gym', branch: '' };

// Alle sichtbaren bedienbaren Elemente mit ihrer Größe (CSS-Pixel).
export async function tastenGroessen(seite) {
  return seite.$$eval('a[href], button, input:not([type="hidden"]), select, summary, label.knopf, [role="button"], [data-a]', (els) => els
    .filter((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    })
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { text: (el.textContent || el.getAttribute('aria-label') || el.name || el.tagName).trim().slice(0, 40), b: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
    }));
}
