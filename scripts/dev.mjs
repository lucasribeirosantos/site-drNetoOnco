// Servidor local: serve /public, executa as funções de /api e reconstrói ao publicar.
// Uso: node scripts/dev.mjs   (porta 3000; senha do painel em .env -> ADMIN_PASSWORD)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);

// .env simples
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
if (!process.env.ADMIN_PASSWORD) { process.env.ADMIN_PASSWORD = 'admin-local'; console.log('ℹ ADMIN_PASSWORD não definida — usando "admin-local" (apenas desenvolvimento).'); }

const build = () => execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs')], { stdio: 'inherit' });
build();

const core = await import(pathToFileURL(path.join(ROOT, 'api/_lib/core.js')).href);
core.setLocalRebuild(async () => build());

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain', '.gif': 'image/gif', '.ico': 'image/x-icon' };

const redirects = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')).redirects || [];

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let p = decodeURIComponent(url.pathname);

  if (p.startsWith('/api/')) {
    const name = p.slice(5).replace(/\/$/, '');
    const file = path.join(ROOT, 'api', name + '.js');
    if (!/^[a-z-]+$/.test(name) || !fs.existsSync(file)) { res.statusCode = 404; return res.end('{}'); }
    const mod = await import(pathToFileURL(file).href);
    return mod.default(req, res);
  }

  const rd = redirects.find(r => r.source === p.replace(/\/$/, ''));
  if (rd) { res.writeHead(301, { Location: rd.destination }); return res.end(); }

  let f = path.join(PUB, p);
  if (!f.startsWith(PUB)) { res.statusCode = 403; return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) {
    if (!p.endsWith('/')) { res.writeHead(301, { Location: p + '/' + url.search }); return res.end(); }
    f = path.join(f, 'index.html');
  }
  if (!fs.existsSync(f)) { res.statusCode = 404; res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end('<h1>404</h1>'); }
  res.setHeader('Content-Type', TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache');
  fs.createReadStream(f).pipe(res);
}).listen(PORT, () => console.log(`\n▶ Site:   http://localhost:${PORT}\n▶ Painel: http://localhost:${PORT}/admin/\n`));
