# [Games] Confirmação de gasto para o jogo: `enois:spend:result` + `GET /games/{gameId}/despesas/{requestId}`

> Repos: `enois-frontend` e `enois-backend` · Área: Games / Faísca · Tipo: melhoria (+ 1 bug)

## Contexto
O protocolo v1 já permite que o jogo peça um gasto (`enois:spend`) e que a pessoa confirme na
plataforma (`POST /games/{gameId}/despesas` → `GameService.spendInGame`). O débito é idempotente por
`game:{gameId}:{requestId}` e vai para a tesouraria.

## Problema
Depois do clique, o Énóis debita mas **o jogo não fica sabendo**:
1. O player não devolve nenhuma mensagem ao quadro (sucesso, cancelamento ou falha).
2. Não existe endpoint para o **servidor do jogo** conferir se um `requestId` foi pago.

Sem isso, o jogo só consegue entregar o item confiando no cliente (fácil de forjar com DevTools) ou
não entrega nada. É o que hoje impede qualquer jogo de vender com Faísca de forma segura.

## Proposta

### 1. Frontend — mensagem `enois:spend:result` (Énóis → jogo)
Enviada pelo `game-detail.tsx` ao quadro ativo, com `targetOrigin` = origem cadastrada do jogo
(mesmo caminho já usado para entregar `enois:identity`):

```js
{ type: "enois:spend:result", version: 1, requestId: "…", status: "paid" | "cancelled" | "failed" }
```

| Quando | `status` |
| --- | --- |
| `confirmarGasto` `onSuccess` | `paid` |
| `onSpendDismiss` (pessoa fechou/cancelou) | `cancelled` |
| `confirmarGasto` `onError` (saldo, jogo não publicado, etc.) | `failed` |

- Só para o pedido do quadro/sessão atual (mesma regra de `doQuadroAtual`).
- Campo opcional `code` em `failed` (ex.: `INSUFFICIENT_FUNDS`) sem texto livre do servidor.
- É **informativa**: a mensagem nunca é prova de pagamento. O jogo confere no item 2.
- Compatível: jogos v1 ignoram tipos desconhecidos.

### 2. Backend — `GET /games/{gameId}/despesas/{requestId}?playerRef=plr_…` (servidor → servidor)
Resposta:

```json
{ "requestId": "…", "status": "paid", "amount": 3000, "paidAt": "2026-11-01T12:00:00Z" }
```

ou `{ "requestId": "…", "status": "not_found" }` (404 também serve, se preferirem).

- Busca o lançamento `PURCHASE` com ref `game:{gameId}:{requestId}` (já existe no ledger).
- Só devolve `paid` se o dono do lançamento gerar o mesmo `playerRef`
  (`GameIdentityService.playerRef(userId, gameId)`). Assim um jogo não consulta compra de outro jogo
  nem de outra pessoa.
- `cancelled`/`failed` não são guardados hoje (o cancelamento é só no cliente), então o endpoint
  responde só `paid` ou `not_found`. Não precisa de tabela nova.
- Sem dado pessoal na resposta. Rate limit por IP/jogo.
- Fase 2 (opcional, outra issue): chave secreta por jogo (`Authorization: Bearer gsk_…`) gerada no
  painel do criador, para autenticar o servidor do jogo.

### Fluxo resultante
1. Servidor do jogo cria a compra `PENDING` com `requestId` e `amount` decididos por ele.
2. Jogo envia `enois:spend` com esses valores.
3. Pessoa confirma → Énóis debita → envia `enois:spend:result` `paid`.
4. Jogo avisa o próprio servidor, que chama o `GET` e só então entrega o item (idempotente).

## Bug encontrado no mesmo fluxo
`GameService.spendInGame` registra o evento como `GameEventKind.SHARE`. Efeitos:
- cada gasto conta no limite de **12 compartilhamentos/dia** (`countByGameAndUserAndKindSince(…SHARE…)`);
- métricas de compartilhamento ficam infladas.
Sugestão: novo `GameEventKind.SPEND` (migração aditiva) e usar ele em `spendInGame`.

Nota de doc: o exemplo de G-share em `docs/GAMES.md` usa `postMessage(…, "*")`, o oposto do que
`docs/jogos-integracao.md` recomenda. Vale trocar por `"https://enois.ia.br"`.

## Critérios de aceite
- [ ] `enois:spend:result` enviado nos 3 casos, só para o quadro ativo e com origem explícita.
- [ ] `jogo-de-teste.html` mostra o resultado recebido.
- [ ] `GET …/despesas/{requestId}` devolve `paid` com `amount`/`paidAt` para o dono certo e
      `not_found` para `playerRef`, `gameId` ou `requestId` errados.
- [ ] Testes `MockMvc`: pago, não pago, playerRef de outra pessoa, jogo de outro criador, idempotência.
- [ ] `spendInGame` deixa de consumir a cota de compartilhamento (teste).
- [ ] `docs/jogos-integracao.md` atualizado (tabela "Do Énóis para o jogo" + seção do endpoint).

## Segurança
- Mensagem ao quadro nunca carrega sessão, saldo ou dado pessoal.
- Endpoint só lê; não altera saldo. Valida `gameId`, `requestId` (tamanho/charset) e `playerRef`.

---
Posso abrir o PR dos dois lados (Victorvkdev, autor do Nózito, primeiro jogo a usar o fluxo).
