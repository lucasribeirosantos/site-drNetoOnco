import { handle, body, send, checkPassword, issueToken, mode } from './_lib/core.js';

const attempts = new Map();

export default handle(async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' });
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0];
  const a = attempts.get(ip) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 15 * 60e3) { a.n = 0; a.t = Date.now(); }
  if (a.n >= 8) return send(res, 429, { error: 'Muitas tentativas. Aguarde 15 minutos.' });
  const { password } = await body(req);
  if (!checkPassword(password)) {
    a.n++; attempts.set(ip, a);
    await new Promise(r => setTimeout(r, 600));
    return send(res, 401, { error: 'Senha incorreta.' });
  }
  attempts.delete(ip);
  send(res, 200, { token: issueToken(), mode: mode(), ai: Boolean(process.env.ANTHROPIC_API_KEY) });
}, { auth: false });
