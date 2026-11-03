// Desenha sprites em texto no canvas. Cache por (id, frame, skin) em canvas 1x.
import { PALETTE, SPRITES } from './sprites.js';

// Palette swap (como as skins do Krowlect).
export const SKINS = {
  default: {},
  // fraco: dessaturado
  weak: { b: '#3a3648', B: '#4a4558', K: '#2a2733', h: '#5a5468', v: '#6a6188', u: '#4f4a66', ç: '#9a7f8a' },
  // fantasminha
  ghost: { k: '#4a2a9e', K: '#7c4dff', b: '#a78bfa', B: '#ddd0ff', h: '#ddd0ff', N: '#a78bfa', X: '#a78bfa', j: '#ddd0ff', ç: '#ddd0ff' },
};

const cache = new Map();

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function spriteInfo(id) {
  const s = SPRITES[id];
  if (!s) throw new Error(`sprite desconhecido: ${id}`);
  return s;
}

export function spriteCanvas(id, frame = 0, skin = 'default') {
  const key = `${id}|${frame}|${skin}`;
  let c = cache.get(key);
  if (c) return c;
  const s = spriteInfo(id);
  const rows = s.frames[frame % s.frames.length];
  const swap = SKINS[skin] ?? {};
  c = makeCanvas(s.w, s.h);
  const ctx = c.getContext('2d');
  rows.forEach((row, y) => {
    let x = 0;
    for (const ch of row) {
      if (ch !== '.') {
        ctx.fillStyle = swap[ch] ?? PALETTE[ch];
        ctx.fillRect(x, y, 1, 1);
      }
      x += 1;
    }
  });
  cache.set(key, c);
  return c;
}

export function drawSprite(ctx, id, x, y, { scale = 1, frame = 0, skin = 'default', alpha = 1, flip = false } = {}) {
  const s = spriteInfo(id);
  const img = spriteCanvas(id, frame, skin);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = alpha;
  if (flip) {
    ctx.translate(Math.round(x) + s.w * scale, Math.round(y));
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0, s.w * scale, s.h * scale);
  } else {
    ctx.drawImage(img, Math.round(x), Math.round(y), s.w * scale, s.h * scale);
  }
  ctx.restore();
}

const urlCache = new Map();
/** PNG em data URL para usar em <img> (ícones da UI). */
export function spriteDataURL(id, { scale = 3, frame = 0, skin = 'default' } = {}) {
  const key = `${id}|${scale}|${frame}|${skin}`;
  if (urlCache.has(key)) return urlCache.get(key);
  const s = spriteInfo(id);
  const c = document.createElement('canvas');
  c.width = s.w * scale;
  c.height = s.h * scale;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(spriteCanvas(id, frame, skin), 0, 0, c.width, c.height);
  const url = c.toDataURL('image/png');
  urlCache.set(key, url);
  return url;
}

export { PALETTE, SPRITES };
