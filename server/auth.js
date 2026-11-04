// Sessão própria do Nózito (Bearer). Login pelo Énóis ou como convidado.
import { HttpError } from './http.js';

export const SESSION_TTL_MS = 30 * 24 * 3_600_000;
const TOKEN_RE = /^[a-f0-9]{64}$/;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256(text) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

export function randomHex(bytes = 32) {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function ensurePlayer(db, playerRef, now) {
  await db
    .prepare('INSERT INTO players (player_ref, created_at) VALUES (?, ?) ON CONFLICT(player_ref) DO NOTHING')
    .bind(playerRef, now)
    .run();
}

export async function createSession(db, playerRef, now) {
  const token = randomHex(32);
  await db
    .prepare('INSERT INTO sessions (token_hash, player_ref, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), playerRef, now + SESSION_TTL_MS, now)
    .run();
  return { token, expiresAt: now + SESSION_TTL_MS };
}

/** Lê o Bearer e devolve o playerRef. 401 se ausente, inválido ou expirado. */
export async function requireSession(request, env, now) {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!TOKEN_RE.test(token)) throw new HttpError(401, 'NO_SESSION', 'Entre de novo.');
  const row = await env.DB.prepare('SELECT player_ref, expires_at FROM sessions WHERE token_hash = ?')
    .bind(await sha256(token))
    .first();
  if (!row || row.expires_at <= now) throw new HttpError(401, 'NO_SESSION', 'Entre de novo.');
  return row.player_ref;
}

function isLocal(request) {
  const host = new URL(request.url).hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

/** Atalhos de laboratório: precisam da variável E de localhost. Nunca ligam em produção. */
export const isLocalDev = (env, request) => env.ENOIS_DEV_FAKE === 'true' && isLocal(request);

/**
 * Troca o token do Énóis pelo playerRef (POST /api/games/tokens/validate, endpoint real do Énóis).
 * Só aceita token do NOSSO jogo (ENOIS_GAME_ID).
 */
export async function playerRefFromEnois(token, env, request, fetchImpl = fetch) {
  if (typeof token !== 'string' || token.length < 8 || token.length > 256) {
    throw new HttpError(400, 'INVALID_TOKEN', 'Token inválido.');
  }
  // Atalho só para o laboratório local (dev/enois.html). Duas travas: variável + localhost.
  if (isLocalDev(env, request) && token.startsWith('dev_')) {
    return `plr_dev${(await sha256(token)).slice(0, 26)}`;
  }
  if (!env.ENOIS_GAME_ID) throw new HttpError(503, 'ENOIS_NOT_CONFIGURED', 'Login do Énóis ainda não configurado.');
  const base = env.ENOIS_API_BASE || 'https://enois.ia.br/api';
  let res;
  try {
    res = await fetchImpl(`${base}/games/tokens/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ token }),
    });
  } catch {
    throw new HttpError(502, 'ENOIS_UNREACHABLE', 'Não deu para falar com o Énóis agora.');
  }
  if (!res.ok) throw new HttpError(401, 'ENOIS_TOKEN_REJECTED', 'O Énóis não confirmou o login. Recarregue o jogo.');
  const data = await res.json().catch(() => null);
  if (!data || data.gameId !== env.ENOIS_GAME_ID || typeof data.playerRef !== 'string' || !/^plr_[A-Za-z0-9]{8,64}$/.test(data.playerRef)) {
    throw new HttpError(401, 'ENOIS_TOKEN_REJECTED', 'O Énóis não confirmou o login.');
  }
  return data.playerRef;
}
