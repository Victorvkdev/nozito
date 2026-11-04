import { describe, it, expect } from 'vitest';
import items from '../content/items.json';
import * as R from '../shared/rules.js';

const { HOUR, DAY, STAGE, STATUS } = R;
const T0 = Date.UTC(2026, 10, 1, 12);
const item = (id) => items.items.find((i) => i.id === id);
const MINHOCA = item('food_minhoca');
const BANQUETE = item('food_banquete');
const SOPA = item('food_sopa_quentinha');
const born = () => R.summon(null, T0, { id: 'c1', playerRef: 'plr_x' });

const RATE = R.BELLY_DECAY_PER_HOUR; // 100 / 24h
const h = (pts) => (pts / RATE) * HOUR; // horas para gastar `pts` de barriga

describe('barriga', () => {
  it('nasce com 80 e esvazia 100 em 24h', () => {
    const c = born();
    expect(R.currentBelly(c, T0)).toBe(80);
    expect(R.currentBelly(c, T0 + 6 * HOUR)).toBeCloseTo(55, 5);
    expect(R.currentBelly(c, T0 + 24 * HOUR)).toBe(0);
  });

  it('morte = barriga vazia + 12h', () => {
    const c = born();
    expect(R.emptyAt(c)).toBeCloseTo(T0 + h(80), 0);
    expect(c.deadlineAt).toBe(Math.round(T0 + h(80) + 12 * HOUR));
  });

  it('estágios pela barriga', () => {
    const c = born();
    expect(R.hungerStage(c, T0 + 4 * HOUR)).toBe(STAGE.FELIZ); // ~63
    expect(R.hungerStage(c, T0 + 6 * HOUR)).toBe(STAGE.COM_FOME); // 55
    expect(R.hungerStage(c, T0 + 14 * HOUR)).toBe(STAGE.FAMINTO); // ~22
    expect(R.hungerStage(c, T0 + 20 * HOUR)).toBe(STAGE.FRACO); // 0, ainda vivo
    expect(R.hungerStage(c, c.deadlineAt)).toBe(STAGE.MORTO);
  });

  it('cheia → morte leva 36h', () => {
    const c = R.feed({ ...born(), belly: 90 }, BANQUETE, T0);
    expect(R.currentBelly(c, T0)).toBe(100);
    expect(c.deadlineAt - T0).toBe(36 * HOUR);
  });

  it('Minhoca enche 20 e recalcula a morte', () => {
    const t = T0 + 12 * HOUR; // barriga 30
    const c = R.feed(born(), MINHOCA, t);
    expect(c.belly).toBeCloseTo(50, 5);
    expect(c.deadlineAt).toBe(Math.round(t + h(50) + 12 * HOUR));
  });

  it('não passa de 100 e recusa com barriga cheia', () => {
    const c = R.feed(born(), BANQUETE, T0);
    expect(c.belly).toBe(100);
    expect(() => R.feed(c, MINHOCA, T0 + 10 * 60_000)).toThrowError(/cheia/);
  });

  it('Frutinhas: barriga e humor', () => {
    const c = R.feed({ ...born(), belly: 20 }, item('food_frutinhas'), T0);
    expect(c.belly).toBe(60);
    expect(c.mood).toBe(80);
  });

  it('Sopa quentinha: esvazia na metade da velocidade por 24h', () => {
    const c = R.feed({ ...born(), belly: 40 }, SOPA, T0); // 80
    expect(c.slowUntil).toBe(T0 + 24 * HOUR);
    // 24h devagar = 50 pontos (em vez de 100)
    expect(R.currentBelly(c, T0 + 24 * HOUR)).toBeCloseTo(30, 5);
    // depois volta ao normal: +6h = -25
    expect(R.currentBelly(c, T0 + 30 * HOUR)).toBeCloseTo(5, 5);
    // vazia: 24h lentas (50) + 30 pontos normais (7,2h) = 31,2h; morte +12h
    expect(c.deadlineAt).toBe(Math.round(T0 + 24 * HOUR + h(30) + 12 * HOUR));
  });

  it('digestão lenta que dura mais que a barriga', () => {
    const c = { ...born(), belly: 5, slowUntil: T0 + 24 * HOUR };
    expect(R.emptyAt(c)).toBeCloseTo(T0 + h(5) * 2, 0);
  });

  it('recusa item que não é comida', () => {
    expect(() => R.feed(born(), item('hat_cartola'), T0)).toThrowError(/comida/);
  });
});

describe('morte', () => {
  it('diedAt = prazo, não a hora em que abriu', () => {
    const c = born();
    const d = R.resolveCrow(c, T0 + 10 * DAY);
    expect(d.status).toBe(STATUS.DEAD);
    expect(d.diedAt).toBe(c.deadlineAt);
  });

  it('1ms antes do prazo ainda vive', () => {
    const c = born();
    expect(R.resolveCrow(c, c.deadlineAt - 1).status).toBe(STATUS.ALIVE);
  });

  it('morto não come nem recebe carinho', () => {
    const c = born();
    const late = c.deadlineAt + HOUR;
    expect(() => R.feed(c, MINHOCA, late)).toThrowError(/vivo/);
    expect(() => R.pet(c, late)).toThrowError(/vivo/);
  });

  it('humor baixo não mata', () => {
    const c = { ...born(), mood: 0 };
    expect(R.resolveCrow(c, T0 + 10 * HOUR).status).toBe(STATUS.ALIVE);
  });

  it('linhagem: Nózito, II, III… só depois da morte', () => {
    const c1 = born();
    expect(c1.name).toBe('Nózito');
    expect(() => R.summon(c1, T0 + HOUR, { id: 'c2', playerRef: 'plr_x' })).toThrowError(/vivo/);
    const c2 = R.summon(c1, c1.deadlineAt, { id: 'c2', playerRef: 'plr_x' });
    expect(c2.name).toBe('Nózito II');
    expect(R.crowName(14)).toBe('Nózito XIV');
  });

  it('idade na lápide conta até a morte', () => {
    const c = R.resolveCrow(born(), T0 + 30 * DAY); // morreu com ~1,3 dia
    expect(R.ageDays(c, T0 + 30 * DAY)).toBe(1);
  });
});

describe('ressurreição', () => {
  it('revive em até 7 dias, mantendo idade e geração', () => {
    const d = born();
    const now = d.deadlineAt + R.REVIVE_WINDOW_MS;
    const r = R.revive(d, now);
    expect(r.status).toBe(STATUS.REVIVED);
    expect(r.bornAt).toBe(d.bornAt);
    expect(r.belly).toBe(60);
    expect(r.deadlineAt).toBe(Math.round(now + h(60) + 12 * HOUR));
  });

  it('depois de 7 dias, ou com geração nova, não revive', () => {
    const d = born();
    expect(R.canRevive(d, d.deadlineAt + R.REVIVE_WINDOW_MS + 1)).toBe(false);
    expect(R.canRevive(d, d.deadlineAt + HOUR, { hasNewerGeneration: true })).toBe(false);
    expect(R.canRevive(born(), T0 + HOUR)).toBe(false);
  });

  it('revivido pode morrer de novo', () => {
    const d = born();
    const r = R.revive(d, d.deadlineAt + DAY);
    expect(R.resolveCrow(r, r.deadlineAt).status).toBe(STATUS.DEAD);
  });
});

describe('humor', () => {
  it('cai com o tempo; carinho 1x por hora', () => {
    const c = born();
    expect(R.currentMood(c, T0 + 10 * HOUR)).toBe(50);
    const a = R.pet(c, T0);
    expect(a.gained).toBe(true);
    expect(R.pet(a.crow, T0 + 30 * 60_000).gained).toBe(false);
    expect(R.pet(a.crow, T0 + HOUR).gained).toBe(true);
  });
});

describe('minijogos', () => {
  const round = (game, startedAt = T0) => ({ game, startedAt, finishedAt: null });

  it('rodada só vale depois do tempo e antes de expirar', () => {
    expect(() => R.validateRound(round('cata_minhoca'), 10, T0 + 5_000)).toThrowError(/não acabou/);
    expect(R.validateRound(round('cata_minhoca'), 10, T0 + 20_000)).toBe(10);
    expect(() => R.validateRound(round('cata_minhoca'), 10, T0 + 20_000 + 61_000)).toThrowError(/expirada/);
  });

  it('pontuação acima do máximo é cortada; negativa recusada', () => {
    expect(R.validateRound(round('cata_minhoca'), 9999, T0 + 20_000)).toBe(40);
    expect(() => R.validateRound(round('caca_brilho'), -1, T0 + 20_000)).toThrowError(/inválida/);
    expect(() => R.validateRound(round('caca_brilho'), 2.5, T0 + 20_000)).toThrowError(/inválida/);
  });

  it('rodada encerrada não vale de novo', () => {
    expect(() => R.validateRound({ ...round('caca_brilho'), finishedAt: T0 }, 1, T0 + 20_000)).toThrowError(/encerrada/);
  });

  it('minhocas: 1 a cada 3 pontos, máx. 5; Nózito feliz dá +1', () => {
    expect(R.wormsForScore(2, 90)).toBe(0); // feliz não transforma zero em um
    expect(R.wormsForScore(9, 50)).toBe(3);
    expect(R.wormsForScore(9, 70)).toBe(4);
    expect(R.wormsForScore(40, 0)).toBe(5);
    expect(R.wormsForScore(40, 100)).toBe(6);
  });

  it('estoque máximo', () => {
    expect(R.addToStock('food_minhoca', 8, 5)).toEqual({ qty: 10, gained: 2 });
    expect(R.addToStock('food_minhoca', 10, 3)).toEqual({ qty: 10, gained: 0 });
  });

  it('tesouros: chance pela pontuação, nunca repete, pesa raridade', () => {
    const T = items.items.filter((i) => i.type === 'treasure');
    const seq = (...v) => () => v.shift();
    expect(R.treasureChance(9)).toBe(0);
    expect(R.treasureChance(30)).toBeCloseTo(0.5);
    expect(R.treasureChance(200)).toBe(0.8);
    expect(R.pickTreasure(T, new Set(), 30, seq(0.6, 0))).toBeNull(); // 0,6 ≥ 50%: nada
    expect(R.pickTreasure(T, new Set(), 30, seq(0.1, 0))).toBe(T[0]);
    const all = new Set(T.map((t) => t.id));
    expect(R.pickTreasure(T, all, 60, seq(0, 0))).toBeNull(); // coleção completa
    const left = new Set(T.slice(1).map((t) => t.id));
    expect(R.pickTreasure(T, left, 60, seq(0, 0.99))).toBe(T[0]); // só sobrou um
  });
});

describe('preço', () => {
  it('Faísca vira milésimos do protocolo', () => {
    expect(R.protocolAmount({ currency: 'faisca', amount: 3 })).toBe(3000);
    expect(() => R.protocolAmount({ currency: 'semente', amount: 5 })).toThrowError(R.RuleError);
    expect(() => R.protocolAmount(null)).toThrowError(R.RuleError);
  });
});
