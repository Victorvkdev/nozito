import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createD1 } from './helpers/d1.js';
import * as routes from '../server/routes.js';
import { HOUR, DAY, STARTING_SEEDS } from '../shared/rules.js';

const T0 = Date.UTC(2026, 10, 3, 15); // 12:00 em Brasília
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
  return new Request(`https://${host}/api/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function call(name, opts) {
  const res = await routes[name]({ request: req(name, opts), env });
  return { status: res.status, data: await res.json() };
}

async function guest() {
  const { status, data } = await call('session', { method: 'POST', body: { guest: true } });
  expect(status).toBe(201);
  return data.sessionToken;
}

describe('sessão', () => {
  it('convidado cria conta com Sementes iniciais e o primeiro Nózito', async () => {
    const token = await guest();
    const { status, data } = await call('state', { token });
    expect(status).toBe(200);
    expect(data.player.seeds).toBe(STARTING_SEEDS);
    expect(data.crow.name).toBe('Nózito');
    expect(data.crow.status).toBe('ALIVE');
  });

  it('sem token ou com token falso → 401', async () => {
    expect((await call('state')).status).toBe(401);
    expect((await call('state', { token: 'a'.repeat(64) })).status).toBe(401);
    expect((await call('state', { token: 'x; DROP TABLE players' })).status).toBe(401);
  });

  it('sessão expira em 30 dias', async () => {
    const token = await guest();
    clock += 31 * DAY;
    expect((await call('state', { token })).status).toBe(401);
  });

  it('convidado desligado → 403', async () => {
    env.ALLOW_GUEST = 'false';
    expect((await call('session', { method: 'POST', body: { guest: true } })).status).toBe(403);
  });

  it('login Énóis: valida no endpoint real e confere o gameId', async () => {
    env.FETCH = vi.fn(async (url, init) => {
      expect(url).toBe('https://enois.ia.br/api/games/tokens/validate');
      expect(JSON.parse(init.body)).toEqual({ token: 'tok_valido_123' });
      return new Response(JSON.stringify({ gameId: 'game_nozito', playerRef: 'plr_abcdef1234567890' }), { status: 200 });
    });
    const { status, data } = await call('session', { method: 'POST', body: { enoisToken: 'tok_valido_123' } });
    expect(status).toBe(201);
    expect(data.mode).toBe('enois');
    const row = await env.DB.prepare('SELECT player_ref FROM players').first();
    expect(row.player_ref).toBe('plr_abcdef1234567890');
  });

  it('login Énóis: token de OUTRO jogo é recusado', async () => {
    env.FETCH = async () => new Response(JSON.stringify({ gameId: 'game_outro', playerRef: 'plr_abcdef1234567890' }));
    expect((await call('session', { method: 'POST', body: { enoisToken: 'tok_valido_123' } })).status).toBe(401);
  });

  it('login Énóis: token usado/expirado → 401', async () => {
    env.FETCH = async () => new Response('{"error":"TOKEN_ALREADY_USED"}', { status: 409 });
    expect((await call('session', { method: 'POST', body: { enoisToken: 'tok_valido_123' } })).status).toBe(401);
  });

  it('atalho de dev só funciona com a variável E em localhost', async () => {
    env.ENOIS_DEV_FAKE = 'true';
    env.FETCH = vi.fn(async () => new Response('', { status: 404 }));
    const prod = await call('session', { method: 'POST', body: { enoisToken: 'dev_123456789' } });
    expect(prod.status).toBe(401);
    const local = await call('session', { method: 'POST', body: { enoisToken: 'dev_123456789' }, host: 'localhost:8788' });
    expect(local.status).toBe(201);
  });

  it('corpo inválido', async () => {
    const res = await routes.session({
      request: new Request('https://x/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{nope' }),
      env,
    });
    expect(res.status).toBe(400);
  });
});

describe('alimentar', () => {
  it('Minhoca custa 5 Sementes e renova o prazo', async () => {
    const token = await guest();
    clock += 10 * HOUR;
    const { status, data } = await call('feed', { method: 'POST', token, body: { itemId: 'food_minhoca' } });
    expect(status).toBe(200);
    expect(data.player.seeds).toBe(STARTING_SEEDS - 5);
    expect(data.crow.deadlineAt).toBe(clock + 72 * HOUR);
    expect(data.daily.meals).toBe(1);
  });

  it('4ª refeição do dia → 409 MEAL_LIMIT, sem cobrar', async () => {
    const token = await guest();
    for (let i = 0; i < 3; i++) await call('feed', { method: 'POST', token, body: { itemId: 'food_minhoca' } });
    const r = await call('feed', { method: 'POST', token, body: { itemId: 'food_minhoca' } });
    expect(r.status).toBe(409);
    expect(r.data.error).toBe('MEAL_LIMIT');
    expect((await call('state', { token })).data.player.seeds).toBe(STARTING_SEEDS - 15);
  });

  it('sem Sementes → 409 NO_SEEDS e nada muda', async () => {
    const token = await guest();
    await env.DB.prepare('UPDATE players SET seeds = 3').run();
    const before = (await call('state', { token })).data.crow.deadlineAt;
    const r = await call('feed', { method: 'POST', token, body: { itemId: 'food_minhoca' } });
    expect(r.data.error).toBe('NO_SEEDS');
    const after = await call('state', { token });
    expect(after.data.crow.deadlineAt).toBe(before);
    expect(after.data.daily.meals).toBe(0);
  });

  it('Banquete (Faísca) ainda não é vendido', async () => {
    const token = await guest();
    const r = await call('feed', { method: 'POST', token, body: { itemId: 'food_banquete' } });
    expect(r.data.error).toBe('PAYMENT_UNAVAILABLE');
  });

  it('item inexistente ou não-comida', async () => {
    const token = await guest();
    expect((await call('feed', { method: 'POST', token, body: { itemId: '__proto__' } })).data.error).toBe('UNKNOWN_ITEM');
    expect((await call('feed', { method: 'POST', token, body: { itemId: 'hat_cartola' } })).data.error).toBe('NOT_FOOD');
  });

  it('dia novo zera o limite de refeições', async () => {
    const token = await guest();
    for (let i = 0; i < 3; i++) await call('feed', { method: 'POST', token, body: { itemId: 'food_minhoca' } });
    clock += DAY;
    expect((await call('feed', { method: 'POST', token, body: { itemId: 'food_minhoca' } })).status).toBe(200);
  });
});

describe('morte e linhagem no servidor', () => {
  it('morre no prazo; morto não come; invoca Nózito II', async () => {
    const token = await guest();
    clock += 80 * HOUR;
    const st = (await call('state', { token })).data;
    expect(st.crow.status).toBe('DEAD');
    expect(st.crow.diedAt).toBe(T0 + 72 * HOUR);
    expect(st.graves).toHaveLength(1);
    expect((await call('feed', { method: 'POST', token, body: { itemId: 'food_minhoca' } })).data.error).toBe('CROW_DEAD');
    const s2 = await call('summon', { method: 'POST', token });
    expect(s2.status).toBe(200);
    expect(s2.data.crow.name).toBe('Nózito II');
    expect(s2.data.crow.status).toBe('ALIVE');
  });

  it('não invoca com Nózito vivo', async () => {
    const token = await guest();
    expect((await call('summon', { method: 'POST', token })).data.error).toBe('CROW_ALIVE');
  });

  it('evento DIE é gravado uma vez só', async () => {
    const token = await guest();
    clock += 80 * HOUR;
    await call('state', { token });
    await call('state', { token });
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE kind = 'DIE'").first('n');
    expect(n).toBe(1);
  });
});

describe('carinho', () => {
  it('humor sobe 1x por hora', async () => {
    const token = await guest();
    const a = await call('pet', { method: 'POST', token });
    expect(a.data.gained).toBe(true);
    const b = await call('pet', { method: 'POST', token });
    expect(b.data.gained).toBe(false);
    clock += HOUR;
    expect((await call('pet', { method: 'POST', token })).data.gained).toBe(true);
  });
});

describe('isolamento', () => {
  it('um jogador não vê nem altera o Nózito de outro', async () => {
    const a = await guest();
    const b = await guest();
    await call('feed', { method: 'POST', token: a, body: { itemId: 'food_minhoca' } });
    const sb = (await call('state', { token: b })).data;
    expect(sb.player.seeds).toBe(STARTING_SEEDS);
    expect(sb.daily.meals).toBe(0);
  });
});
