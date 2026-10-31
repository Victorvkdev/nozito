# Changelog

## [Sprint 0] — 2026-10-31 · Fundação

### Adicionado
- `CLAUDE.md` com as regras do repo.
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
