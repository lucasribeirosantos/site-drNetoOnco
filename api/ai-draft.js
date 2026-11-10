// POST /api/ai-draft { url?, title?, summary?, text?, source?, notes? }
// Gera um RASCUNHO de artigo em português, na voz do blog, a partir de uma notícia.
// Requer ANTHROPIC_API_KEY. O texto sempre volta como rascunho para revisão médica.
import Anthropic from '@anthropic-ai/sdk';
import { handle, body, send, fail, readFile, readMinutes } from './_lib/core.js';
import { extract } from './news.js';

const SYSTEM = `Você escreve rascunhos para o blog "Vencendo o Câncer — Inovações e esperança", do Dr. Neto Pereira (Claudemiro Pereira Neto), oncologista clínico e oncogeneticista em Divinópolis-MG, membro titular da SBOC e da ESMO.

Público: pacientes, familiares e leigos interessados; também colegas da saúde.
Voz: acolhedora, clara e precisa; esperançosa sem prometer cura; frases curtas; português do Brasil; sem sensacionalismo.

Regras:
- Baseie-se SOMENTE nas informações da notícia fornecida. Não invente números, nomes de estudos, datas, aprovações regulatórias ou citações. Se algo for incerto ou preliminar (ex.: estudo em animais, fase 1), diga isso explicitamente.
- Explique o que a novidade significa na prática para o paciente brasileiro e o que ainda não se sabe.
- Inclua uma seção curta "O que isso significa para você" e finalize lembrando que cada caso deve ser avaliado individualmente em consulta.
- Não escreva em primeira pessoa como se fosse o médico relatando casos próprios.
- body em HTML simples usando apenas <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <blockquote>. Entre 600 e 1000 palavras. Não inclua o título no body.
- excerpt: 1–2 frases (até 220 caracteres) que despertem a leitura.
- title: até 90 caracteres, informativo, sem caixa alta excessiva.`;

const schema = (cats) => ({
  type: 'object',
  additionalProperties: false,
  required: ['title', 'excerpt', 'categories', 'body', 'coverAlt'],
  properties: {
    title: { type: 'string' },
    excerpt: { type: 'string' },
    categories: { type: 'array', items: { type: 'string', enum: cats } },
    body: { type: 'string' },
    coverAlt: { type: 'string' },
  },
});

export default handle(async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' });
  if (!process.env.ANTHROPIC_API_KEY) throw fail(501, 'Assistente de IA não configurado (defina ANTHROPIC_API_KEY na Vercel).');

  const input = await body(req);
  let article = { title: input.title || '', description: input.summary || '', text: input.text || '', siteName: input.source || '', url: input.url || '', image: '' };
  if (input.url && !input.text) {
    try { const ex = await extract(input.url); article = { ...article, ...Object.fromEntries(Object.entries(ex).filter(([, v]) => v)) }; } catch { /* segue com o que veio do feed */ }
  }
  if (!article.text && !article.description && !article.title) throw fail(400, 'Não há conteúdo suficiente da notícia para gerar o rascunho.');

  const site = JSON.parse((await readFile('content/site.json')) || '{"categories":["Notícias"]}');
  const cats = site.categories?.length ? site.categories : ['Notícias'];

  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: schema(cats) } },
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `Notícia de referência (pode estar em outro idioma):
<fonte>${article.siteName || ''} — ${article.url || ''}</fonte>
<titulo>${article.title}</titulo>
<resumo>${article.description || ''}</resumo>
<texto>
${(article.text || '(texto completo indisponível; use apenas título e resumo e deixe claro que os detalhes devem ser conferidos na fonte)').slice(0, 14000)}
</texto>
${input.notes ? `\nOrientações do Dr. Neto para este texto:\n${String(input.notes).slice(0, 1500)}` : ''}

Escreva o rascunho do artigo.`,
    }],
  });

  if (response.stop_reason === 'refusal') throw fail(422, 'O assistente não conseguiu gerar este texto. Tente outra notícia ou escreva manualmente.');
  if (response.stop_reason === 'max_tokens') throw fail(502, 'O texto gerado foi cortado. Tente novamente.');
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  let draft;
  try { draft = JSON.parse(text); } catch { throw fail(502, 'Resposta do assistente em formato inesperado. Tente novamente.'); }

  send(res, 200, {
    ...draft,
    readMinutes: readMinutes(draft.body),
    cover: article.image || '',
    source: article.url ? { name: article.siteName || '', url: article.url } : null,
  });
});
