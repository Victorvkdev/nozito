import { describe, it, expect } from 'vitest';
import items from '../content/items.json';
import {
  HOUR, DAY, STAGE, STATUS, MAX_MEALS_PER_DAY, REVIVE_WINDOW_MS,
  summon, feed, hungerStage, hungerFraction, resolveCrow, canRevive, revive,
  currentMood, pet, minigameReward, crowName, ageDays, dayKey, protocolAmount, RuleError,
} from '../shared/rules.js';

const T0 = Date.UTC(2026, 10, 1, 12); // 01/11/2026 09:00 em Brasília
const food = (id) => items.items.find((i) => i.id === id);
const MINHOCA = food('food_minhoca');
const BANQUETE = food('food_banquete');
const PETISCO = food('food_petisco_brilhante');
const born = () => summon(null, T0, { id: 'c1', playerRef: 'plr_x' });

describe('fome', () => {
  it('recém-nascido tem 72h e começa feliz', () => {
    const c = born();
    expect(c.deadlineAt - c.bornAt).toBe(72 * HOUR);
    expect(hungerStage(c, T0)).toBe(STAGE.FELIZ);
  });

  it('estágios por fração do prazo', () => {
    const c = born();
    expect(hungerStage(c, T0 + 17 * HOUR)).toBe(STAGE.FELIZ);
    expect(hungerStage(c, T0 + 18 * HOUR)).toBe(STAGE.COM_FOME);
    expect(hungerStage(c, T0 + 36 * HOUR)).toBe(STAGE.FAMINTO);
    expect(hungerStage(c, T0 + 54 * HOUR)).toBe(STAGE.FRACO);
    expect(hungerStage(c, T0 + 72 * HOUR - 1)).toBe(STAGE.FRACO);
    expect(hungerStage(c, T0 + 72 * HOUR)).toBe(STAGE.MORTO);
  });

  it('Minhoca renova 72h a partir da refeição', () => {
    const c = feed(born(), MINHOCA, T0 + 50 * HOUR, 0);
    expect(c.deadlineAt).toBe(T0 + 50 * HOUR + 72 * HOUR);
    expect(hungerFraction(c, T0 + 50 * HOUR)).toBe(0);
  });

  it('Banquete dá 120h', () => {
    const c = feed(born(), BANQUETE, T0 + HOUR, 0);
    expect(c.deadlineAt).toBe(T0 + HOUR + 120 * HOUR);
  });

  it('Minhoca depois de Banquete não encurta o prazo', () => {
    const b = feed(born(), BANQUETE, T0, 0);
    const m = feed(b, MINHOCA, T0 + HOUR, 1);
    expect(m.deadlineAt).toBe(b.deadlineAt);
  });

  it('limite de 3 refeições por dia', () => {
    expect(() => feed(born(), MINHOCA, T0, MAX_MEALS_PER_DAY)).toThrowError(RuleError);
    try { feed(born(), MINHOCA, T0, 3); } catch (e) { expect(e.code).toBe('MEAL_LIMIT'); }
  });

  it('Petisco sobe humor', () => {
    const c = feed(born(), PETISCO, T0, 0);
    expect(c.mood).toBe(90);
  });

  it('recusa item que não é comida', () => {
    const hat = items.items.find((i) => i.type === 'hat');
    expect(() => feed(born(), hat, T0, 0)).toThrowError(/comida/);
  });

  it('dia do jogo vira à meia-noite de Brasília (03:00 UTC)', () => {
    const antes = Date.UTC(2026, 10, 2, 2, 59);
    const depois = Date.UTC(2026, 10, 2, 3, 0);
    expect(dayKey(depois) - dayKey(antes)).toBe(1);
  });
});

describe('morte', () => {
  it('morre exatamente no prazo, com diedAt = prazo (não a hora em que abriu)', () => {
    const c = born();
    const aberto = T0 + 10 * DAY;
    const d = resolveCrow(c, aberto);
    expect(d.status).toBe(STATUS.DEAD);
    expect(d.diedAt).toBe(c.deadlineAt);
  });

  it('1ms antes do prazo ainda vive', () => {
    const c = born();
    expect(resolveCrow(c, c.deadlineAt - 1).status).toBe(STATUS.ALIVE);
  });

  it('morto não come nem recebe carinho', () => {
    const c = born();
    const late = c.deadlineAt + HOUR;
    expect(() => feed(c, MINHOCA, late, 0)).toThrowError(/vivo/);
    expect(() => pet(c, late)).toThrowError(/vivo/);
  });

  it('humor baixo não mata', () => {
    const c = { ...born(), mood: 0, moodAt: T0 };
    expect(currentMood(c, T0 + 10 * HOUR)).toBe(0);
    expect(resolveCrow(c, T0 + 10 * HOUR).status).toBe(STATUS.ALIVE);
  });

  it('linhagem: Nózito, II, III… só depois da morte', () => {
    const c1 = born();
    expect(c1.name).toBe('Nózito');
    expect(() => summon(c1, T0 + HOUR, { id: 'c2', playerRef: 'plr_x' })).toThrowError(/vivo/);
    const c2 = summon(c1, c1.deadlineAt, { id: 'c2', playerRef: 'plr_x' });
    expect(c2.generation).toBe(2);
    expect(c2.name).toBe('Nózito II');
    expect(crowName(3)).toBe('Nózito III');
    expect(crowName(14)).toBe('Nózito XIV');
  });

  it('idade na lápide conta até a morte', () => {
    const c = resolveCrow(born(), T0 + 30 * DAY);
    expect(ageDays(c, T0 + 30 * DAY)).toBe(3);
  });
});

describe('ressurreição', () => {
  const dead = () => resolveCrow(born(), T0 + 100 * DAY);

  it('revive em até 7 dias da morte, mantendo idade, geração e nome', () => {
    const d = born();
    const now = d.deadlineAt + REVIVE_WINDOW_MS;
    expect(canRevive(d, now)).toBe(true);
    const r = revive(d, now);
    expect(r.status).toBe(STATUS.REVIVED);
    expect(r.diedAt).toBeNull();
    expect(r.bornAt).toBe(d.bornAt);
    expect(r.generation).toBe(1);
    expect(r.deadlineAt).toBe(now + 72 * HOUR);
    expect(hungerStage(r, now)).toBe(STAGE.FELIZ);
  });

  it('depois de 7 dias não revive', () => {
    const d = born();
    const now = d.deadlineAt + REVIVE_WINDOW_MS + 1;
    expect(canRevive(d, now)).toBe(false);
    expect(() => revive(d, now)).toThrowError(RuleError);
  });

  it('não revive se já invocou o próximo da linhagem', () => {
    const d = born();
    expect(canRevive(d, d.deadlineAt + HOUR, { hasNewerGeneration: true })).toBe(false);
  });

  it('não revive corvo vivo', () => {
    expect(canRevive(born(), T0 + HOUR)).toBe(false);
  });

  it('revivido pode morrer de novo', () => {
    const d = born();
    const r = revive(d, d.deadlineAt + DAY);
    expect(resolveCrow(r, r.deadlineAt).status).toBe(STATUS.DEAD);
  });

  it('morto há muito tempo (sem diedAt resolvido) usa o prazo como hora da morte', () => {
    expect(canRevive(born(), T0 + 100 * DAY)).toBe(false);
    expect(dead().diedAt).toBe(T0 + 72 * HOUR);
  });
});

describe('humor e minijogo', () => {
  it('humor cai com o tempo', () => {
    const c = born();
    expect(currentMood(c, T0 + 10 * HOUR)).toBe(50);
  });

  it('carinho dá humor 1x por hora', () => {
    const a = pet(born(), T0);
    expect(a.gained).toBe(true);
    const b = pet(a.crow, T0 + 30 * 60_000);
    expect(b.gained).toBe(false);
    expect(pet(a.crow, T0 + HOUR).gained).toBe(true);
  });

  it('Sementes do minijogo respeitam teto diário e bônus de humor', () => {
    expect(minigameReward(50, 50, 0)).toBe(10);
    expect(minigameReward(50, 80, 0)).toBe(15);
    expect(minigameReward(50, 80, 25)).toBe(5);
    expect(minigameReward(50, 80, 30)).toBe(0);
    expect(() => minigameReward(-1, 50, 0)).toThrowError(RuleError);
  });
});

describe('preço', () => {
  it('Faísca vira milésimos do protocolo; Semente fica igual', () => {
    expect(protocolAmount({ currency: 'faisca', amount: 3 })).toBe(3000);
    expect(protocolAmount({ currency: 'semente', amount: 5 })).toBe(5);
    expect(() => protocolAmount({ currency: 'faisca', amount: 1.5 })).toThrowError(RuleError);
  });
});
