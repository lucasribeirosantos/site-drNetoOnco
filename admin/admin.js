/* Estúdio do Blog — Dr. Neto Pereira */
(() => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get: k => { try { return sessionStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} },
    del: k => { try { sessionStorage.removeItem(k); } catch {} },
  };
  const slugify = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
  const today = () => new Date().toISOString().slice(0, 10);
  const fmtDate = d => d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  const ago = d => {
    if (!d) return '';
    const m = Math.round((Date.now() - new Date(d)) / 60000);
    if (m < 60) return `há ${m} min`;
    if (m < 1440) return `há ${Math.round(m / 60)} h`;
    return `há ${Math.round(m / 1440)} d`;
  };

  let token = store.get('np-admin');
  let state = { posts: [], news: [], feeds: [], categories: [], ai: store.get('np-ai') === '1', mode: store.get('np-mode') || '' };

  /* ---------------- API ---------------- */
  async function api(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch {}
    if (res.status === 401 && path !== '/api/login') { logout(); throw new Error(data.error || 'Sessão expirada.'); }
    if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
    return data;
  }

  /* ---------------- Toast ---------------- */
  let toastT;
  function toast(msg, err = false, ms = 3800) {
    const t = $('#toast');
    t.innerHTML = msg; t.classList.toggle('is-err', err); t.classList.add('is-in');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('is-in'), ms);
  }

  /* ---------------- Login ---------------- */
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('button', e.target); btn.disabled = true; $('#loginErr').textContent = '';
    try {
      const d = await api('/api/login', { method: 'POST', body: { password: e.target.password.value } });
      token = d.token; store.set('np-admin', token);
      state.ai = d.ai; store.set('np-ai', d.ai ? '1' : '0');
      state.mode = d.mode; store.set('np-mode', d.mode);
      boot();
    } catch (err) { $('#loginErr').textContent = err.message; }
    btn.disabled = false;
  });
  function logout() { token = null; store.del('np-admin'); $('#app').hidden = true; $('#login').hidden = false; }
  $('#logout').addEventListener('click', logout);

  /* ---------------- Navegação ---------------- */
  function show(view) {
    $$('.side__nav button').forEach(b => b.classList.toggle('is-active', b.dataset.view === view));
    $$('.view').forEach(v => v.hidden = v.dataset.view !== view);
    if (view === 'radar' && !state.news.length) loadNews();
    if (view === 'feeds' && !state.feeds.length) loadFeeds();
  }
  $$('.side__nav button').forEach(b => b.addEventListener('click', () => show(b.dataset.view)));

  async function boot() {
    $('#login').hidden = true; $('#app').hidden = false;
    $('#modeBadge').textContent = state.mode === 'github' ? '● Publicação automática' : state.mode === 'local' ? '● Modo local' : '';
    try { state.categories = (await (await fetch('/content/site.json')).json()).categories || []; } catch { state.categories = ['Notícias']; }
    loadPosts();
  }

  /* ---------------- Artigos ---------------- */
  async function loadPosts() {
    try {
      const d = await api('/api/posts');
      state.posts = d.posts; renderPosts();
    } catch (e) { $('#postList').innerHTML = `<div class="empty-state">${esc(e.message)}</div>`; }
  }
  function renderPosts() {
    const q = slugify($('#postSearch').value).replace(/-/g, ' ');
    const st = $('#postStatus').value;
    const list = state.posts.filter(p => (!st || p.status === st) && (!q || slugify(p.title).replace(/-/g, ' ').includes(q)));
    $('#postList').innerHTML = list.length ? list.map(p => `
      <div class="row">
        <img src="${esc(p.cover || '/assets/img/logo1.webp')}" alt="" loading="lazy">
        <div>
          <h3>${esc(p.title)}</h3>
          <div class="meta">
            <span class="badge ${p.status === 'draft' ? 'badge--draft' : 'badge--pub'}">${p.status === 'draft' ? 'Rascunho' : 'Publicado'}</span>
            <span>${fmtDate(p.date)}</span><span>${(p.categories || []).map(esc).join(' · ')}</span>
          </div>
        </div>
        <div class="row__actions">
          ${p.status !== 'draft' ? `<a class="btn btn--ghost" href="/blog/${esc(p.slug)}/" target="_blank" rel="noopener">Ver</a>` : ''}
          <button class="btn btn--ghost" data-edit="${esc(p.slug)}">Editar</button>
          <button class="btn btn--ghost" data-del="${esc(p.slug)}" title="Excluir">Excluir</button>
        </div>
      </div>`).join('') : `<div class="empty-state">Nenhum artigo encontrado.</div>`;
  }
  $('#postSearch').addEventListener('input', renderPosts);
  $('#postStatus').addEventListener('change', renderPosts);
  $('#postList').addEventListener('click', async e => {
    const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
    if (ed) {
      try { openEditor(await api('/api/posts?slug=' + encodeURIComponent(ed.dataset.edit))); } catch (err) { toast(err.message, true); }
    }
    if (del) {
      const p = state.posts.find(x => x.slug === del.dataset.del);
      if (!confirm(`Excluir definitivamente "${p?.title}"?\nEsta ação remove o artigo do site.`)) return;
      try { await api('/api/posts?slug=' + encodeURIComponent(del.dataset.del), { method: 'DELETE' }); toast('Artigo excluído.'); loadPosts(); }
      catch (err) { toast(err.message, true); }
    }
  });
  $('#newPost').addEventListener('click', () => openEditor());

  /* ---------------- Editor ---------------- */
  let current = null, coverData = null, slugTouched = false;
  const F = id => $('#' + id);

  function openEditor(post = {}, opts = {}) {
    current = post.slug ? { ...post } : null;
    coverData = null; slugTouched = Boolean(post.slug);
    F('edMode').textContent = post.slug ? 'Editando artigo' : opts.fromNews ? 'Novo artigo a partir de notícia' : 'Novo artigo';
    F('fTitle').value = post.title || '';
    F('fExcerpt').value = post.excerpt || '';
    F('fBody').innerHTML = post.body || '';
    F('fDate').value = post.date || today();
    F('fSlug').value = post.slug || '';
    F('fAuthor').value = post.author || 'Dr. Neto Pereira';
    F('fCover').value = post.cover || '';
    F('fCoverAlt').value = post.coverAlt || '';
    F('fSourceName').value = post.source?.name || '';
    F('fSourceUrl').value = post.source?.url || '';
    F('fNotes').value = '';
    F('aiBox').hidden = !opts.ai;
    setCover(post.cover || '');
    renderCats(post.categories || []);
    updateHeading(); updateCount(); toggleAI();
    F('editor').hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => (post.title ? F('fBody') : F('fTitle')).focus(), 50);
  }
  function closeEditor() {
    if (dirty() && !confirm('Fechar sem salvar? As alterações serão perdidas.')) return;
    F('editor').hidden = true; document.body.style.overflow = '';
  }
  let snapshot = '';
  const serialize = () => JSON.stringify(collect());
  const dirty = () => serialize() !== snapshot;
  F('edClose').addEventListener('click', closeEditor);
  addEventListener('keydown', e => { if (e.key === 'Escape' && !F('preview').hidden) F('preview').hidden = true; });

  function renderCats(sel) {
    F('fCats').innerHTML = state.categories.map(c => `<button type="button" class="${sel.includes(c) ? 'is-on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  }
  F('fCats').addEventListener('click', e => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    const on = $$('.is-on', F('fCats'));
    if (!b.classList.contains('is-on') && on.length >= 3) return toast('Escolha até 3 categorias.');
    b.classList.toggle('is-on');
  });

  function updateHeading() { F('edHeading').textContent = F('fTitle').value || 'Sem título'; }
  function updateCount() {
    const n = F('fBody').innerText.trim().split(/\s+/).filter(Boolean).length;
    F('wordCount').textContent = `${n} palavras · ${Math.max(1, Math.round(n / 200))} min`;
  }
  F('fTitle').addEventListener('input', () => { updateHeading(); if (!slugTouched) F('fSlug').value = slugify(F('fTitle').value); });
  F('fSlug').addEventListener('input', () => { slugTouched = true; });
  F('fBody').addEventListener('input', updateCount);
  F('fSourceUrl').addEventListener('input', toggleAI);
  function toggleAI() {
    const has = state.ai && /^https?:\/\//.test(F('fSourceUrl').value);
    F('edAI').hidden = !has; F('fNotes').hidden = !has;
  }

  // barra de formatação
  F('rteBar').addEventListener('mousedown', e => e.preventDefault());
  F('rteBar').addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    F('fBody').focus();
    const { cmd, val } = b.dataset;
    if (cmd === 'createLink') {
      const url = prompt('Endereço do link (https://…)'); if (url) document.execCommand('createLink', false, url);
    } else if (cmd === 'insertImage') {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = async () => { const f = inp.files[0]; if (!f) return; const data = await resizeImage(f, 1600); document.execCommand('insertHTML', false, `<figure><img src="${data}" alt=""></figure><p><br></p>`); updateCount(); };
      inp.click();
    } else if (cmd === 'formatBlock') {
      document.execCommand('formatBlock', false, val);
    } else document.execCommand(cmd, false, null);
  });

  // colar limpo
  F('fBody').addEventListener('paste', e => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertHTML', false, html ? cleanHtml(html) : text.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join(''));
    updateCount();
  });
  function cleanHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const ALLOWED = { H1: 'h2', H2: 'h2', H3: 'h3', H4: 'h3', P: 'p', UL: 'ul', OL: 'ol', LI: 'li', STRONG: 'strong', B: 'strong', EM: 'em', I: 'em', A: 'a', BLOCKQUOTE: 'blockquote', BR: 'br' };
    const walk = node => {
      let out = '';
      node.childNodes.forEach(n => {
        if (n.nodeType === 3) { out += esc(n.textContent); return; }
        if (n.nodeType !== 1) return;
        const t = ALLOWED[n.tagName];
        const inner = walk(n);
        if (!t) { out += /^(DIV|SECTION|ARTICLE)$/.test(n.tagName) && inner.trim() && !/^<(p|h2|h3|ul|ol|blockquote)/.test(inner.trim()) ? `<p>${inner}</p>` : inner; return; }
        if (t === 'br') { out += '<br>'; return; }
        if (t === 'a') { const h = n.getAttribute('href') || ''; out += /^https?:/.test(h) ? `<a href="${esc(h)}">${inner}</a>` : inner; return; }
        if (!inner.trim()) return;
        out += `<${t}>${inner}</${t}>`;
      });
      return out;
    };
    return walk(doc.body);
  }

  // capa
  function setCover(src) {
    F('coverImg').hidden = !src; F('coverHint').hidden = Boolean(src);
    if (src) F('coverImg').src = src;
  }
  F('coverFile').addEventListener('change', async () => { const f = F('coverFile').files[0]; if (f) await useCoverFile(f); });
  async function useCoverFile(f) {
    if (!/^image\//.test(f.type)) return toast('Envie um arquivo de imagem.', true);
    coverData = await resizeImage(f, 2000);
    F('fCover').value = ''; setCover(coverData);
  }
  ['dragenter', 'dragover'].forEach(ev => F('coverDrop').addEventListener(ev, e => { e.preventDefault(); F('coverDrop').classList.add('is-drag'); }));
  ['dragleave', 'drop'].forEach(ev => F('coverDrop').addEventListener(ev, e => { e.preventDefault(); F('coverDrop').classList.remove('is-drag'); }));
  F('coverDrop').addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) useCoverFile(f); });
  F('fCover').addEventListener('change', () => { coverData = null; setCover(F('fCover').value.trim()); });

  function resizeImage(file, max) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        let out = c.toDataURL('image/webp', 0.82);
        if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/jpeg', 0.85);
        URL.revokeObjectURL(img.src); resolve(out);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  function collect() {
    return {
      title: F('fTitle').value.trim(),
      excerpt: F('fExcerpt').value.trim(),
      body: F('fBody').innerHTML.trim(),
      date: F('fDate').value,
      slug: F('fSlug').value.trim() || slugify(F('fTitle').value),
      author: F('fAuthor').value.trim(),
      cover: coverData ? '' : F('fCover').value.trim(),
      coverAlt: F('fCoverAlt').value.trim(),
      categories: $$('.is-on', F('fCats')).map(b => b.dataset.cat),
      source: F('fSourceUrl').value.trim() ? { name: F('fSourceName').value.trim(), url: F('fSourceUrl').value.trim() } : null,
      gallery: current?.gallery || [],
    };
  }
  const origOpen = openEditor;
  openEditor = (p, o) => { origOpen(p, o); snapshot = serialize(); if (o?.ai || o?.fromNews) snapshot = ''; };

  async function save(status) {
    const post = { ...collect(), status };
    if (!post.title) return toast('Dê um título ao artigo.', true);
    if (status === 'published' && !post.excerpt) return toast('Escreva um resumo curto antes de publicar.', true);
    if (status === 'published' && !post.categories.length) return toast('Escolha ao menos uma categoria.', true);
    // imagens coladas/enviadas no corpo
    const inlineImages = [];
    post.body = post.body.replace(/src="(data:image\/[^"]+)"/g, (m, data) => { inlineImages.push(data); return `src="__INLINE_${inlineImages.length - 1}__"`; });
    const btns = [F('edDraft'), F('edPublish')]; btns.forEach(b => b.disabled = true);
    const label = F(status === 'draft' ? 'edDraft' : 'edPublish'); const old = label.innerHTML;
    label.innerHTML = '<span class="spinner"></span> Salvando…';
    try {
      const d = await api('/api/posts', { method: 'POST', body: { post, image: coverData ? { dataUrl: coverData } : null, inlineImages, previousSlug: current?.slug } });
      snapshot = serialize();
      F('editor').hidden = true; document.body.style.overflow = '';
      toast(status === 'draft' ? 'Rascunho salvo.' : (d.mode === 'github' ? 'Publicado! O site é atualizado em cerca de 1 minuto.' : `Publicado! <a href="/blog/${d.post.slug}/" target="_blank" style="color:#7fd6ff">Ver artigo ↗</a>`), false, 6000);
      loadPosts();
    } catch (e) { toast(e.message, true, 6000); }
    btns.forEach(b => b.disabled = false); label.innerHTML = old;
  }
  F('edDraft').addEventListener('click', () => save('draft'));
  F('edPublish').addEventListener('click', () => save('published'));

  // pré-visualização
  F('edPreview').addEventListener('click', () => {
    const p = collect(); const cover = coverData || p.cover;
    F('pvBody').innerHTML = `
      <div class="pv__hero"><span class="eyebrow" style="color:rgba(255,255,255,.6)">${esc(p.categories.join(' · ') || 'Vencendo o Câncer')}</span><h1>${esc(p.title || 'Sem título')}</h1><p>${esc(p.excerpt)}</p></div>
      ${cover ? `<img class="pv__cover" src="${esc(cover)}" alt="">` : ''}
      <div class="prose">${p.body || '<p><em>Sem conteúdo ainda.</em></p>'}</div>
      ${p.source ? `<div class="pv__src">Fonte de referência: <a href="${esc(p.source.url)}" target="_blank" rel="noopener">${esc(p.source.name || p.source.url)}</a></div>` : ''}`;
    F('preview').hidden = false;
  });
  F('pvClose').addEventListener('click', () => F('preview').hidden = true);
  F('preview').addEventListener('click', e => { if (e.target === F('preview')) F('preview').hidden = true; });

  // IA a partir da fonte do editor
  F('edAI').addEventListener('click', () => generateAI({ url: F('fSourceUrl').value.trim(), title: F('fTitle').value, summary: F('fExcerpt').value, source: F('fSourceName').value, notes: F('fNotes').value }, true));

  async function generateAI(item, inEditor = false) {
    if (!state.ai) return toast('Assistente de IA não configurado.', true);
    if (inEditor && F('fBody').innerText.trim().length > 80 && !confirm('Substituir o texto atual pelo rascunho gerado?')) return;
    toast('<span class="spinner"></span>&nbsp; Lendo a notícia e escrevendo o rascunho… (30–90 s)', false, 120000);
    try {
      const d = await api('/api/ai-draft', { method: 'POST', body: item });
      const prev = inEditor ? collect() : {};
      openEditor({
        title: d.title, excerpt: d.excerpt, body: d.body, categories: d.categories, coverAlt: d.coverAlt,
        source: d.source || prev.source, date: today(), cover: prev.cover || '', status: 'draft',
      }, { ai: true, fromNews: true });
      toast('Rascunho pronto. Revise antes de publicar.', false, 5000);
    } catch (e) { toast(e.message, true, 7000); }
  }

  /* ---------------- Radar ---------------- */
  async function loadNews(refresh = false) {
    $('#newsList').innerHTML = Array(6).fill('<div class="skeleton" style="height:180px"></div>').join('');
    $('#radarInfo').textContent = 'Buscando notícias…';
    try {
      const d = await api('/api/news' + (refresh ? '?refresh=1' : ''));
      state.news = d.items;
      const feeds = [...new Set(d.items.map(i => i.feed))];
      $('#radarFeed').innerHTML = '<option value="">Todas as fontes</option>' + feeds.map(f => `<option>${esc(f)}</option>`).join('');
      $('#radarInfo').textContent = `${d.items.length} notícias · atualizado ${new Date(d.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` + (d.errors?.length ? ` · ${d.errors.length} fonte(s) indisponível(is): ${d.errors.map(e => e.feed).join(', ')}` : '');
      renderNews();
    } catch (e) { $('#newsList').innerHTML = `<div class="empty-state">${esc(e.message)}</div>`; $('#radarInfo').textContent = ''; }
  }
  function renderNews() {
    const q = $('#radarSearch').value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const lang = $('#radarLang').value, feed = $('#radarFeed').value;
    const items = state.news.filter(i => (!lang || i.lang === lang) && (!feed || i.feed === feed) &&
      (!q || (i.title + ' ' + i.summary).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q)));
    $('#newsList').innerHTML = items.length ? items.slice(0, 120).map((i, idx) => `
      <article class="ncard">
        <div class="ncard__top"><span><span class="ncard__src">${esc(i.source)}</span> · ${ago(i.date)}</span><span class="lang">${i.lang.toUpperCase()}</span></div>
        <h3>${esc(i.title)}</h3>
        ${i.summary ? `<p>${esc(i.summary)}</p>` : ''}
        <div class="ncard__actions">
          <a class="btn btn--ghost" href="${esc(i.link)}" target="_blank" rel="noopener">Ler ↗</a>
          <button class="btn btn--ghost" data-use="${state.news.indexOf(i)}">Usar como base</button>
          ${state.ai ? `<button class="btn btn--primary" data-ai="${state.news.indexOf(i)}">✦ Rascunho com IA</button>` : ''}
        </div>
      </article>`).join('') : '<div class="empty-state">Nenhuma notícia com esses filtros.</div>';
  }
  ['#radarSearch', '#radarLang', '#radarFeed'].forEach(s => $(s).addEventListener(s === '#radarSearch' ? 'input' : 'change', renderNews));
  $('#radarRefresh').addEventListener('click', () => loadNews(true));
  $('#newsList').addEventListener('click', async e => {
    const use = e.target.closest('[data-use]'), ai = e.target.closest('[data-ai]');
    if (use) {
      const i = state.news[+use.dataset.use];
      openEditor({
        title: i.lang === 'pt' ? i.title : '',
        excerpt: i.lang === 'pt' ? i.summary.slice(0, 220) : '',
        body: `<p></p><blockquote>${esc(i.title)}</blockquote><p><em>Escreva aqui a análise do Dr. Neto: o que a notícia significa para os pacientes, o que ainda não se sabe e quando procurar orientação.</em></p>`,
        source: { name: i.source, url: i.link }, categories: ['Notícias'], date: today(),
      }, { fromNews: true });
      // tenta resolver o link original e o nome do veículo
      try {
        const ex = await api('/api/news?extract=' + encodeURIComponent(i.link));
        if (!ex.unresolved) { F('fSourceUrl').value = ex.url; if (!F('fSourceName').value || /Google/.test(F('fSourceName').value)) F('fSourceName').value = ex.siteName; }
      } catch {}
    }
    if (ai) { const i = state.news[+ai.dataset.ai]; generateAI({ url: i.link, title: i.title, summary: i.summary, source: i.source }); }
  });

  /* ---------------- Fontes ---------------- */
  async function loadFeeds() {
    try { state.feeds = (await api('/api/news?feeds=1')).feeds; renderFeeds(); }
    catch (e) { $('#feedList').innerHTML = `<div class="empty-state">${esc(e.message)}</div>`; }
  }
  function renderFeeds() {
    $('#feedList').innerHTML = state.feeds.map((f, i) => `
      <div class="feed" data-i="${i}">
        <button class="switch ${f.enabled !== false ? 'is-on' : ''}" data-toggle title="Ativar/desativar"></button>
        <input class="input" data-k="name" value="${esc(f.name)}">
        <input class="input" data-k="url" value="${esc(f.url)}">
        <select class="input" data-k="lang"><option value="pt" ${f.lang !== 'en' ? 'selected' : ''}>PT</option><option value="en" ${f.lang === 'en' ? 'selected' : ''}>EN</option></select>
        <input class="input" data-k="keywords" value="${esc(f.keywords || '')}" placeholder="palavras-chave (opcional)">
        <button class="icon-btn" data-remove title="Remover">✕</button>
      </div>`).join('');
  }
  $('#feedList').addEventListener('input', e => { const row = e.target.closest('.feed'); const k = e.target.dataset.k; if (row && k) state.feeds[+row.dataset.i][k] = e.target.value; });
  $('#feedList').addEventListener('change', e => { const row = e.target.closest('.feed'); const k = e.target.dataset.k; if (row && k) state.feeds[+row.dataset.i][k] = e.target.value; });
  $('#feedList').addEventListener('click', e => {
    const row = e.target.closest('.feed'); if (!row) return;
    const f = state.feeds[+row.dataset.i];
    if (e.target.closest('[data-toggle]')) { f.enabled = f.enabled === false; renderFeeds(); }
    if (e.target.closest('[data-remove]')) { state.feeds.splice(+row.dataset.i, 1); renderFeeds(); }
  });
  $('#feedAdd').addEventListener('submit', e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    state.feeds.push({ ...f, enabled: true }); e.target.reset(); renderFeeds();
    toast('Fonte adicionada. Clique em "Salvar fontes" para confirmar.');
  });
  $('#saveFeeds').addEventListener('click', async () => {
    try { const d = await api('/api/news', { method: 'POST', body: { feeds: state.feeds } }); state.feeds = d.feeds; state.news = []; renderFeeds(); toast('Fontes salvas.'); }
    catch (e) { toast(e.message, true); }
  });

  /* ---------------- Início ---------------- */
  if (token) boot();
})();
