# Changelog

## [Sprint 4] — 2026-11-05 · No ar

### Publicado
- https://nozito.victorvk.com no Cloudflare Pages (repo `Victorvkdev/nozito`, branch `main`, build `npm run build`, saída `dist`).
- D1 `nozito-db` criado e `migrations/0001_init.sql` aplicada pelo Console do painel.
- Testado em produção: convidado, alimentar e minijogo funcionando.
- Rate limit no WAF da Cloudflare: `/api/session` em `nozito.victorvk.com`, 10 requisições por IP a cada 10 segundos, bloqueio de 10 segundos.
- A partir daqui: só migrations novas (`0002_*.sql`), nunca editar a `0001`.

### Pendente
- `ENOIS_GAME_ID` em `wrangler.toml` quando o jogo for cadastrado no Énóis (liga o login pelo Énóis).
- Compra com Faísca (depende da issue `enois-spend-result`).

## [Sprint 3] — 2026-11-04 · Pedra da Ressurreição e compartilhar

### Adicionado
- `POST /api/revive`: gasta 1 Pedra da Ressurreição da conta e revive o **mesmo** corvo (até 7 dias da morte,
  só se não houver geração mais nova). Volta com barriga 60 e humor 50. Erros: `CROW_ALIVE`, `NO_STONE`, `REVIVE_EXPIRED`.
- Tela de morte: botão "Usar Pedra da Ressurreição" (aparece só com Pedra no inventário e dentro da janela)
  e aviso quando a janela de 7 dias passou.
- Botão "Compartilhar no Énóis" na tela de morte (`enois:share`; o clique de publicar é sempre do jogador).
- Testes: ressurreição (mesmo corvo, Pedra gasta, sem Pedra, janela expirada, próximo da linhagem).

### Pendente
- A Pedra só chega ao inventário por compra com Faísca, que depende do Énóis confirmar o pagamento
  (`docs/issues/enois-spend-result.md`). Até lá, só no laboratório local (botão "ganhar itens").

## [Sprint 2] — 2026-11-04 · Barriga, minijogos e loja

### Mudou (decisões do Vk)
- **Sem moeda interna.** Sementes saíram do jogo. Tudo que se compra é com Faísca.
- **Barriga 0–100** no lugar do "prazo por comida": esvazia 100 em 24h; vazia por 12h = morte (cheia → morte = 36h).
- **Minhocas não se compram:** vêm do minijogo Cata Minhoca e **estragam em 24h** (máx. 10 guardadas).
- **Humor importa:** Nózito feliz (humor ≥ 70) dá +1 minhoca por rodada.
- **Caça ao Brilho** sobe o humor e pode achar **tesouros do ninho**: 9 colecionáveis (comum, raro,
  lendário) que nunca repetem e enfeitam o galho. Petisco brilhante saiu.
- Comidas com Faísca têm bônus de humor e efeito temporário (Sopa quentinha: digestão lenta 24h).
- Sem limite de refeições por dia: o limite agora é a barriga cheia (≥ 95).

### Caça ao Brilho refeita (2026-11-04)
- **O Nózito voa e você controla:** arraste o dedo (ou ← → / A D) e ele voa até lá, com velocidade limitada. Pega o brilho com o corpo, não com toque.
- **Combo:** pegar em sequência (janela de 2s) sobe o multiplicador: x2 a partir de 6, x3 a partir de 14.
- **Risco:** pedra atordoa 0,6s, zera o combo e tira 3 pontos (1,4s de proteção depois).
- **Variedade:** cristal dourado rápido em zigue-zague (+5), trilhas de 4 moedas, ímã de 3s que puxa brilhos.
- **Meta:** 3 estrelas (10, 30 e 50 pontos) com barra de progresso na tela; a 1ª estrela libera a chance de tesouro.
- Teto do servidor da rodada: 60 → 80 pontos (`shared/rules.js`). Sem mudança na recompensa.
- `screen.js`: minijogos podem devolver pontos no `update`, aceitar `move` (arrastar) e `keyup`.

### Adicionado
- Telas com abas: Ninho, Minhocas, Brilho, Loja.
- Cata Minhoca (toque ou teclas 1–6) e Caça ao Brilho (toque ou Espaço), 20s, validados no servidor
  (`/api/round/start` e `/api/round/finish`: tempo mínimo, expiração, teto de pontos, rodada única).
- Despensa: come do estoque, mostra efeito de cada comida e quando a minhoca estraga.
- Coleção "Tesouros do ninho" na tela da Caça ao Brilho.
- Loja (vitrine) por categoria; equipar/tirar o que já tem (`/api/equip`). Compra: "em breve".
- Cosméticos desenhados no corvo: chapéu, óculos, capa (atrás), ninho e céu (papel de parede).
- Itens novos: Frutinhas silvestres, Sopa quentinha, Gorro de lã, Óculos redondos, Óculos de estrela,
  Capa violeta, Capa da noite, Ninho de almofada, Céu de aurora, Pôr do sol.
- Laboratório local: botão "ganhar itens" na loja (`/api/dev/grant`, só com `ENOIS_DEV_FAKE` + localhost).
- Testes: barriga e digestão lenta, minijogos (tempo, teto, rodada repetida, rodada de outro jogador),
  estoque, equipar, herança de cosméticos, compra indisponível.

### Removido
- `dev/playground.*` (o laboratório agora abre o jogo de verdade em `/dev/enois.html`).

### Atenção
- `migrations/0001_init.sql` foi reescrita (o banco ainda não estava no ar). Banco local precisa ser recriado.

## [Sprint 1] — 2026-11-03 · Nózito vivo na tela

### Adicionado
- Arte: `tools/build_sprites.py` gera `src/art/sprites.js` (Nózito 32×32 com idle, happy, eat, pet,
  hungry, weak, dead, squash; comidas, Semente, coração, Pedra, chapéus, ninhos, lápide).
  `src/art/render.js` desenha com cache e palette swap (skins `weak` e `ghost`).
  `tools/sprite-sheet.html` para revisar os sprites antes do commit.
- Cenário padrão em pixels (céu em faixas, estrelas piscando, lua pontilhada, galho, ninho, névoa).
- Tela inicial mobile-first: palco com escala inteira, barras de 10 segmentos (Barriga e Humor),
  Alimentar (folha de comidas), Carinho (botão ou toque no Nózito), lápide + "Invocar Nózito II",
  cemitério da linhagem, toasts. Sem alert/confirm. `prefers-reduced-motion` respeitado.
- API (Pages Functions + D1): `POST /api/session` (token do Énóis ou convidado), `GET /api/state`,
  `POST /api/feed`, `POST /api/pet`, `POST /api/summon`. Morte, preço e saldo decididos no servidor.
- Login: dentro do Énóis usa `enois:identity` → `POST /api/games/tokens/validate` (confere `gameId`).
  Fora do Énóis (ou se o login falhar) joga como convidado. Sessão própria por Bearer, 30 dias.
- Fontes Pixelify Sans e VT323 servidas do próprio domínio (`@fontsource`).
- `wrangler.toml`, `.dev.vars.example`, `vite.config.js` (proxy /api e nada inline em `data:`).
- `dev/enois.html?game=/` abre o jogo de verdade dentro do Énóis de mentira.
- Testes: API completa sobre SQLite real com a migration (sessão, login Énóis, alimentar, limites,
  morte, linhagem, carinho, isolamento entre jogadores) e sprites do catálogo.

### Decisões
- Conta nova começa com 30 Sementes (até o minijogo existir, na Sprint 2).
- Comida em Faísca e Pedra da Ressurreição aparecem como "em breve" (aguardam a issue no Énóis).
- O jogo não depende do Énóis: com ou sem a integração, roda no próprio domínio.

### Pendente
- Limite de criação de contas convidadas (regra de rate limit na Cloudflare em `/api/session`).

## [Não lançado]

### Adicionado
- `docs/ARTSTYLE.md` (estilo visual, herdado do Krowlect).
- `dev/`: laboratório local (`/dev/enois.html`) que simula o Énóis e mostra as regras rodando. Fica fora do build.

### Alterado
- Pipeline de arte: sprites em texto (`src/art/sprites.js`) em vez de PNG do Piskel, como no Krowlect.
  `items.json` → `sprite` agora é o id do sprite.
- Fontes servidas do próprio domínio (CSP sem Google Fonts).

## [Sprint 0] — 2026-10-31 · Fundação

### Adicionado
- `CONTRIBUTING.md` com as regras do repo.
- `shared/rules.js`: fome por fração do prazo, morte preguiçosa (`died_at = deadline_at`), limite de
  3 refeições/dia, humor com queda por hora, carinho 1x/hora, recompensa da Caça ao Brilho com teto
  diário, linhagem (Nózito, II, III…), Pedra da Ressurreição (7 dias), conversão Faísca → milésimos.
- `content/items.json`: Minhoca, Petisco brilhante, Banquete, Pedra da Ressurreição, Cartola,
  Coroa de tampinha, Ninho de galhos, Céu estrelado.
- `migrations/0001_init.sql`: players, sessions, crows (1 vivo por conta), inventory, equipped,
  purchases, daily, events.
- `public/_headers`: CSP com `frame-ancestors 'self' https://enois.ia.br`, sem X-Frame-Options.
- `src/enois/bridge.js`: loading/ready/error/identity/share/spend, origem explícita, validação dos limites.
- Testes Vitest: regras (fome, morte, ressurreição, humor), catálogo e ponte.
- `docs/issues/enois-spend-result.md`: texto da issue para o Énóis.

### Decisões tomadas (GDD tinha lacunas/contradições)
1. "3 dias sem comer = morte" vale para Minhoca; Banquete dá 120h. Prazo é por comida.
2. GDD lista 5 estados de sprite mas só 3 faixas (terços). Adotado quartis: feliz < 25% ≤ com fome
   < 50% ≤ faminto < 75% ≤ fraco < 100% = morto (constante `HUNGER_THRESHOLDS`).
3. "Prazo contado da última refeição" encurtaria o Banquete ao comer Minhoca. Adotado: prazo nunca encurta.
4. Invocar Nózito II fecha a janela da Pedra do Nózito I (1 corvo vivo por conta).
5. Sequência fica na conta (`players.streak_days`), então a Pedra "mantém a sequência" por padrão.
6. Dia do jogo = America/Sao_Paulo (mesmo fuso da presença do Énóis).
7. Humor: começa 70, cai 2/h, carinho +10, minijogo +15, revive com 50. Ajustáveis.
