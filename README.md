# Nózito

A pixel-art virtual pet (a little crow) that lives inside [Énóis](https://enois.ia.br), the Brazilian tech community, and on its own at **[nozito.victorvk.com](https://nozito.victorvk.com)**.

Feed it, play mini-games with it, dress it up. If its belly stays empty for too long it dies, and the next generation (Nózito II, III…) inherits what it was wearing.

> 🇧🇷 O jogo é em português. Para contribuir, veja o [CONTRIBUTING.md](CONTRIBUTING.md).

## How it works

- **Server-authoritative rules.** Hunger is computed from timestamps on the server, no cron jobs. `shared/rules.js` is the single source of truth, shared by client and API and covered by tests.
- **Anti-cheat mini-games.** The server opens each round and only accepts the result after a minimum time, with the score capped per game.
- **Énóis integration.** Runs in an iframe and talks to the host only through `postMessage` with an explicit origin. Login: Énóis token → validated server-side → own Bearer session. Guests can play without it.
- **Content as data.** Every item (food, hats, nests, skies) lives in `content/items.json`. Prices and effects never live in code.
- **Sprites as text.** Pixel art is written as text grids in `tools/build_sprites.py` and generated into `src/art/sprites.js`. No sprite PNGs in the repo.
- **Security.** CSP and `frame-ancestors` in `public/_headers`, parameterized SQL, rate limit on session creation.

## Stack

Vite + vanilla JavaScript (ES modules, Canvas 2D) · Cloudflare Pages + Functions · D1 (SQLite) · Vitest.

## Run locally

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate
npm run api        # full game + API at http://localhost:8788
npm test
```

With hot reload: `npm run api` in one terminal and `npm run dev` in another. A fake Énóis host is at `http://localhost:5173/dev/enois.html?game=/`.

## Project layout

```
src/        game client (render, UI, mini-games, Énóis bridge)
server/     API logic (routes, auth, game)
functions/  Cloudflare Pages Functions, thin wrappers around server/
shared/     game rules used by client and server
content/    items.json
migrations/ D1 schema (additive only)
tests/      Vitest: rules, items, bridge and full API on real SQLite
docs/       changelog, art style guide, study notes per sprint
```

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first. It has the game rules that shouldn't change without discussion.

## License

MIT
