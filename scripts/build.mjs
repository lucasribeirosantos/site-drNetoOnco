// Gera o site estático em /public a partir de /src, /content e /assets.
// Uso: node scripts/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public');
const r = (...p) => path.join(ROOT, ...p);
const read = p => fs.readFileSync(p, 'utf8');
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };

const site = JSON.parse(read(r('content/site.json')));
const version = Date.now().toString(36);
const year = new Date().getFullYear();

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const fmtDate = d => { if (!d) return ''; const [y, m, dd] = d.split('-').map(Number); return `${dd} de ${months[m - 1]} de ${y}`; };
const slugify = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function sanitize(html = '') {
  return String(html)
    .replace(/<\s*(script|style|iframe|object|embed)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
}

/* ---------- limpeza e cópia ---------- */
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const dir of ['assets', 'css', 'js', 'admin']) {
  if (fs.existsSync(r(dir))) fs.cpSync(r(dir), path.join(OUT, dir), { recursive: true });
}

/* ---------- posts ---------- */
const postsDir = r('content/posts');
const allPosts = fs.readdirSync(postsDir).filter(f => f.endsWith('.json')).map(f => {
  const p = JSON.parse(read(path.join(postsDir, f)));
  p.slug = p.slug || slugify(p.title);
  p.categories = p.categories || [];
  return p;
});
const posts = allPosts.filter(p => p.status !== 'draft').sort((a, b) => (b.date || '').localeCompare(a.date || ''));

/* ---------- partials ---------- */
const partial = n => read(r('src/partials', n + '.html'));
const fill = (tpl, vars) => tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
const baseVars = { version, year, curriculoUrl: esc(site.curriculoUrl), revistaUrl: esc(site.revistaUrl) };
const head = fill(partial('head'), baseVars);
const header = fill(partial('header'), baseVars);
const footer = fill(partial('footer'), baseVars);
const page = (tpl, extra = {}) => fill(tpl, { ...baseVars, head, header, footer, ...extra });

const card = (p, i = 0) => `
        <a class="pcard" href="/blog/${p.slug}/" data-post data-cats="${esc(p.categories.join('|'))}" data-search="${esc(p.title + ' ' + (p.excerpt || '') + ' ' + p.categories.join(' '))}">
          <div class="pcard__img">
            <img src="${esc(p.cover || '/assets/img/logo1.webp')}" alt="" loading="lazy">
            ${p.categories[0] ? `<span class="chip pcard__cat"><i></i>${esc(p.categories[0])}</span>` : ''}
          </div>
          <div class="pcard__meta"><span>${fmtDate(p.date)}</span><span>${p.readMinutes || 4} min de leitura</span></div>
          <h3>${esc(p.title)}</h3>
        </a>`;

/* ---------- home ---------- */
write(path.join(OUT, 'index.html'), page(read(r('src/pages/index.html')), { latestPosts: posts.slice(0, 3).map(card).join('') }));

/* ---------- política ---------- */
if (fs.existsSync(r('src/pages/politica-de-privacidade.html'))) {
  write(path.join(OUT, 'politica-de-privacidade/index.html'), page(read(r('src/pages/politica-de-privacidade.html'))));
}

/* ---------- blog index ---------- */
const usedCats = [...new Set(posts.flatMap(p => p.categories))];
const featured = posts[0];
const blogIndex = `<!doctype html>
<html lang="pt-BR" class="no-js">
<head>
${head}
<title>Blog Vencendo o Câncer — Inovações e esperança | Dr. Neto Pereira</title>
<meta name="description" content="Artigos do oncologista Dr. Neto Pereira sobre avanços em oncologia, oncologia de precisão, câncer hereditário, prevenção e cuidado.">
<link rel="canonical" href="${site.siteUrl}/blog/">
<link rel="alternate" type="application/rss+xml" title="Vencendo o Câncer" href="/feed.xml">
<meta property="og:title" content="Blog Vencendo o Câncer — Dr. Neto Pereira">
<meta property="og:image" content="${site.siteUrl}/assets/img/logo1.webp">
</head>
<body data-page="blog">
${header}
<main>
  <section class="page-hero on-dark">
    <div class="orb orb--a" aria-hidden="true"></div>
    <div class="container page-hero__row" style="position:relative">
      <div>
        <span class="eyebrow" data-page-fade>Blog · Vencendo o Câncer</span>
        <h1 class="display" style="margin-top:26px" data-page-title>Inovações e <em class="serif grad-text">esperança.</em></h1>
        <p class="lead" style="margin-top:30px" data-page-fade>Pesquisas, avanços em tratamentos e informação confiável para ajudar a compreender e enfrentar o câncer.</p>
      </div>
      <img class="page-hero__logo" src="/assets/img/logo1.webp" alt="Vencendo o Câncer" data-page-fade>
    </div>
  </section>
  <section class="section on-light panel" style="padding-top:90px">
    <div class="container">
      ${featured ? `
      <a class="featured pcard" href="/blog/${featured.slug}/">
        <div class="pcard__img"><img src="${esc(featured.cover)}" alt=""></div>
        <div>
          <span class="eyebrow">Mais recente</span>
          <h2>${esc(featured.title)}</h2>
          <p>${esc(featured.excerpt)}</p>
          <div class="pcard__meta" style="margin-bottom:28px"><span>${fmtDate(featured.date)}</span><span>${featured.readMinutes} min de leitura</span></div>
          <span class="btn btn--primary">Ler artigo <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
        </div>
      </a>` : ''}
      <div class="filters">
        <button class="filter is-active" data-filter="todos">Todos</button>
        ${usedCats.map(c => `<button class="filter" data-filter="${esc(c)}">${esc(c)}</button>`).join('\n        ')}
        <label class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" placeholder="Buscar artigos" data-search aria-label="Buscar artigos"></label>
      </div>
      <div class="posts posts--blog" data-post-list>
        ${posts.map(card).join('')}
      </div>
      <p class="empty" data-empty style="display:none">Nenhum artigo encontrado.</p>
    </div>
  </section>
</main>
${footer}
</body>
</html>`;
write(path.join(OUT, 'blog/index.html'), blogIndex);

/* ---------- artigos ---------- */
function withGallery(p) {
  let body = sanitize(p.body);
  const gal = (p.gallery || []).filter(Boolean);
  if (!gal.length || /<img/i.test(body)) return body;
  const parts = body.split(/(?=<h2>)/);
  if (parts.length < 2) return body + gal.map(g => `<figure><img src="${esc(g)}" alt="" loading="lazy"></figure>`).join('');
  const step = Math.max(1, Math.floor((parts.length - 1) / gal.length));
  let gi = 0;
  return parts.map((chunk, i) => {
    if (i > 0 && i % step === 0 && gi < gal.length) return `<figure><img src="${esc(gal[gi++])}" alt="" loading="lazy"></figure>` + chunk;
    return chunk;
  }).join('');
}

const ico = {
  wa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.8 4.9-1.3A10 10 0 1 0 12 2Zm5 13.4c-.2.6-1.2 1.1-1.7 1.2-.4 0-1 .1-3.2-.8a11 11 0 0 1-4.3-3.8c-.3-.5-1-1.4-1-2.7s.7-1.9 1-2.2a1 1 0 0 1 .7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.1.1.3 0 .5l-.4.6-.4.4c-.1.2-.3.3-.1.6a7.3 7.3 0 0 0 3.6 3.2c.3.1.5.1.6 0l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.1.1.6-.1 1.1Z"/></svg>',
  in: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3zM9 9h3.8v1.7h.1c.5-1 1.8-2 3.8-2 4 0 4.8 2.7 4.8 6.1V21h-4v-5.4c0-1.3 0-3-1.8-3s-2.1 1.4-2.1 2.9V21H9z"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
};

for (const p of posts) {
  const url = `${site.siteUrl}/blog/${p.slug}/`;
  const related = posts.filter(x => x.slug !== p.slug && x.categories.some(c => p.categories.includes(c))).concat(posts.filter(x => x.slug !== p.slug)).filter((x, i, a) => a.indexOf(x) === i).slice(0, 3);
  const ld = { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: p.excerpt, datePublished: p.date, image: p.cover ? site.siteUrl + p.cover : undefined, author: { '@type': 'Person', name: 'Dr. Neto Pereira' }, mainEntityOfPage: url };
  const html = `<!doctype html>
<html lang="pt-BR" class="no-js">
<head>
${head}
<title>${esc(p.title)} | Blog Dr. Neto Pereira</title>
<meta name="description" content="${esc(p.excerpt)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.excerpt)}">
${p.cover ? `<meta property="og:image" content="${site.siteUrl}${esc(p.cover)}">` : ''}
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body data-page="post">
<div class="progress" aria-hidden="true"></div>
${header}
<main>
  <section class="article-hero on-dark">
    <div class="container">
      <div class="article-hero__inner">
        <a href="/blog/" class="eyebrow" data-page-fade>← Vencendo o Câncer${p.categories[0] ? ' · ' + esc(p.categories[0]) : ''}</a>
        <h1 data-page-title>${esc(p.title)}</h1>
        ${p.excerpt ? `<p class="lead" data-page-fade>${esc(p.excerpt)}</p>` : ''}
        <div class="article-meta" data-page-fade>
          <img src="/assets/img/10x10-dr-claudemiro.webp" alt="">
          <span><strong>${esc(p.author || 'Dr. Neto Pereira')}</strong><br>Oncologista · CRM-MG 50274</span>
          <span>${fmtDate(p.date)}</span><span>${p.readMinutes || 4} min de leitura</span>
        </div>
      </div>
    </div>
  </section>
  ${p.cover ? `<div class="on-dark" style="padding-bottom:0"><div class="article-cover"><img src="${esc(p.cover)}" alt="${esc(p.coverAlt || '')}"></div></div>` : ''}
  <article class="article">
    <div class="container article__grid">
      <aside class="article__aside">
        <div><h6>Publicado</h6>${fmtDate(p.date)}</div>
        ${p.categories.length ? `<div><h6>Temas</h6>${p.categories.map(esc).join('<br>')}</div>` : ''}
        <div><h6>Compartilhar</h6><div class="share">
          <a href="https://wa.me/?text=${encodeURIComponent(p.title + ' ' + url)}" target="_blank" rel="noopener" aria-label="Compartilhar no WhatsApp">${ico.wa}</a>
          <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}" target="_blank" rel="noopener" aria-label="Compartilhar no LinkedIn">${ico.in}</a>
          <button data-copy aria-label="Copiar link">${ico.link}</button>
        </div></div>
      </aside>
      <div>
        <div class="prose">${withGallery(p)}</div>
        ${p.source && p.source.url ? `<div class="source-box">Fonte de referência: <a href="${esc(p.source.url)}" target="_blank" rel="noopener nofollow">${esc(p.source.name || p.source.url)}</a></div>` : ''}
        <p class="disclaimer">Este conteúdo tem finalidade informativa e não substitui a consulta médica. Cada caso deve ser avaliado individualmente.</p>
        <div class="cta-band">
          <h3>Ficou com alguma dúvida? <em class="serif">Converse com o Dr. Neto.</em></h3>
          <a class="btn btn--primary" href="https://wa.me/5537988252119?text=Ol%C3%A1%2C%20gostaria%20de%20agendar%20uma%20consulta%20com%20Dr.%20Neto%20Pereira" target="_blank" rel="noopener" style="position:relative">Agendar consulta <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
        </div>
      </div>
    </div>
  </article>
  <section class="related on-dark">
    <div class="container">
      <div class="blogt__head"><h2 class="h2" data-split>Continue <em class="serif grad-text">lendo.</em></h2><a class="btn btn--ghost" href="/blog/">Todos os artigos</a></div>
      <div class="posts">${related.map(card).join('')}</div>
    </div>
  </section>
</main>
${footer}
</body>
</html>`;
  write(path.join(OUT, 'blog', p.slug, 'index.html'), html);
}

/* ---------- índices, feed, sitemap ---------- */
write(path.join(OUT, 'content/posts.json'), JSON.stringify(posts.map(({ body, ...m }) => m), null, 0));
write(path.join(OUT, 'content/site.json'), JSON.stringify(site));

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Vencendo o Câncer — Dr. Neto Pereira</title><link>${site.siteUrl}/blog/</link><description>Inovações e esperança em oncologia.</description><language>pt-BR</language>
${posts.slice(0, 30).map(p => `<item><title>${esc(p.title)}</title><link>${site.siteUrl}/blog/${p.slug}/</link><guid>${site.siteUrl}/blog/${p.slug}/</guid><pubDate>${new Date(p.date + 'T12:00:00Z').toUTCString()}</pubDate><description>${esc(p.excerpt)}</description></item>`).join('\n')}
</channel></rss>`;
write(path.join(OUT, 'feed.xml'), rss);

const urls = ['/', '/blog/', '/politica-de-privacidade/', ...posts.map(p => `/blog/${p.slug}/`)];
write(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `<url><loc>${site.siteUrl}${u}</loc></url>`).join('\n')}\n</urlset>`);
write(path.join(OUT, 'robots.txt'), `User-agent: *\nDisallow: /admin/\nSitemap: ${site.siteUrl}/sitemap.xml\n`);

console.log(`✔ build: ${posts.length} posts publicados, ${allPosts.length - posts.length} rascunhos → public/`);
