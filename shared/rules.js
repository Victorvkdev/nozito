// Regras puras do Nózito. Usadas no front (animação) e na API (decisão).
// Tudo em milissegundos (epoch). Nada aqui lê relógio, rede ou banco: quem chama passa `now`.

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

// Dia do jogo = America/Sao_Paulo (UTC−3, sem horário de verão desde 2019).
export const DAY_OFFSET_MS = -3 * HOUR;

// ---------- Barriga
export const BELLY_MAX = 100;
export const BELLY_HOURS_TO_EMPTY = 24; // cheia → vazia
export const BELLY_DECAY_PER_HOUR = BELLY_MAX / BELLY_HOURS_TO_EMPTY;
export const STARVE_GRACE_MS = 12 * HOUR; // vazia por 12h = morte (cheia → morte = 36h)
export const BELLY_FULL = 95; // a partir daqui recusa comida
export const BELLY_START = 80;
export const BELLY_AFTER_REVIVE = 60;
export const SLOW_DIGESTION_FACTOR = 0.5; // efeito "digestão lenta": esvazia na metade da velocidade

// ---------- Humor
export const MOOD_MAX = 100;
export const MOOD_START = 70;
export const MOOD_AFTER_REVIVE = 50;
export const MOOD_DECAY_PER_HOUR = 2;
export const PET_MOOD = 10;
export const PET_COOLDOWN_MS = HOUR;
export const MINIGAME_MOOD = 15;

export const REVIVE_WINDOW_MS = 7 * DAY;

// ---------- Minijogos e estoque
export const MINIGAMES = Object.freeze({
  cata_minhoca: { durationMs: 20_000, maxScore: 40 },
  caca_brilho: { durationMs: 20_000, maxScore: 80 },
});
export const ROUND_GRACE_MS = 60_000; // tempo extra para enviar o resultado
export const STOCK_MAX = Object.freeze({ food_minhoca: 10 });
export const HAPPY_MOOD = 70; // humor alto: +1 minhoca por rodada no Cata Minhoca
export const TREASURE_MIN_SCORE = 10;
export const RARITY_WEIGHT = Object.freeze({ comum: 60, raro: 30, lendario: 10 });

export const STAGE = Object.freeze({
  FELIZ: 'feliz',
  COM_FOME: 'com_fome',
  FAMINTO: 'faminto',
  FRACO: 'fraco',
  MORTO: 'morto',
});
// barriga ≥ 60 feliz · ≥ 30 com fome · > 0 faminto · 0 fraco (contagem final)
export const BELLY_THRESHOLDS = Object.freeze([
  [60, STAGE.FELIZ],
  [30, STAGE.COM_FOME],
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

export function dayKey(ts) {
  assertNow(ts);
  return Math.floor((ts + DAY_OFFSET_MS) / DAY);
}

export const isLiving = (crow) => crow.status === STATUS.ALIVE || crow.status === STATUS.REVIVED;

// ---------- Barriga: cálculo por timestamp (com digestão lenta por trechos)

/** Quanto a barriga esvazia entre `from` e `to`, considerando a digestão lenta até `slowUntil`. */
export function bellyDecay(from, to, slowUntil = null) {
  if (to <= from) return 0;
  const slowEnd = Math.min(to, Math.max(from, slowUntil ?? 0));
  const slowHours = (slowEnd - from) / HOUR;
  const normalHours = (to - slowEnd) / HOUR;
  return (slowHours * SLOW_DIGESTION_FACTOR + normalHours) * BELLY_DECAY_PER_HOUR;
}

export function currentBelly(crow, now) {
  assertNow(now);
  return clamp(crow.belly - bellyDecay(crow.bellyAt, now, crow.slowUntil), 0, BELLY_MAX);
}

/** Momento em que a barriga chega a 0. */
export function emptyAt(crow) {
  const needHours = crow.belly / BELLY_DECAY_PER_HOUR; // horas "normais" de digestão
  const slowLen = Math.max(0, (crow.slowUntil ?? 0) - crow.bellyAt) / HOUR;
  const slowCovers = slowLen * SLOW_DIGESTION_FACTOR;
  if (slowCovers >= needHours) return crow.bellyAt + (needHours / SLOW_DIGESTION_FACTOR) * HOUR;
  return crow.bellyAt + (slowLen + (needHours - slowCovers)) * HOUR;
}

/** Hora da morte se ninguém alimentar: barriga vazia + 12h. Vai para `deadline_at`. */
export const deathAt = (crow) => Math.round(emptyAt(crow) + STARVE_GRACE_MS);

export function hungerStage(crow, now) {
  if (!isLiving(crow) || now >= crow.deadlineAt) return STAGE.MORTO;
  const b = currentBelly(crow, now);
  for (const [min, stage] of BELLY_THRESHOLDS) if (b >= min) return stage;
  return b > 0 ? STAGE.FAMINTO : STAGE.FRACO;
}

/** Morte preguiçosa (sem cron). A hora da morte é o prazo, não a hora em que abriram o jogo. */
export function resolveCrow(crow, now) {
  assertNow(now);
  if (isLiving(crow) && now >= crow.deadlineAt) {
    return { ...crow, status: STATUS.DEAD, diedAt: crow.deadlineAt };
  }
  return crow;
}

// ---------- Humor

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

// ---------- Ações

/** Comer: enche a barriga, mexe no humor e pode ligar a digestão lenta. */
export function feed(crow, food, now) {
  const c = requireLiving(crow, now);
  const fx = food?.effects ?? {};
  if (!food || food.type !== 'food' || !isNum(fx.belly) || fx.belly <= 0) {
    throw new RuleError('NOT_FOOD', 'Item não é comida.');
  }
  const belly = currentBelly(c, now);
  if (belly >= BELLY_FULL) throw new RuleError('BELLY_FULL', 'Está de barriga cheia!');
  let slowUntil = c.slowUntil ?? null;
  if (isNum(fx.slowDigestionHours) && fx.slowDigestionHours > 0) {
    slowUntil = Math.max(slowUntil ?? 0, now + fx.slowDigestionHours * HOUR);
  }
  const next = {
    ...c,
    belly: Math.min(BELLY_MAX, belly + fx.belly),
    bellyAt: now,
    lastFedAt: now,
    slowUntil,
    ...withMood(c, now, fx.mood ?? 0),
  };
  return { ...next, deadlineAt: deathAt(next) };
}

/** Carinho: sempre anima, mas só dá humor 1x por hora. */
export function pet(crow, now) {
  const c = requireLiving(crow, now);
  const allowed = c.lastPetAt == null || now - c.lastPetAt >= PET_COOLDOWN_MS;
  if (!allowed) return { crow: c, gained: false };
  return { crow: { ...c, lastPetAt: now, ...withMood(c, now, PET_MOOD) }, gained: true };
}

export function playMinigame(crow, now) {
  const c = requireLiving(crow, now);
  return { ...c, ...withMood(c, now, MINIGAME_MOOD) };
}

// ---------- Minijogos

/** Valida o fim de uma rodada iniciada pelo servidor. Devolve a pontuação aceita. */
export function validateRound(round, score, now) {
  const cfg = MINIGAMES[round?.game];
  if (!cfg) throw new RuleError('UNKNOWN_GAME', 'Minijogo desconhecido.');
  if (round.finishedAt != null) throw new RuleError('ROUND_FINISHED', 'Rodada já encerrada.');
  const elapsed = now - round.startedAt;
  if (elapsed < cfg.durationMs - 1000) throw new RuleError('ROUND_TOO_SOON', 'A rodada ainda não acabou.');
  if (elapsed > cfg.durationMs + ROUND_GRACE_MS) throw new RuleError('ROUND_EXPIRED', 'Rodada expirada.');
  if (!Number.isInteger(score) || score < 0) throw new RuleError('INVALID_SCORE', 'Pontuação inválida.');
  return Math.min(score, cfg.maxScore);
}

/** Cata Minhoca: 1 minhoca a cada 3 pontos, até 5 por rodada; Nózito feliz dá +1. */
export function wormsForScore(score, mood = 0) {
  const base = Math.min(5, Math.floor(score / 3));
  return base > 0 && mood >= HAPPY_MOOD ? base + 1 : base;
}

/** Caça ao Brilho: chance de achar um tesouro (0 abaixo de 10 pontos, até 80%). */
export function treasureChance(score) {
  if (score < TREASURE_MIN_SCORE) return 0;
  return Math.min(0.8, 0.2 + score / 100);
}

/**
 * Sorteia um tesouro que o jogador ainda não tem, pesando pela raridade.
 * `rand` = função que devolve [0, 1) (o servidor injeta; testes passam valores fixos).
 */
export function pickTreasure(treasures, ownedIds, score, rand) {
  if (rand() >= treasureChance(score)) return null;
  const pool = treasures.filter((t) => !ownedIds.has(t.id));
  if (!pool.length) return null;
  const total = pool.reduce((s, t) => s + (RARITY_WEIGHT[t.rarity] ?? 1), 0);
  let r = rand() * total;
  for (const t of pool) {
    r -= RARITY_WEIGHT[t.rarity] ?? 1;
    if (r < 0) return t;
  }
  return pool[pool.length - 1];
}

/** Soma ao estoque respeitando o máximo. */
export function addToStock(itemId, current, amount) {
  const max = STOCK_MAX[itemId] ?? Infinity;
  const qty = Math.min(max, current + Math.max(0, amount));
  return { qty, gained: qty - current };
}

// ---------- Morte, ressurreição e linhagem

export function canRevive(crow, now, { hasNewerGeneration = false } = {}) {
  const c = resolveCrow(crow, now);
  if (c.status !== STATUS.DEAD || !isNum(c.diedAt)) return false;
  if (hasNewerGeneration) return false;
  return now - c.diedAt <= REVIVE_WINDOW_MS;
}

export function revive(crow, now, opts) {
  if (!canRevive(crow, now, opts)) throw new RuleError('CANNOT_REVIVE', 'Não dá para reviver este Nózito.');
  const next = {
    ...crow,
    status: STATUS.REVIVED,
    diedAt: null,
    belly: BELLY_AFTER_REVIVE,
    bellyAt: now,
    lastFedAt: now,
    slowUntil: null,
    mood: MOOD_AFTER_REVIVE,
    moodAt: now,
  };
  return { ...next, deadlineAt: deathAt(next) };
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

export function summon(prev, now, { id, playerRef }) {
  assertNow(now);
  if (prev && isLiving(resolveCrow(prev, now))) throw new RuleError('CROW_ALIVE', 'Ainda há um Nózito vivo.');
  const generation = (prev?.generation ?? 0) + 1;
  const crow = {
    id,
    playerRef,
    generation,
    name: crowName(generation),
    bornAt: now,
    lastFedAt: now,
    belly: BELLY_START,
    bellyAt: now,
    slowUntil: null,
    mood: MOOD_START,
    moodAt: now,
    lastPetAt: null,
    diedAt: null,
    status: STATUS.ALIVE,
  };
  return { ...crow, deadlineAt: deathAt(crow) };
}

export function ageDays(crow, now) {
  const end = crow.status === STATUS.DEAD && isNum(crow.diedAt) ? crow.diedAt : now;
  return Math.max(0, Math.floor((end - crow.bornAt) / DAY));
}

/** Preço em Faísca → `amount` do protocolo Énóis (milésimos). */
export function protocolAmount(price) {
  if (!price || price.currency !== 'faisca' || !Number.isInteger(price.amount) || price.amount <= 0) {
    throw new RuleError('INVALID_PRICE', 'Preço inválido.');
  }
  return price.amount * 1000;
}
