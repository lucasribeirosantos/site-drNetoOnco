# Dr. Neto Pereira — Site + Estúdio do Blog

Site institucional premium (HTML/CSS/JS + GSAP/ScrollTrigger/Lenis) com blog estático e um painel
("Estúdio") para alimentar o blog — inclusive a partir de notícias de oncologia.

## Estrutura

```
src/partials/        cabeçalho, rodapé e <head> compartilhados
src/pages/           home e política de privacidade (templates)
css/style.css        design system + layout
js/main.js           todas as animações (loader, transições, scroll)
assets/img/          imagens otimizadas (WebP) usadas no site
content/posts/*.json um arquivo por artigo do blog (15 migrados do site antigo)
content/feeds.json   fontes RSS do Radar de notícias
content/site.json    categorias, links do currículo e da revista
admin/               Estúdio do Blog (painel)
api/                 funções serverless (login, posts, radar, IA)
scripts/build.mjs    gera o site final em /public
scripts/dev.mjs      servidor local (site + painel + API)
_material-original/  backup de tudo que foi extraído do site antigo
```

## Rodar localmente

```bash
npm install
npm run dev
```

- Site: http://localhost:3000 · Painel: http://localhost:3000/admin/
- Sem `.env`, a senha local do painel é `admin-local`. Em modo local os artigos são gravados direto em `content/posts/`.

## Publicar na Vercel

1. Suba esta pasta para um repositório no GitHub.
2. Importe o repositório na Vercel (framework: **Other**). O `vercel.json` já define build e saída.
3. Em **Settings → Environment Variables**, cadastre:

| Variável | Para quê |
|---|---|
| `ADMIN_PASSWORD` | senha do Estúdio (`/admin`) |
| `SESSION_SECRET` | texto aleatório longo (assina as sessões) |
| `GITHUB_TOKEN` | token *fine-grained* com permissão **Contents: Read and write** somente neste repositório |
| `GITHUB_REPO` | `usuario/repositorio` |
| `GITHUB_BRANCH` | normalmente `main` |
| `ANTHROPIC_API_KEY` | opcional — ativa o botão "Rascunho com IA" |

**Como a publicação funciona:** ao clicar em *Publicar*, o painel grava o artigo (e as imagens) no
GitHub em um único commit; a Vercel detecta o commit e reconstrói o site em ~1 minuto.

## Estúdio do Blog

- **Artigos** — criar, editar, salvar rascunho, publicar e excluir. Editor visual com títulos, listas,
  citações, links e imagens; colar de Word/Google Docs é limpo automaticamente; capa por arrastar-e-soltar
  (redimensionada e convertida para WebP no navegador).
- **Radar de notícias** — agrega Google Notícias (PT), Agência Brasil, ScienceDaily, Medical Xpress,
  Nature e News-Medical. Filtros por termo, idioma e fonte. *Usar como base* abre o editor com fonte e
  título preenchidos. *Rascunho com IA* (opcional) lê a matéria — inclusive em inglês — e escreve um
  rascunho em português na voz do blog, sempre salvo como rascunho para revisão médica.
- **Fontes** — adicionar/remover/desativar feeds e filtrar por palavras-chave.

Links do Google Notícias são redirecionamentos: abrem normalmente no navegador, mas o servidor nem
sempre consegue ler o texto completo deles. Para a IA, prefira itens das fontes diretas.

## SEO e migração

- URLs antigas dos posts (`/slug-copy`) redirecionam (301) para `/blog/slug/` — ver `vercel.json`.
- `sitemap.xml`, `robots.txt`, `feed.xml` (RSS), Open Graph e dados estruturados (Physician / BlogPosting)
  são gerados no build.

## Pendências de conteúdo

- **Currículo (PDF)** e **matéria da Revista Alô Doutor (PDF)**: os links do site antigo retornam 404.
  Coloque os arquivos em `assets/docs/` e atualize `curriculoUrl` e `revistaUrl` em `content/site.json`.
- O link de telefone do site antigo discava `3229-8200` enquanto o texto mostrava `3229-8280`; o novo site
  usa **3229-8280** em tudo — confirmar com o cliente.
