// Handlers das rotas /api/*. Cada um recebe o contexto das Pages Functions.
import { HttpError, json, readJson, handle } from './http.js';
import { createSession, ensurePlayer, playerRefFromEnois, randomHex, requireSession } from './auth.js';
import { currentCrow, feedCrow, getState, petCrow, summonNext } from './game.js';

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

export const state = handle(async ({ request, env }) => {
  const now = nowOf(env);
  const ref = await requireSession(request, env, now);
  return json(await getState(env.DB, ref, now));
});

export const feed = handle(async ({ request, env }) => {
  const now = nowOf(env);
  const ref = await requireSession(request, env, now);
  const body = await readJson(request);
  await feedCrow(env.DB, ref, body.itemId, now);
  return json(await getState(env.DB, ref, now));
});

export const pet = handle(async ({ request, env }) => {
  const now = nowOf(env);
  const ref = await requireSession(request, env, now);
  const gained = await petCrow(env.DB, ref, now);
  return json({ ...(await getState(env.DB, ref, now)), gained });
});

export const summon = handle(async ({ request, env }) => {
  const now = nowOf(env);
  const ref = await requireSession(request, env, now);
  await summonNext(env.DB, ref, now);
  return json(await getState(env.DB, ref, now));
});
