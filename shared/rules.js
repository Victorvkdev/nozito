// Regras puras do Nózito. Usadas no front (animação) e na API (decisão).
// Tudo em milissegundos (epoch). Nada aqui lê relógio, rede ou banco: quem chama passa `now`.

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

// Brasil sem horário de verão desde 2019: dia do jogo = dia em America/Sao_Paulo (UTC−3),
// o mesmo fuso da presença diária do Énóis.
export const DAY_OFFSET_MS = -3 * HOUR;

export const START_DEADLINE_HOURS = 72; // recém-nascido e revivido
export const MAX_MEALS_PER_DAY = 3;
export const REVIVE_WINDOW_MS = 7 * DAY;
export const MOOD_MAX = 100;
export const MOOD_START = 70;
export const MOOD_AFTER_REVIVE = 50;
export const MOOD_DECAY_PER_HOUR = 2; // 100 → 0 em 50h (ajustável)
export const PET_MOOD = 10;
export const PET_COOLDOWN_MS = HOUR;
export const MINIGAME_MOOD = 15;
export const MINIGAME_SEEDS_PER_ROUND_MAX = 10;
export const MINIGAME_DAILY_SEED_CAP = 30;
export const HIGH_MOOD = 70; // humor alto = bônus de Sementes
export const STARTING_SEEDS = 30; // conta nova (dá para 6 Minhocas até o minijogo chegar)

// 5 estados de sprite. Limites por fração do prazo (ver contradição #2 no CHANGELOG).
export const STAGE = Object.freeze({
  FELIZ: 'feliz',
  COM_FOME: 'com_fome',
  FAMINTO: 'faminto',
  FRACO: 'fraco',
  MORTO: 'morto',
});
export const HUNGER_THRESHOLDS = Object.freeze([
  [0.25, STAGE.FELIZ],
  [0.5, STAGE.COM_FOME],
  [0.75, STAGE.FAMINTO],
  [1, STAGE.FRACO],
]);

export const STATUS = Object.freeze({ ALIVE: 'ALIVE', DEAD: 'DEAD', REVIVED: 'REVIVED' });

export class RuleError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RuleError';
    this.code = code;
  }
}

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function assertNow(now) {
  if (!isNum(now)) throw new RuleError('INVALID_NOW', 'now precisa ser timestamp em ms');
}

/** Dia do jogo (inteiro) para limites diários. */
export function dayKey(ts) {
  assertNow(ts);
  return Math.floor((ts + DAY_OFFSET_MS) / DAY);
}

export const isLiving = (crow) => crow.status === STATUS.ALIVE || crow.status === STATUS.REVIVED;

/** Fração do prazo consumida (0..1), contada da última refeição. */
export function hungerFraction(crow, now) {
  assertNow(now);
  const span = crow.deadlineAt - crow.lastFedAt;
  if (span <= 0) return 1;
  return clamp((now - crow.lastFedAt) / span, 0, 1);
}

export function hungerStage(crow, now) {
  if (!isLiving(crow) || now >= crow.deadlineAt) return STAGE.MORTO;
  const f = hungerFraction(crow, now);
  for (const [limit, stage] of HUNGER_THRESHOLDS) if (f < limit) return stage;
  return STAGE.FRACO;
}

/**
 * Aplica a morte preguiçosa (sem cron). A hora da morte é o prazo, não a hora em que
 * alguém abriu o jogo — a janela da Pedra conta a partir dela.
 */
export function resolveCrow(crow, now) {
  assertNow(now);
  if (isLiving(crow) && now >= crow.deadlineAt) {
    return { ...crow, status: STATUS.DEAD, diedAt: crow.deadlineAt };
  }
  return crow;
}

export function currentMood(crow, now) {
  assertNow(now);
  const hours = Math.max(0, now - crow.moodAt) / HOUR;
  return clamp(Math.round(crow.mood - hours * MOOD_DECAY_PER_HOUR), 0, MOOD_MAX);
}

function withMood(crow, now, delta) {
  return { mood: clamp(currentMood(crow, now) + delta, 0, MOOD_MAX), moodAt: now };
}

function requireLiving(crow, now) {
  const c = resolveCrow(crow, now);
  if (!isLiving(c)) throw new RuleError('CROW_DEAD', 'O Nózito não está vivo.');
  return c;
}

/**
 * Alimentar. `mealsToday` vem do servidor (contador do dia).
 * O prazo nunca encurta: comer Minhoca depois de Banquete não rouba horas já garantidas.
 */
export function feed(crow, food, now, mealsToday) {
  const c = requireLiving(crow, now);
  if (!food || food.type !== 'food' || !isNum(food.effects?.deadlineHours) || food.effects.deadlineHours <= 0) {
    throw new RuleError('NOT_FOOD', 'Item não é comida.');
  }
  if (!Number.isInteger(mealsToday) || mealsToday < 0) throw new RuleError('INVALID_COUNTER', 'Contador inválido.');
  if (mealsToday >= MAX_MEALS_PER_DAY) throw new RuleError('MEAL_LIMIT', 'Já comeu 3 vezes hoje.');
  const deadlineAt = Math.max(c.deadlineAt, now + food.effects.deadlineHours * HOUR);
  return { ...c, lastFedAt: now, deadlineAt, ...withMood(c, now, food.effects.mood ?? 0) };
}

/** Carinho: sempre anima, mas só dá humor 1x por hora. */
export function pet(crow, now) {
  const c = requireLiving(crow, now);
  const allowed = c.lastPetAt == null || now - c.lastPetAt >= PET_COOLDOWN_MS;
  if (!allowed) return { crow: c, gained: false };
  return { crow: { ...c, lastPetAt: now, ...withMood(c, now, PET_MOOD) }, gained: true };
}

/** Caça ao Brilho: Sementes da rodada, com bônus de humor e teto diário. */
export function minigameReward(score, mood, seedsEarnedToday) {
  if (!Number.isInteger(score) || score < 0) throw new RuleError('INVALID_SCORE', 'Pontuação inválida.');
  let seeds = Math.min(Math.floor(score / 5), MINIGAME_SEEDS_PER_ROUND_MAX);
  if (mood >= HIGH_MOOD) seeds = Math.floor(seeds * 1.5);
  const room = Math.max(0, MINIGAME_DAILY_SEED_CAP - seedsEarnedToday);
  return Math.min(seeds, room);
}

export function playMinigame(crow, now) {
  const c = requireLiving(crow, now);
  return { ...c, ...withMood(c, now, MINIGAME_MOOD) };
}

/** Pedra da Ressurreição: até 7 dias da morte e só se ninguém da linhagem nasceu depois. */
export function canRevive(crow, now, { hasNewerGeneration = false } = {}) {
  const c = resolveCrow(crow, now);
  if (c.status !== STATUS.DEAD || !isNum(c.diedAt)) return false;
  if (hasNewerGeneration) return false;
  return now - c.diedAt <= REVIVE_WINDOW_MS;
}

export function revive(crow, now, opts) {
  if (!canRevive(crow, now, opts)) throw new RuleError('CANNOT_REVIVE', 'Não dá para reviver este Nózito.');
  return {
    ...crow,
    status: STATUS.REVIVED,
    diedAt: null,
    lastFedAt: now,
    deadlineAt: now + START_DEADLINE_HOURS * HOUR,
    mood: MOOD_AFTER_REVIVE,
    moodAt: now,
  };
}

const ROMAN = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];
export function toRoman(n) {
  let out = '';
  for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; }
  return out;
}

export function crowName(generation) {
  return generation <= 1 ? 'Nózito' : `Nózito ${toRoman(generation)}`;
}

/** Invocar o próximo da linhagem. `prev` = último corvo do jogador (ou null). */
export function summon(prev, now, { id, playerRef }) {
  assertNow(now);
  if (prev && isLiving(resolveCrow(prev, now))) throw new RuleError('CROW_ALIVE', 'Ainda há um Nózito vivo.');
  const generation = (prev?.generation ?? 0) + 1;
  return {
    id,
    playerRef,
    generation,
    name: crowName(generation),
    bornAt: now,
    lastFedAt: now,
    deadlineAt: now + START_DEADLINE_HOURS * HOUR,
    mood: MOOD_START,
    moodAt: now,
    lastPetAt: null,
    diedAt: null,
    status: STATUS.ALIVE,
  };
}

export function ageDays(crow, now) {
  const end = crow.status === STATUS.DEAD && isNum(crow.diedAt) ? crow.diedAt : now;
  return Math.max(0, Math.floor((end - crow.bornAt) / DAY));
}

/** Preço em Faísca vira `amount` do protocolo (milésimos). Sementes ficam como estão. */
export function protocolAmount(price) {
  if (!price || !Number.isInteger(price.amount) || price.amount <= 0) {
    throw new RuleError('INVALID_PRICE', 'Preço inválido.');
  }
  if (price.currency === 'faisca') return price.amount * 1000;
  if (price.currency === 'semente') return price.amount;
  throw new RuleError('INVALID_CURRENCY', 'Moeda inválida.');
}
