# Sprint 3 — Pedra da Ressurreição e compartilhar

## 1. Reviver sem trapaça — `reviveCrow` em `server/game.js`

O front só **pede** (`POST /api/revive`). Quem decide é o servidor, em 4 checagens, nesta ordem:

1. O Nózito está morto? (`CROW_ALIVE`)
2. Está dentro dos 7 dias e sem geração nova? (`R.canRevive` → `REVIVE_EXPIRED`)
3. A conta tem a Pedra? (`NO_STONE`)
4. Grava tudo de uma vez num `db.batch`: gasta a Pedra, muda o corvo para `REVIVED`, registra o evento `REVIVE`.

Por que `batch`: ou tudo acontece, ou nada. Não existe "gastou a Pedra mas não reviveu".

Por que `qty >= 0` no banco (CHECK): se dois pedidos chegarem juntos com 1 Pedra só, o segundo falha
e o `catch` devolve `NO_STONE`. Mesma ideia da comida.

**Regra de dados:** `shared/rules.js` (`canRevive`, `revive`) calcula; `server/game.js` só lê/grava.

## 2. Por que não dá para reviver o I depois de invocar o II

`currentCrow` sempre pega a **geração mais nova**. Se o II já nasceu, o I nem é lido pelo `reviveCrow`.
Sem `if` extra: a estrutura já impede.

## 3. Tela de morte — `render()` em `src/game/app.js`

O botão "Usar Pedra" só aparece se `qty('consumable_pedra_ressurreicao') > 0` **e** `R.canRevive(crow, agora)`.
É só conveniência: o servidor revalida tudo de qualquer jeito.

## 4. Compartilhar — `doShare`

Chama `bridge.share({ texto })`, que manda `enois:share` com origem explícita. O Énóis mostra a prévia
e **o jogador clica em publicar**. O Nózito nunca publica sozinho.

**Exercícios (≈30 min):**
1. Em `REVIVE_WINDOW_MS` (`shared/rules.js`), troque 7 por 1 e rode `npm test`. Veja qual teste quebra. Desfaça.
2. Em `tests/api.test.js`, leia o teste "recusa sem Pedra…" e diga em voz alta por que o 2º `revive` vira `REVIVE_EXPIRED`.
