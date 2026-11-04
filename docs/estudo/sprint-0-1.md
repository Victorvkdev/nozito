# Sprint 0 + 1 — Fundação e o Nózito na tela

## 1. O mapa geral

```
Navegador (src/)                     Cloudflare (functions/ + server/)        Banco (D1)
┌──────────────────────┐   fetch    ┌────────────────────────────────┐  SQL  ┌──────────┐
│ tela, canvas, botões │ ─────────▶ │ /api/state, /api/feed, ...     │ ────▶ │ players  │
│ anima com rules.js   │ ◀───────── │ decide com rules.js            │ ◀──── │ crows ...│
└──────────────────────┘    JSON    └────────────────────────────────┘       └──────────┘
          ▲  postMessage                          │ POST /api/games/tokens/validate
          ▼                                       ▼
     Énóis (iframe pai)  ─────────────────────▶  Énóis (servidor)
```

Ideia central: **o navegador mostra, o servidor decide.** Quem joga controla o navegador
(DevTools, relógio do celular), então nada que vale "dinheiro" ou "vida" pode ser decidido lá.

---

## 2. Regras puras — `shared/rules.js`

**O que é:** funções que recebem dados e devolvem dados, sem ler relógio, banco ou rede.
`now` sempre chega por parâmetro.

**Por que:** a mesma função roda no front (para animar a barra de fome) e no servidor (para decidir
a morte). Como é "pura", é fácil de testar: entrada X → saída Y, sempre.

**Leia:** `hungerStage`, `resolveCrow`, `feed`.
- Fome = fração do prazo consumida: `(agora − última refeição) / (prazo − última refeição)`.
- Morte "preguiçosa": não existe um robô matando corvos de madrugada. Quando alguém abre o jogo,
  o servidor vê que `agora ≥ prazo` e grava a morte com `died_at = deadline_at` (a hora real).

> Na Sprint 2 a fome virou barriga 0–100 (ver sprint-2.md). Exercício atualizado:

**Exercício:** em `BELLY_THRESHOLDS`, troque `60` por `70`. Rode `npm test` e veja qual teste
quebra e por quê. Desfaça.

---

## 3. Testes — `tests/` com Vitest

**O que é:** código que verifica o código. `expect(a).toBe(b)` falha se `a` não for `b`.

**Por que:** você muda uma regra hoje e um teste avisa se quebrou algo de ontem.
`tests/api.test.js` testa o servidor inteiro com um SQLite de verdade (`tests/helpers/d1.js`),
sem precisar da Cloudflare.

**Leia:** o teste `'morre no prazo; morto não come; invoca Nózito II'`. Ele avança um relógio
falso (`clock += 80 * HOUR`) — por isso dá para testar 3 dias em 1 milissegundo.

**Exercício:** `npm run test:watch` e mude `BELLY_START` para 50. Veja os testes ficarem
vermelhos ao salvar. Desfaça.

---

## 4. Banco — `migrations/0001_init.sql` (Cloudflare D1 = SQLite)

**Tabelas:** `players` (conta), `crows` (um por geração), `inventory`, `equipped`, `purchases`,
`daily` (contadores do dia), `events` (histórico), `sessions` (login).

**Por que os `CHECK`:** são a última linha de defesa. Se dois cliques chegarem juntos e o código
deixar passar, o banco recusa `seeds < 0` ou `meals > 3` e desfaz tudo (transação).
O índice `uq_crows_one_living` garante **um Nózito vivo por conta**, mesmo com bug no código.

**Exercício:** com o servidor rodando, em outra janela:
`npx wrangler d1 execute nozito-db --local --command "SELECT name, status FROM crows"`

---

## 5. Servidor — `functions/api/*.js` → `server/`

**O que é:** Pages Functions. Cada arquivo em `functions/api/` vira uma rota
(`feed.js` → `POST /api/feed`). Eles só importam o handler de `server/routes.js`.

**Fluxo de `POST /api/feed`:**
1. `requireSession` lê `Authorization: Bearer …` e acha o `playerRef`.
2. `feedCrow` valida o item no `items.json` (o front nunca manda preço).
3. `rules.feed` aplica a regra (morto? limite do dia?).
4. `db.batch([...])` grava tudo junto: tira Sementes, soma refeição, atualiza o corvo, registra evento.

**Segurança aplicada:** SQL sempre com `?` + `.bind()` (nunca texto colado → sem SQL injection);
token de sessão guardado só como **hash** SHA-256; corpo do pedido limitado a 4 KB.

---

## 6. Login — Énóis ou convidado (`server/auth.js`, `src/main.js`)

1. Dentro do Énóis, o jogo manda `enois:identity`. O Énóis responde com um **token de uso único**.
2. O front manda o token para **o nosso** servidor (`POST /api/session`).
3. O servidor troca no Énóis (`POST https://enois.ia.br/api/games/tokens/validate`) e recebe
   `{ gameId, playerRef }`. Confere se o `gameId` é o do Nózito.
4. Cria uma sessão própria e devolve o token dela para o front.

Fora do Énóis, cai no modo **convidado**. Por isso o jogo funciona em qualquer lugar.

**Por que não cookie?** Dentro de iframe de outro site, o Safari bloqueia cookies. Bearer no header não.

---

## 7. A ponte com o Énóis — `src/enois/bridge.js`

`postMessage` é como duas páginas (o Énóis e o jogo no iframe) conversam.

- **Sempre** com origem explícita (`https://enois.ia.br`), nunca `"*"` — senão qualquer site que
  embutisse o jogo leria as mensagens.
- Ao receber, confere `event.source === window.parent` e `event.origin`. Mensagem de outro lugar é ignorada.

**Exercício:** abra `http://localhost:5173/dev/enois.html?game=/` (com `npm run api` numa janela e
`npm run dev` em outra) e veja o log de mensagens do lado direito.

---

## 8. Arte em texto — `tools/build_sprites.py` → `src/art/sprites.js`

Cada sprite é uma lista de linhas; **1 caractere = 1 pixel** (`.` = transparente, `k` = contorno…).
O Python monta o corvo com formas (círculo da cabeça, elipse do corpo), aplica luz/sombra e contorno,
e gera as variações (piscar, comer, `^ ^`, X).

`src/art/render.js` desenha no canvas com **cache** e **palette swap**: a skin `weak` troca as cores
do corpo por tons cinzas, sem redesenhar.

**Exercício:** em `build_sprites.py`, troque `"ç": "#e98aa6"` por outro rosa, rode `npm run sprites`
e abra `http://localhost:5173/tools/sprite-sheet.html`.

---

## 9. Pixel perfeito na tela — `src/render/stage.js`

O canvas tem poucos pixels "lógicos" (≈90 de largura) e o CSS o estica por um número **inteiro**
(×4, ×5…) com `image-rendering: pixelated`. Escala inteira = nenhum pixel borrado.

Animação em "degraus" (`steps()`): troca de frame a cada X ms, como nos jogos antigos.
`prefers-reduced-motion` desliga tremor e pulos para quem pediu menos movimento no sistema.

---

## 10. Segurança do site — `public/_headers`

`Content-Security-Policy` diz ao navegador de onde o site pode carregar coisas. O nosso só aceita
o próprio domínio (por isso as fontes vêm do `@fontsource`, não do Google) e
`frame-ancestors 'self' https://enois.ia.br` — só o próprio site e o Énóis podem embutir o jogo.

---

## Revisão rápida (responda de cabeça)

1. Por que a morte não é calculada só no navegador?
2. O que acontece no banco se dois pedidos de "alimentar" chegarem juntos com 5 Sementes?
3. Por que o `postMessage` nunca usa `"*"`?
4. Onde mudar o preço da Minhoca? Precisa mexer em código?
5. Por que o canvas usa escala inteira?

<details><summary>Respostas</summary>

1. O jogador controla o navegador (relógio, DevTools). O servidor é a única fonte confiável.
2. O primeiro passa; no segundo o `CHECK (seeds >= 0)` falha e o `batch` desfaz tudo.
3. Para a mensagem só chegar ao Énóis, nunca a um site que embuta o jogo.
4. `content/items.json`. Não precisa mexer em código.
5. Para cada pixel lógico virar um bloco inteiro de pixels de tela, sem borrar.

</details>
