// Núcleo compartilhado das funções do painel (Vercel Functions + servidor local).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/* ------------------------------------------------------------------ */
/* HTTP                                                               */
/* ------------------------------------------------------------------ */
export function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

export async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

export function handle(fn, { auth = true } = {}) {
  return async (req, res) => {
    try {
      if (auth && !verifyToken(req)) return send(res, 401, { error: 'Sessão expirada. Entre novamente.' });
      await fn(req, res);
    } catch (err) {
      console.error(err);
      send(res, err.status || 500, { error: err.publicMessage || err.message || 'Erro inesperado.' });
    }
  };
}

export function fail(status, msg) { const e = new Error(msg); e.status = status; e.publicMessage = msg; return e; }

/* ------------------------------------------------------------------ */
/* Autenticação (senha única + token assinado, 12h)                   */
/* ------------------------------------------------------------------ */
const secret = () => {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) throw fail(500, 'ADMIN_PASSWORD não configurada no servidor.');
  return crypto.createHash('sha256').update('np::' + pw + '::' + (process.env.SESSION_SECRET || '')).digest();
};
const b64u = b => Buffer.from(b).toString('base64url');

export function checkPassword(pw) {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected) throw fail(500, 'ADMIN_PASSWORD não configurada no servidor.');
  const a = crypto.createHash('sha256').update(String(pw || '')).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export function issueToken() {
  const payload = b64u(JSON.stringify({ exp: Date.now() + 12 * 3600e3 }));
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyToken(req) {
  const h = req.headers['authorization'] || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const [payload, sig] = tok.split('.');
  if (!payload || !sig) return false;
  const good = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  if (good.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(good), Buffer.from(sig))) return false;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now(); } catch { return false; }
}

/* ------------------------------------------------------------------ */
/* Armazenamento: GitHub (produção) ou disco (desenvolvimento local)  */
/* ------------------------------------------------------------------ */
const GH = () => ({
  token: process.env.GITHUB_TOKEN,
  repo: process.env.GITHUB_REPO, // "usuario/repositorio"
  branch: process.env.GITHUB_BRANCH || 'main',
});
export const mode = () => (GH().token && GH().repo ? 'github' : 'local');

async function gh(pathname, opts = {}) {
  const { token, repo } = GH();
  const res = await fetch(`https://api.github.com/repos/${repo}${pathname}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'netopereira-admin', ...(opts.headers || {}) },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw fail(502, `GitHub respondeu ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? {} : res.json();
}

export async function readFile(rel) {
  if (mode() === 'local') {
    const p = path.join(ROOT, rel);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  }
  const { branch } = GH();
  const data = await gh(`/contents/${encodeURI(rel)}?ref=${branch}`);
  return data ? Buffer.from(data.content, 'base64').toString('utf8') : null;
}

export async function listDir(rel) {
  if (mode() === 'local') {
    const p = path.join(ROOT, rel);
    return fs.existsSync(p) ? fs.readdirSync(p) : [];
  }
  const { branch } = GH();
  const data = await gh(`/contents/${encodeURI(rel)}?ref=${branch}`);
  return Array.isArray(data) ? data.map(f => f.name) : [];
}

/**
 * Grava vários arquivos num único commit (=> um único deploy na Vercel).
 * files: [{ path, content (string utf8) | base64, encoding: 'utf8'|'base64', delete?: true }]
 */
export async function commit(files, message) {
  if (mode() === 'local') {
    for (const f of files) {
      const p = path.join(ROOT, f.path);
      if (f.delete) { fs.rmSync(p, { force: true }); continue; }
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, f.encoding === 'base64' ? Buffer.from(f.content, 'base64') : f.content);
    }
    await localRebuild?.();
    return { mode: 'local' };
  }
  const { branch } = GH();
  const ref = await gh(`/git/ref/heads/${branch}`);
  const baseSha = ref.object.sha;
  const baseCommit = await gh(`/git/commits/${baseSha}`);
  const tree = [];
  for (const f of files) {
    if (f.delete) { tree.push({ path: f.path, mode: '100644', type: 'blob', sha: null }); continue; }
    const blob = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: f.content, encoding: f.encoding === 'base64' ? 'base64' : 'utf-8' }) });
    tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const newTree = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree }) });
  const newCommit = await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message, tree: newTree.sha, parents: [baseSha] }) });
  await gh(`/git/refs/heads/${branch}`, { method: 'PATCH', body: JSON.stringify({ sha: newCommit.sha }) });
  return { mode: 'github', commit: newCommit.sha };
}

let localRebuild = null;
export function setLocalRebuild(fn) { localRebuild = fn; }

/* ------------------------------------------------------------------ */
/* Utilidades de conteúdo                                             */
/* ------------------------------------------------------------------ */
export const slugify = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);

export const stripHtml = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

export function decodeEntities(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

export function readMinutes(html) {
  const words = stripHtml(html).split(' ').filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
