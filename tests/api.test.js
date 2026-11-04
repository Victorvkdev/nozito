import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createD1 } from './helpers/d1.js';
import * as routes from '../server/routes.js';
import { HOUR, DAY } from '../shared/rules.js';

const T0 = Date.UTC(2026, 10, 3, 15);
let env;
let clock;

beforeEach(() => {
  clock = T0;
  env = { DB: createD1(), ALLOW_GUEST: 'true', NOW: () => clock, ENOIS_GAME_ID: 'game_nozito' };
});

function req(path, { method = 'GET', body, token, host = 'nozito.victorvk.com' } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request(`https://${host}/api/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function call(name, opts) {
  const res = await routes[name]({ request: req(name, opts), env });
  return { status: res.status, data: await res.json() };
}
const post = (name, token, body = {}, extra = {}) => call(name, { method: 'POST', token, body, ...extra });

async function guest() {
  const { status, data } = await post('session', undefined, { guest: true });
  expect(status).toBe(201);
  return data.sessionToken;
}

const give = (token, itemId, qty) =>
  env.DB.prepare('INSERT INTO inventory (player_ref, item_id, qty) SELECT player_ref, ?, ? FROM sessions LIMIT 1').bind(itemId, qty).run();

async function playRound(token, game, score) {
  const s = await post('roundStart', token, { game });
  expect(s.status).toBe(201);
  clock += 20_000;
  return post('roundFinish', token, { roundId: s.data.roundId, score });
}

describe('sessão', () => {
  it('convidado nasce com o primeiro Nózito, sem moeda interna', async () => {
    const token = await guest();
    const { status, data } = await call('state', { token });
    expect(status).toBe(200);
    expect(data.crow.name).toBe('Nózito');
    expect(data.crow.belly).toBe(80);
    expect(data.inventory).toEqual({});
    expect(JSON.stringify(data)).not.toMatch(/seed/i);
  });

  it('sem token, token falso ou expirado → 401', async () => {
    expect((await call('state')).status).toBe(401);
    expect((await call('state', { token: 'a'.repeat(64) })).status).toBe(401);
    const token = await guest();
    clock += 31 * DAY;
    expect((await call('state', { token })).status).toBe(401);
  });

  it('convidado desligado → 403', async () => {
    env.ALLOW_GUEST = 'false';
    expect((await post('session', undefined, { guest: true })).status).toBe(403);
  });

  it('login Énóis: endpoint real e gameId conferido', async () => {
    env.FETCH = vi.fn(async (url, init) => {
      expect(url).toBe('https://enois.ia.br/api/games/tokens/validate');
      expect(JSON.parse(init.body)).toEqual({ token: 'tok_valido_123' });
      return new Response(JSON.stringify({ gameId: 'game_nozito', playerRef: 'plr_abcdef1234567890' }));
    });
    expect((await post('session', undefined, { enoisToken: 'tok_valido_123' })).status).toBe(201);
    env.FETCH = async () => new Response(JSON.stringify({ gameId: 'game_outro', playerRef: 'plr_abcdef1234567890' }));
    expect((await post('session', undefined, { enoisToken: 'tok_valido_123' })).status).toBe(401);
  });

  it('atalhos de dev só com a variável E em localhost', async () => {
    env.ENOIS_DEV_FAKE = 'true';
    env.FETCH = async () => new Response('', { status: 404 });
    expect((await post('session', undefined, { enoisToken: 'dev_123456789' })).status).toBe(401);
    const local = await post('session', undefined, { enoisToken: 'dev_123456789' }, { host: 'localhost:8788' });
    expect(local.status).toBe(201);
    const token = local.data.sessionToken;
    expect((await post('devGrant', token, { itemIds: ['hat_cartola'] })).status).toBe(404);
    expect((await post('devGrant', token, { itemIds: ['hat_cartola'] }, { host: 'localhost:8788' })).status).toBe(200);
    delete env.ENOIS_DEV_FAKE;
    expect((await post('devGrant', token, { itemIds: ['hat_cartola'] }, { host: 'localhost:8788' })).status).toBe(404);
  });
});

describe('Cata Minhoca', () => {
  it('rodada válida dá minhocas no estoque', async () => {
    const token = await guest();
    clock += 10 * HOUR; // humor 50: sem bônus
    const r = await playRound(token, 'cata_minhoca', 12);
    expect(r.status).toBe(200);
    expect(r.data.reward).toMatchObject({ itemId: 'food_minhoca', gained: 4, bonus: false });
    expect(r.data.state.inventory.food_minhoca).toBe(4);
  });

  it('estoque para em 10', async () => {
    const token = await guest();
    for (let i = 0; i < 3; i++) await playRound(token, 'cata_minhoca', 40);
    const st = (await call('state', { token })).data;
    expect(st.inventory.food_minhoca).toBe(10);
  });

  it('terminar cedo, duas vezes ou rodada de outro jogador → recusa', async () => {
    const a = await guest();
    const s = await post('roundStart', a, { game: 'cata_minhoca' });
    clock += 3_000;
    expect((await post('roundFinish', a, { roundId: s.data.roundId, score: 40 })).data.error).toBe('ROUND_TOO_SOON');
    clock += 17_000;
    expect((await post('roundFinish', a, { roundId: s.data.roundId, score: 40 })).status).toBe(200);
    expect((await post('roundFinish', a, { roundId: s.data.roundId, score: 40 })).data.error).toBe('ROUND_FINISHED');
    const b = await guest();
    const s2 = await post('roundStart', a, { game: 'cata_minhoca' });
    clock += 20_000;
    expect((await post('roundFinish', b, { roundId: s2.data.roundId, score: 40 })).status).toBe(404);
  });

  it('jogo desconhecido', async () => {
    const token = await guest();
    expect((await post('roundStart', token, { game: 'roleta' })).data.error).toBe('UNKNOWN_GAME');
  });
});

describe('Caça ao Brilho', () => {
  it('sobe humor e acha tesouro (sorte controlada no teste)', async () => {
    env.RANDOM = () => 0; // sempre acha, sempre o primeiro da lista
    const token = await guest();
    clock += 5 * HOUR; // humor 70 → 60
    const r = await playRound(token, 'caca_brilho', 20);
    expect(r.data.reward).toMatchObject({ mood: true, treasure: 'treasure_tampinha' });
    expect(r.data.state.crow.mood).toBe(75);
    expect(r.data.state.inventory.treasure_tampinha).toBe(1);
    const r2 = await playRound(token, 'caca_brilho', 20);
    expect(r2.data.reward.treasure).not.toBe('treasure_tampinha'); // não repete
  });

  it('pontuação baixa ou azar: sem tesouro', async () => {
    env.RANDOM = () => 0.99;
    const token = await guest();
    expect((await playRound(token, 'caca_brilho', 40)).data.reward.treasure).toBeNull();
    env.RANDOM = () => 0;
    expect((await playRound(token, 'caca_brilho', 5)).data.reward.treasure).toBeNull();
  });
});

describe('minhoca fresca', () => {
  it('estraga em 24h e humor alto dá +1', async () => {
    const token = await guest(); // humor 70 = feliz
    const r = await playRound(token, 'cata_minhoca', 9);
    expect(r.data.reward).toMatchObject({ gained: 4, bonus: true });
    expect(r.data.state.fresh.food_minhoca[0].qty).toBe(4);
    clock += 24 * HOUR;
    const st = (await call('state', { token })).data;
    expect(st.inventory.food_minhoca).toBeUndefined();
    expect((await post('feed', token, { itemId: 'food_minhoca' })).data.error).toBe('NO_FOOD');
  });

  it('come a leva mais antiga primeiro', async () => {
    const token = await guest();
    clock += 20 * HOUR; // humor 30: sem bônus; barriga ~0
    await playRound(token, 'cata_minhoca', 3); // leva A: 1
    clock += 2 * HOUR;
    await playRound(token, 'cata_minhoca', 6); // leva B: 2
    const r = await post('feed', token, { itemId: 'food_minhoca' });
    expect(r.data.fresh.food_minhoca).toHaveLength(1);
    expect(r.data.fresh.food_minhoca[0].qty).toBe(2);
  });
});

describe('alimentar', () => {
  it('come do estoque e gasta 1', async () => {
    const token = await guest();
    await playRound(token, 'cata_minhoca', 6); // 2 + 1 (feliz) minhocas
    clock += 6 * HOUR; // barriga 80 → 55
    const r = await post('feed', token, { itemId: 'food_minhoca' });
    expect(r.status).toBe(200);
    expect(r.data.inventory.food_minhoca).toBe(2);
    expect(r.data.crow.belly).toBeCloseTo(75, 0);
  });

  it('sem estoque → NO_FOOD', async () => {
    const token = await guest();
    expect((await post('feed', token, { itemId: 'food_minhoca' })).data.error).toBe('NO_FOOD');
    expect((await post('feed', token, { itemId: 'food_banquete' })).data.error).toBe('NO_FOOD');
  });

  it('barriga cheia → BELLY_FULL e não gasta', async () => {
    const token = await guest();
    await give(token, 'food_banquete', 2);
    await post('feed', token, { itemId: 'food_banquete' });
    const r = await post('feed', token, { itemId: 'food_banquete' });
    expect(r.data.error).toBe('BELLY_FULL');
    expect((await call('state', { token })).data.inventory.food_banquete).toBe(1);
  });

  it('item inválido', async () => {
    const token = await guest();
    expect((await post('feed', token, { itemId: '__proto__' })).data.error).toBe('UNKNOWN_ITEM');
    expect((await post('feed', token, { itemId: 'hat_cartola' })).data.error).toBe('NOT_FOOD');
  });
});

describe('morte e linhagem', () => {
  it('morre no prazo, vira lápide, invoca Nózito II', async () => {
    const token = await guest();
    const born = (await call('state', { token })).data.crow;
    clock += 40 * HOUR;
    const st = (await call('state', { token })).data;
    expect(st.crow.status).toBe('DEAD');
    expect(st.crow.diedAt).toBe(born.deadlineAt);
    expect(born.deadlineAt - T0).toBe(Math.round(19.2 * HOUR + 12 * HOUR));
    expect(st.graves).toHaveLength(1);
    const s2 = await post('summon', token);
    expect(s2.data.crow.name).toBe('Nózito II');
  });

  it('não invoca com Nózito vivo; DIE gravado uma vez', async () => {
    const token = await guest();
    expect((await post('summon', token)).data.error).toBe('CROW_ALIVE');
    clock += 61 * HOUR;
    await call('state', { token });
    await call('state', { token });
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE kind = 'DIE'").first('n')).toBe(1);
  });
});

describe('cosméticos', () => {
  it('só equipa o que tem, no lugar certo; o próximo da linhagem herda', async () => {
    const token = await guest();
    expect((await post('equip', token, { slot: 'hat', itemId: 'hat_cartola' })).data.error).toBe('NOT_OWNED');
    await give(token, 'hat_cartola', 1);
    expect((await post('equip', token, { slot: 'glasses', itemId: 'hat_cartola' })).data.error).toBe('WRONG_SLOT');
    expect((await post('equip', token, { slot: 'bolso', itemId: 'hat_cartola' })).data.error).toBe('INVALID_SLOT');
    const ok = await post('equip', token, { slot: 'hat', itemId: 'hat_cartola' });
    expect(ok.data.equipped).toEqual({ hat: 'hat_cartola' });
    clock += 61 * HOUR;
    const next = await post('summon', token);
    expect(next.data.equipped).toEqual({ hat: 'hat_cartola' });
    const off = await post('equip', token, { slot: 'hat', itemId: null });
    expect(off.data.equipped).toEqual({});
  });

  it('compra com Faísca ainda indisponível', async () => {
    const token = await guest();
    expect((await post('buy', token, { itemId: 'hat_cartola' })).data.error).toBe('PAYMENT_UNAVAILABLE');
  });
});

describe('isolamento', () => {
  it('um jogador não vê o estoque do outro', async () => {
    const a = await guest();
    const b = await guest();
    await playRound(a, 'cata_minhoca', 15);
    expect((await call('state', { token: b })).data.inventory).toEqual({});
  });
});
