// Handlers das rotas /api/*. Cada um recebe o contexto das Pages Functions.
import { HttpError, json, readJson, handle } from './http.js';
import { createSession, ensurePlayer, isLocalDev, playerRefFromEnois, randomHex, requireSession } from './auth.js';
import { currentCrow, equip as equipItem, feedCrow, finishRound, getState, grantDev, petCrow, reviveCrow, startRound, summonNext } from './game.js';

const nowOf = (env) => (typeof env.NOW === 'function' ? env.NOW() : Date.now());

/** POST /api/session  { enoisToken } | { guest: true } */
export const session = handle(async ({ request, env }) => {
  const body = await readJson(request);
  const now = nowOf(env);
  let playerRef;
  let mode;
  if (typeof body.enoisToken === 'string') {
    playerRef = await playerRefFromEnois(body.enoisToken, env, request, env.FETCH ?? fetch);
    mode = 'enois';
  } else if (body.guest === true) {
    if (env.ALLOW_GUEST !== 'true') throw new HttpError(403, 'GUEST_DISABLED', 'Entre pelo Énóis para jogar.');
    playerRef = `plr_g${randomHex(16)}`;
    mode = 'guest';
  } else {
    throw new HttpError(400, 'LOGIN_REQUIRED', 'Envie enoisToken ou guest.');
  }
  await ensurePlayer(env.DB, playerRef, now);
  await currentCrow(env.DB, playerRef, now); // conta nova já nasce com o primeiro Nózito
  const s = await createSession(env.DB, playerRef, now);
  return json({ sessionToken: s.token, expiresAt: s.expiresAt, mode }, 201);
});

const authed = (fn) =>
  handle(async ({ request, env }) => {
    const now = nowOf(env);
    const ref = await requireSession(request, env, now);
    return fn({ request, env, now, ref });
  });

export const state = authed(async ({ env, now, ref }) => json(await getState(env.DB, ref, now)));

export const feed = authed(async ({ request, env, now, ref }) => {
  const body = await readJson(request);
  await feedCrow(env.DB, ref, body.itemId, now);
  return json(await getState(env.DB, ref, now));
});

export const pet = authed(async ({ env, now, ref }) => {
  const gained = await petCrow(env.DB, ref, now);
  return json({ ...(await getState(env.DB, ref, now)), gained });
});

export const summon = authed(async ({ env, now, ref }) => {
  await summonNext(env.DB, ref, now);
  return json(await getState(env.DB, ref, now));
});

export const revive = authed(async ({ env, now, ref }) => {
  await reviveCrow(env.DB, ref, now);
  return json(await getState(env.DB, ref, now));
});

export const roundStart = authed(async ({ request, env, now, ref }) => {
  const body = await readJson(request);
  return json(await startRound(env.DB, ref, body.game, now), 201);
});

export const roundFinish = authed(async ({ request, env, now, ref }) => {
  const body = await readJson(request);
  const result = await finishRound(env.DB, ref, body.roundId, body.score, now, env.RANDOM);
  return json({ ...result, state: await getState(env.DB, ref, now) });
});

export const equip = authed(async ({ request, env, now, ref }) => {
  const body = await readJson(request);
  await equipItem(env.DB, ref, body.slot, body.itemId ?? null, now);
  return json(await getState(env.DB, ref, now));
});

/** Compra com Faísca: espera a confirmação de pagamento do Énóis (issue aberta). */
export const buy = authed(async () => {
  throw new HttpError(409, 'PAYMENT_UNAVAILABLE', 'Compras com Faísca chegam em breve.');
});

/** Só local (ENOIS_DEV_FAKE=true + localhost): dá itens para testar. */
export const devGrant = authed(async ({ request, env, now, ref }) => {
  if (!isLocalDev(env, request)) throw new HttpError(404, 'NOT_FOUND', 'Não encontrado.');
  const body = await readJson(request);
  await grantDev(env.DB, ref, body.itemIds, now);
  return json(await getState(env.DB, ref, now));
});
