# Sprint 2 — Barriga, minijogos e loja

## 1. Barriga por timestamp — `shared/rules.js`

Antes: cada comida dava um **prazo**. Agora: a barriga é um número de 0 a 100 que **cai com o tempo**.

O servidor não guarda "a barriga agora". Guarda só **o valor e a hora da última mudança**
(`belly`, `belly_at`). Para saber a barriga em qualquer momento:

```
barriga(agora) = belly − (horas desde belly_at × 4,17)   ← 100 ÷ 24h
```

Por que assim: ninguém precisa "descontar fome" de hora em hora. Abriu o jogo → faz a conta.
É a mesma ideia do humor (`mood`, `mood_at`).

**Hora da morte** (`deadline_at`): quando a barriga chega a 0, mais 12h. É recalculada a cada refeição,
então o servidor descobre se o Nózito morreu só comparando `agora ≥ deadline_at`.

**Exercício:** em `BELLY_HOURS_TO_EMPTY`, troque 24 por 48 e rode `npm test`. Veja quais testes de barriga
quebram e por quê. Desfaça.

## 2. Efeito temporário por trechos — `bellyDecay` e `emptyAt`

A Sopa quentinha faz a barriga cair na **metade da velocidade** por 24h (`slow_until`).
A conta vira dois trechos: a parte lenta (até `slow_until`) e a parte normal (depois).

Leia `bellyDecay(from, to, slowUntil)`: ela corta o intervalo em dois e soma.
`emptyAt` faz o caminho inverso: "com essa barriga, quando ela acaba?".

**Exercício:** no teste `'Sopa quentinha: esvazia na metade...'`, calcule no papel os números antes de ler.

## 3. Minijogo que o jogador não consegue trapacear (muito) — `server/game.js`

O jogo roda no navegador, então o jogador **pode** mandar qualquer pontuação. Defesas:

1. **O servidor abre a rodada** (`/api/round/start`) e guarda `started_at`.
2. **O fim só vale depois de 20s** e antes de 80s (`validateRound`).
3. **Teto de pontos** por jogo (`maxScore`): mandar 9999 vira 40.
4. **Rodada única:** `UPDATE ... WHERE finished_at IS NULL` só muda uma vez. A segunda tentativa não muda nada.
5. **Recompensa limitada:** no máximo 5 minhocas por rodada (6 com o Nózito feliz) e 10 guardadas.

Resultado: o pior que um trapaceiro faz é ganhar 5 minhocas a cada 20s — o mesmo que um jogador bom.
Quando o prêmio é pequeno, "trapaça barata" não compensa.

## 3b. Comida que estraga — `food_batches`

Cada rodada do Cata Minhoca cria uma **leva** com `expires_at = agora + 24h`. Ao comer, o servidor
gasta da leva mais antiga (`ORDER BY expires_at LIMIT 1`). O que passou do prazo é apagado quando
alguém abre o jogo ("limpeza preguiçosa", igual à morte). Por isso não dá para estocar: tem que voltar todo dia.

## 3c. Sorteio testável — `pickTreasure(treasures, owned, score, rand)`

O tesouro é sorteado, mas a função recebe o sorteador (`rand`) por parâmetro. No servidor é
`crypto.getRandomValues`; nos testes é `() => 0`, então o resultado é sempre o mesmo e dá para testar.
Mesma ideia do `now` passado por parâmetro: tudo que muda sozinho (relógio, sorte) entra de fora.

## 4. Inventário e `CHECK (qty >= 0)`

Comer gasta 1 do estoque com `UPDATE inventory SET qty = qty - 1`. Se dois cliques chegarem juntos
com 1 minhoca, o segundo deixaria `qty = -1` → o `CHECK` recusa → o `batch` desfaz tudo.
Mesmo truque do Sprint 1, aplicado ao estoque.

## 5. Cosméticos com âncora — `items.json` + `src/render/stage.js`

Cada vestível tem `anchor: [x, y]`: onde o canto do sprite fica em relação ao corvo 32×32.
Ordem de desenho: **capa → corvo → óculos → chapéu** (capa atrás, chapéu por cima).
Quando o corvo pula (frame `happy`), o deslocamento é aplicado também aos cosméticos.

Céu (`wallpaper`) é só dado: `sky: ["k","M","C","ã"]` = 4 cores da paleta, de cima para baixo.
Item novo de céu não precisa de código.

**Exercício:** mude o `anchor` da Cartola para `[9, -9]`, rode `npm run api` e veja o chapéu flutuar.

## 6. Telas com abas sem framework — `src/game/app.js`

Cada tela é um `<main hidden>`. A função `go(nome)` mostra uma e esconde as outras, marca a aba com
`aria-current="page"` (leitor de tela anuncia qual está ativa) e pausa o canvas do ninho quando sai dele
(economiza bateria).

## Revisão rápida

1. Por que guardar `belly` + `belly_at` em vez de atualizar a barriga a cada hora?
2. O que impede alguém de mandar `score: 9999` e encher o estoque?
3. Por que a capa é desenhada antes do corvo?
4. Onde criar um céu novo? Precisa de código?
5. Por que `pickTreasure` recebe `rand` em vez de chamar `Math.random()` lá dentro?

<details><summary>Respostas</summary>

1. Não precisa de robô/cron; a conta é feita quando alguém abre o jogo, e o resultado é sempre o mesmo.
2. Teto de pontos, máximo de 5 (ou 6) por rodada, 10 guardadas e rodada que só fecha uma vez, depois de 20s.
3. Para ficar atrás do corpo (o corvo cobre a parte da capa que ficaria na frente).
4. Em `content/items.json`, com `sky` de 4 cores da paleta + um ícone em `tools/build_sprites.py`. Código não.
5. Para o teste controlar a sorte e o resultado ser sempre o mesmo.

</details>
