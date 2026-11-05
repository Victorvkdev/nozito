# Contribuindo com o Nózito

Valeu por querer ajudar! Antes de abrir um PR, dá uma lida nas regras abaixo: elas mantêm o jogo justo,
seguro dentro do iframe do Énóis e com a mesma cara em todo lugar.

**Como contribuir**
1. Abra uma issue descrevendo a ideia ou o bug (ou pegue uma com o label `good first issue`).
2. Faça um fork, crie uma branch (`feat/...`, `fix/...`) e rode `npm test` e `npm run build`.
3. Abra o Pull Request para a `main` explicando o que mudou e como testar. O CI roda os testes e o build.

Para entender o código por partes, a [trilha de estudo](docs/estudo/README.md) explica cada sprint com exercícios.

## Regras de jogo (não mudar sem atualizar docs/CHANGELOG.md)
- Barriga 0–100 por timestamp, decidida no servidor, sem cron. `shared/rules.js` é a única fonte de cálculo.
- Esvazia 100 em 24h; vazia por 12h = morte (cheia → morte = 36h). `deadline_at` = hora da morte, recalculada a cada refeição; `died_at = deadline_at`.
- Comida enche `effects.belly`; recusa com barriga ≥ 95. `slowDigestionHours` = esvazia na metade da velocidade.
- Morte → lápide → invocar próximo (Nózito II, III…). Inventário é da conta; o próximo herda o que estava vestido.
- Pedra da Ressurreição: até 7 dias da morte e só se não houver geração mais nova.
- Humor baixo nunca mata.

## Moeda e itens
- Só existe **Faísca** (moeda da Rede Énóis, fora da história do jogo). Não há moeda interna.
- Minhoca: só no Cata Minhoca, estraga em 24h (`freshHours`, tabela `food_batches`), máx. 10 guardadas.
  Humor ≥ 70 dá +1 minhoca por rodada.
- Caça ao Brilho: sobe humor e pode achar um **tesouro** (colecionável único, enfeita o galho do ninho).
- Todo o resto (comidas melhores, chapéus, óculos, capas, ninhos, céus, Pedra) é Faísca, via `enois:spend`.
  `items.json` guarda Faísca em unidades inteiras; o protocolo usa milésimos (`protocolAmount`).
- Item pago só é entregue depois de o servidor confirmar o débito no Énóis. Enquanto o endpoint
  de confirmação não existir, a loja mostra "em breve" (`POST /api/buy` → `PAYMENT_UNAVAILABLE`).
- Minijogos: o servidor abre a rodada (`/api/round/start`) e só aceita o fim depois de 20s
  (`/api/round/finish`), com pontuação limitada ao máximo do jogo.

## Conteúdo
- Todo item vive em `content/items.json`. Item novo = sprite em `tools/build_sprites.py` + entrada no JSON
  (vestíveis com `anchor` relativo ao corvo 32×32; céus com `sky` = 4 cores da paleta).
  Nunca colocar preço, prazo ou efeito no código ou no front.

## Arte (fonte: `docs/ARTSTYLE.md`)
- Mesma família visual do Krowlect: noite, violeta, pixel art crocante. Nózito = filhote fofo, 32×32 em 4x.
- Sprites em texto (1 char = 1 pixel, `.` transparente, chars da paleta do ARTSTYLE) em `src/art/sprites.js`,
  gerados por `tools/build_sprites.py`. Piskel só para rascunho. Sem PNG de sprite no repo.
- Só cores da paleta. Contorno `k` (#0e0b16). Escala inteira. `imageSmoothingEnabled = false`.
- Fontes Pixelify Sans + VT323 servidas do próprio domínio (pacotes @fontsource), nunca do Google Fonts (CSP).
- Animações em `steps()`; respeitar `prefers-reduced-motion`.
- Faísca usa o ícone oficial do Énóis, sem redesenhar.

## Énóis
- Só usar o que existe no código anexado: `enois:loading|ready|error|identity|share|spend` e
  `POST https://enois.ia.br/api/games/tokens/validate`. Nada mais. Faltou algo → issue/PR no Énóis.
- `postMessage` sempre com origem explícita `https://enois.ia.br` (via `src/enois/bridge.js`). Nunca `"*"`.
- Proibido no iframe: `alert`, `confirm`, `prompt`, `window.open`, `<form>` submit, download.
- `public/_headers`: `frame-ancestors 'self' https://enois.ia.br`. Nunca `X-Frame-Options`.
- Login: token do Énóis → servidor valida → `playerRef` → sessão própria (Bearer, não cookie).
  `localStorage` no iframe é particionado: nunca é fonte de verdade.

## Stack e código
- Vite + JS puro (ES modules), Canvas 2D.
- Cloudflare Pages + Functions (`functions/api` só importa de `server/`) + D1 (`migrations/`).
  Segredos só em variáveis da Cloudflare. Toda rota nova: handler em `server/routes.js` + teste em `tests/api.test.js`.
- Testes: Vitest (`npm test`). Toda regra nova em `shared/rules.js` entra com teste.
- Migrations são só aditivas: nova mudança = novo arquivo `000N_*.sql`.
- UI: PT-BR, mobile-first, alvos de toque ≥ 44px, contraste AA, foco visível.

## Rodar local
- Uma vez: `cp .dev.vars.example .dev.vars` e `npm run db:migrate`.
- `npm run api` → jogo completo em http://localhost:8788 (build + Functions + D1 local).
- Com HMR: `npm run api` numa janela e `npm run dev` em outra (proxy /api). Énóis de mentira:
  http://localhost:5173/dev/enois.html?game=/
- Sprites: editar `tools/build_sprites.py`, rodar `npm run sprites`, revisar `/tools/sprite-sheet.html`.

## Fluxo
- `npm test` e `npm run build` antes de commitar. Commits no formato `feat:`, `fix:`, `docs:`, `chore:`.
- Revisar segurança (origem de mensagens, valores vindos do cliente, SQL parametrizado) a cada mudança.
- Cada entrega atualiza `docs/CHANGELOG.md`.
