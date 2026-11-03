import { describe, it, expect } from 'vitest';
import items from '../content/items.json';
import { SPRITES } from '../src/art/sprites.js';

const TYPES = ['food', 'consumable', 'hat', 'nest', 'toy', 'wallpaper', 'scene'];
const SLOTS = ['hat', 'nest', 'toy', 'wallpaper', 'scene'];

describe('content/items.json', () => {
  it('ids únicos', () => {
    const ids = items.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(items.items)('$id é válido', (item) => {
    expect(item.id).toMatch(/^[a-z]+_[a-z0-9_]+$/);
    expect(TYPES).toContain(item.type);
    expect(['semente', 'faisca']).toContain(item.price.currency);
    expect(Number.isInteger(item.price.amount) && item.price.amount > 0).toBe(true);
    expect(item.sprite).toMatch(/^[a-z]+_[a-z0-9_]+$/);
    expect(item.name.length).toBeGreaterThan(0);
    if (item.type === 'food') {
      expect(item.effects.deadlineHours).toBeGreaterThan(0);
      expect(item.slot).toBeNull();
    }
    if (SLOTS.includes(item.type)) expect(item.slot).toBe(item.type);
  });

  it('itens do MVP com os preços do GDD', () => {
    const by = Object.fromEntries(items.items.map((i) => [i.id, i]));
    expect(by.food_minhoca.price).toEqual({ currency: 'semente', amount: 5 });
    expect(by.food_minhoca.effects.deadlineHours).toBe(72);
    expect(by.food_petisco_brilhante.price).toEqual({ currency: 'semente', amount: 15 });
    expect(by.food_banquete.price).toEqual({ currency: 'faisca', amount: 3 });
    expect(by.food_banquete.effects.deadlineHours).toBe(120);
    expect(by.consumable_pedra_ressurreicao.price).toEqual({ currency: 'faisca', amount: 25 });
    expect(items.items.filter((i) => i.type === 'hat')).toHaveLength(2);
    expect(items.items.filter((i) => i.type === 'nest')).toHaveLength(1);
    expect(items.items.filter((i) => i.type === 'wallpaper')).toHaveLength(1);
  });

  it('todo item tem sprite em src/art/sprites.js', () => {
    for (const i of items.items) expect(SPRITES[i.sprite], i.id).toBeDefined();
  });

  it('sprites do corvo para todos os estados', () => {
    for (const id of ['crow_idle', 'crow_happy', 'crow_eat', 'crow_pet', 'crow_hungry', 'crow_weak', 'crow_dead', 'crow_squash']) {
      expect(SPRITES[id], id).toBeDefined();
      expect(SPRITES[id].w).toBe(32);
      expect(SPRITES[id].h).toBe(32);
    }
  });
});
