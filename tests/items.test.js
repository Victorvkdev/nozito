import { describe, it, expect } from 'vitest';
import items from '../content/items.json';
import { SPRITES } from '../src/art/sprites.js';
import { PALETTE } from '../src/art/sprites.js';

const TYPES = ['food', 'consumable', 'treasure', 'hat', 'glasses', 'cape', 'nest', 'toy', 'wallpaper', 'scene'];
const SLOTS = ['hat', 'glasses', 'cape', 'nest', 'toy', 'wallpaper', 'scene'];

describe('content/items.json', () => {
  it('ids únicos', () => {
    const ids = items.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(items.items)('$id é válido', (item) => {
    expect(item.id).toMatch(/^[a-z]+_[a-z0-9_]+$/);
    expect(TYPES).toContain(item.type);
    expect(item.name.length).toBeGreaterThan(0);
    expect(SPRITES[item.sprite], 'sprite').toBeDefined();
    if (item.price === null) {
      expect(['cata_minhoca', 'caca_brilho']).toContain(item.source);
    } else {
      expect(item.price.currency).toBe('faisca'); // só Faísca: não existe moeda interna
      expect(Number.isInteger(item.price.amount) && item.price.amount > 0).toBe(true);
      expect(item.source).toBe('loja');
    }
    if (item.type === 'food') {
      expect(item.effects.belly).toBeGreaterThan(0);
      expect(item.effects.belly).toBeLessThanOrEqual(100);
      expect(item.slot).toBeNull();
    }
    if (SLOTS.includes(item.type)) expect(item.slot).toBe(item.type);
    if (['hat', 'glasses', 'cape'].includes(item.type)) expect(item.anchor).toHaveLength(2);
    if (item.type === 'treasure') {
      expect(item.price).toBeNull();
      expect(['comum', 'raro', 'lendario']).toContain(item.rarity);
    }
    if (item.type === 'wallpaper') {
      expect(item.sky).toHaveLength(4);
      for (const ch of item.sky) expect(PALETTE[ch], ch).toBeDefined();
    }
  });

  it('Minhoca e tesouros não se compram; o resto é Faísca', () => {
    const by = Object.fromEntries(items.items.map((i) => [i.id, i]));
    expect(by.food_minhoca.price).toBeNull();
    expect(by.food_minhoca.freshHours).toBe(24);
    expect(items.items.filter((i) => i.type === 'treasure').length).toBeGreaterThanOrEqual(8);
    expect(by.food_banquete.price).toEqual({ currency: 'faisca', amount: 3 });
    expect(by.food_sopa_quentinha.effects.slowDigestionHours).toBe(24);
    expect(JSON.stringify(items)).not.toMatch(/semente/i);
  });

  it('sprites do corvo para todos os estados', () => {
    for (const id of ['crow_idle', 'crow_happy', 'crow_eat', 'crow_pet', 'crow_hungry', 'crow_weak', 'crow_dead', 'crow_squash']) {
      expect(SPRITES[id], id).toBeDefined();
    }
  });
});
