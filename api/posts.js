// GET    /api/posts            -> lista (inclui rascunhos)
// GET    /api/posts?slug=x     -> post completo
// POST   /api/posts            -> cria/atualiza { post, image?: { name, dataUrl }, previousSlug? }
// DELETE /api/posts?slug=x     -> remove
import { handle, body, send, fail, readFile, listDir, commit, slugify, readMinutes, mode } from './_lib/core.js';

const DIR = 'content/posts';
const IMG_DIR = 'assets/img/blog/uploads';

export default handle(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const slug = url.searchParams.get('slug');

  if (req.method === 'GET') {
    if (slug) {
      const raw = await readFile(`${DIR}/${slugify(slug)}.json`);
      if (!raw) throw fail(404, 'Post não encontrado.');
      return send(res, 200, JSON.parse(raw));
    }
    const files = (await listDir(DIR)).filter(f => f.endsWith('.json'));
    const posts = (await Promise.all(files.map(async f => {
      try { const p = JSON.parse(await readFile(`${DIR}/${f}`)); delete p.body; return p; } catch { return null; }
    }))).filter(Boolean).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return send(res, 200, { posts, mode: mode() });
  }

  if (req.method === 'POST') {
    const { post, image, previousSlug, inlineImages = [] } = await body(req);
    if (!post || !post.title?.trim()) throw fail(400, 'O título é obrigatório.');
    if (!post.body || post.body.replace(/<[^>]+>/g, '').trim().length < 40) throw fail(400, 'Escreva o conteúdo do artigo antes de salvar.');

    const clean = {
      slug: slugify(post.slug || post.title),
      title: post.title.trim(),
      excerpt: (post.excerpt || '').trim(),
      date: /^\d{4}-\d{2}-\d{2}$/.test(post.date) ? post.date : new Date().toISOString().slice(0, 10),
      readMinutes: readMinutes(post.body),
      categories: Array.isArray(post.categories) ? post.categories.filter(Boolean).slice(0, 4) : [],
      author: post.author || 'Dr. Neto Pereira',
      cover: post.cover || '',
      coverAlt: post.coverAlt || '',
      gallery: Array.isArray(post.gallery) ? post.gallery : [],
      source: post.source?.url ? { name: post.source.name || '', url: post.source.url } : null,
      status: post.status === 'draft' ? 'draft' : 'published',
      body: String(post.body)
        .replace(/<\s*(script|style|iframe|object|embed)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
        .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, ''),
      updatedAt: new Date().toISOString(),
    };
    if (!clean.slug) throw fail(400, 'Não foi possível gerar o endereço (slug) do post.');

    const files = [];
    const addImage = (dataUrl, suffix) => {
      const m = /^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/.exec(dataUrl || '');
      if (!m) throw fail(400, 'Formato de imagem não suportado. Use JPG, PNG ou WEBP.');
      if (m[2].length > 6_000_000) throw fail(413, 'Imagem muito grande. Reduza para menos de 4 MB.');
      const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
      const name = `${clean.slug.slice(0, 50)}-${suffix}-${Date.now().toString(36)}.${ext}`;
      files.push({ path: `${IMG_DIR}/${name}`, content: m[2], encoding: 'base64' });
      return `/${IMG_DIR}/${name}`;
    };
    if (image?.dataUrl) clean.cover = addImage(image.dataUrl, 'capa');
    if (Array.isArray(inlineImages) && inlineImages.length) {
      if (inlineImages.length > 12) throw fail(413, 'Máximo de 12 imagens no corpo do artigo.');
      const urls = inlineImages.map((d, i) => addImage(d, `img${i + 1}`));
      clean.body = clean.body.replace(/__INLINE_(\d+)__/g, (m, i) => urls[+i] || '');
    }
    files.push({ path: `${DIR}/${clean.slug}.json`, content: JSON.stringify(clean, null, 2) + '\n' });
    if (previousSlug && slugify(previousSlug) !== clean.slug) files.push({ path: `${DIR}/${slugify(previousSlug)}.json`, delete: true });

    const verb = clean.status === 'draft' ? 'Rascunho' : 'Publica';
    const result = await commit(files, `${verb}: ${clean.title}`);
    return send(res, 200, { ok: true, post: clean, ...result });
  }

  if (req.method === 'DELETE') {
    if (!slug) throw fail(400, 'Informe o slug.');
    const result = await commit([{ path: `${DIR}/${slugify(slug)}.json`, delete: true }], `Remove post: ${slug}`);
    return send(res, 200, { ok: true, ...result });
  }

  send(res, 405, { error: 'Método não permitido' });
});
