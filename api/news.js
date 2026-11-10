// Radar de notícias
// GET  /api/news                 -> agrega os feeds RSS/Atom configurados
// GET  /api/news?feeds=1         -> lista de feeds
// POST /api/news { feeds: [...] } -> salva a lista de feeds
// GET  /api/news?extract=URL     -> título, resumo, imagem e texto principal de uma matéria
import { handle, body, send, fail, readFile, commit, decodeEntities, stripHtml } from './_lib/core.js';

const UA = 'Mozilla/5.0 (compatible; NetoPereiraRadar/1.0; +https://www.netopereira.com)';
let cache = { at: 0, key: '', items: [] };

async function getFeeds() {
  const raw = await readFile('content/feeds.json');
  return raw ? JSON.parse(raw) : [];
}

function tag(xml, name) {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(xml);
  return m ? decodeEntities(m[1]).trim() : '';
}
function attr(xml, name, a) {
  const m = new RegExp(`<${name}\\b[^>]*\\b${a}=["']([^"']+)["']`, 'i').exec(xml);
  return m ? decodeEntities(m[1]) : '';
}

function parseFeed(xml, feed) {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  const kw = (feed.keywords || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return blocks.map(b => {
    let title = stripHtml(tag(b, 'title'));
    let link = tag(b, 'link') || attr(b, 'link', 'href');
    const descRaw = tag(b, 'description') || tag(b, 'summary') || tag(b, 'content') || tag(b, 'content:encoded');
    const date = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date');
    let source = stripHtml(tag(b, 'source')) || feed.name;
    // Google Notícias: "Título - Veículo"
    if (/news\.google\./.test(feed.url)) {
      const m = /^(.*)\s[-–]\s([^-–]+)$/.exec(title);
      if (m) { title = m[1].trim(); source = m[2].trim(); }
    }
    const image = attr(b, 'media:content', 'url') || attr(b, 'media:thumbnail', 'url') || attr(b, 'enclosure', 'url') || (/<img[^>]+src=["']([^"']+)/i.exec(descRaw) || [])[1] || '';
    let summary = stripHtml(descRaw);
    if (/news\.google\./.test(feed.url)) summary = '';
    const ts = Date.parse(date) || 0;
    return { title, link, summary: summary.slice(0, 420), image, source, feed: feed.name, lang: feed.lang || 'pt', date: ts ? new Date(ts).toISOString() : '' };
  }).filter(it => {
    if (!it.title || !it.link) return false;
    if (!kw.length) return true;
    const hay = (it.title + ' ' + it.summary).toLowerCase();
    return kw.some(k => hay.includes(k));
  });
}

async function fetchText(url, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, redirect: 'follow', signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return { text: await r.text(), finalUrl: r.url };
  } finally { clearTimeout(t); }
}

async function aggregate(force) {
  const feeds = (await getFeeds()).filter(f => f.enabled !== false);
  const key = JSON.stringify(feeds.map(f => f.url));
  if (!force && cache.key === key && Date.now() - cache.at < 10 * 60e3) return { items: cache.items, errors: [] };
  const errors = [];
  const results = await Promise.all(feeds.map(async f => {
    try { return parseFeed((await fetchText(f.url)).text, f); }
    catch (e) { errors.push({ feed: f.name, error: e.message }); return []; }
  }));
  const seen = new Set();
  const items = results.flat()
    .filter(it => { const k = it.title.toLowerCase().slice(0, 80); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 250);
  cache = { at: Date.now(), key, items };
  return { items, errors };
}

function meta(html, prop) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i');
  const m = re.exec(html);
  return m ? decodeEntities(m[1] || m[2] || '') : '';
}

function mainText(html) {
  let h = html.replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|figure)[\s\S]*?<\/\1>/gi, ' ');
  const art = /<article[\s\S]*?<\/article>/i.exec(h);
  if (art) h = art[0];
  const paras = [...h.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(m => decodeEntities(stripHtml(m[1]))).filter(t => t.length > 60);
  return paras.join('\n\n').slice(0, 14000);
}

export async function extract(url) {
  if (!/^https?:\/\//i.test(url)) throw fail(400, 'URL inválida.');
  const { text: html, finalUrl } = await fetchText(url, 15000);
  const unresolved = /news\.google\.com/.test(finalUrl);
  let image = meta(html, 'og:image') || meta(html, 'twitter:image');
  if (image && image.startsWith('/')) image = new URL(image, finalUrl).href;
  return {
    url: finalUrl,
    unresolved,
    title: meta(html, 'og:title') || stripHtml(tag(html, 'title')),
    description: meta(html, 'og:description') || meta(html, 'description'),
    image: unresolved ? '' : image,
    siteName: meta(html, 'og:site_name') || new URL(finalUrl).hostname.replace(/^www\./, ''),
    text: unresolved ? '' : mainText(html),
  };
}

export default handle(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && url.searchParams.get('extract')) {
    return send(res, 200, await extract(url.searchParams.get('extract')));
  }
  if (req.method === 'GET' && url.searchParams.get('feeds')) {
    return send(res, 200, { feeds: await getFeeds() });
  }
  if (req.method === 'GET') {
    const out = await aggregate(url.searchParams.get('refresh') === '1');
    return send(res, 200, { ...out, updatedAt: new Date(cache.at).toISOString() });
  }
  if (req.method === 'POST') {
    const { feeds } = await body(req);
    if (!Array.isArray(feeds)) throw fail(400, 'Lista de feeds inválida.');
    const clean = feeds.filter(f => /^https?:\/\//.test(f.url || '')).map(f => ({
      name: String(f.name || new URL(f.url).hostname).slice(0, 80), url: f.url, lang: f.lang === 'en' ? 'en' : 'pt',
      ...(f.keywords ? { keywords: String(f.keywords).slice(0, 300) } : {}), enabled: f.enabled !== false,
    }));
    await commit([{ path: 'content/feeds.json', content: JSON.stringify(clean, null, 2) + '\n' }], 'Atualiza fontes do radar de notícias');
    cache.at = 0;
    return send(res, 200, { ok: true, feeds: clean });
  }
  send(res, 405, { error: 'Método não permitido' });
});
