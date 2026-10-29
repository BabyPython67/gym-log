// Winziger HTML-Baukasten: html`…` maskiert alle eingesetzten Werte, außer sie stammen
// selbst aus html`…`. So kann ein Übungsname nie Markup einschleusen.

const ROH = Symbol('roh');

const MASKE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const maskiere = (s) => String(s).replace(/[&<>"']/g, (z) => MASKE[z]);

function alsText(w) {
  if (w === null || w === undefined || w === false) return '';
  if (Array.isArray(w)) return w.map(alsText).join('');
  if (typeof w === 'object' && ROH in w) return w[ROH];
  return maskiere(w);
}

export function html(teile, ...werte) {
  let s = teile[0];
  for (let i = 0; i < werte.length; i++) s += alsText(werte[i]) + teile[i + 1];
  return { [ROH]: s };
}

export const text = (h) => alsText(h);
