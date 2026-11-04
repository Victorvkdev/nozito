// Cliente da API do Nózito. Sessão em memória; localStorage só como conveniência
// (particionado/bloqueável dentro do iframe do Énóis, então nunca é fonte de verdade).
const KEY = 'nozito.session';
let token = null;

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

export function loadSavedSession() {
  try {
    token = localStorage.getItem(KEY);
  } catch {
    token = null;
  }
  return token;
}

function saveSession(t) {
  token = t;
  try {
    if (t) localStorage.setItem(KEY, t);
    else localStorage.removeItem(KEY);
  } catch {
    /* sem storage: segue só em memória */
  }
}

export const clearSession = () => saveSession(null);
export const hasSession = () => Boolean(token);

async function call(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`/api/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'OFFLINE', 'Sem conexão. Tente de novo.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'HTTP_' + res.status, data.message);
  return data;
}

export async function loginWithEnois(enoisToken) {
  const data = await call('session', { method: 'POST', body: { enoisToken } });
  saveSession(data.sessionToken);
  return data;
}

export async function loginAsGuest() {
  const data = await call('session', { method: 'POST', body: { guest: true } });
  saveSession(data.sessionToken);
  return data;
}

export const getState = () => call('state');
export const feed = (itemId) => call('feed', { method: 'POST', body: { itemId } });
export const pet = () => call('pet', { method: 'POST' });
export const summon = () => call('summon', { method: 'POST' });
export const roundStart = (game) => call('round/start', { method: 'POST', body: { game } });
export const roundFinish = (roundId, score) => call('round/finish', { method: 'POST', body: { roundId, score } });
export const equip = (slot, itemId) => call('equip', { method: 'POST', body: { slot, itemId } });
export const devGrant = (itemIds) => call('dev/grant', { method: 'POST', body: { itemIds } });
