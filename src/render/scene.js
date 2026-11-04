// Cenário padrão (ARTSTYLE §6): noite violeta, estrelas, lua pontilhada, galho com ninho.
import { PALETTE } from '../art/render.js';

const P = PALETTE;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

let starCache = { w: 0, h: 0, stars: [] };
function stars(w, h) {
  if (starCache.w === w && starCache.h === h) return starCache.stars;
  const r = rng(42);
  const list = [];
  const n = Math.round((w * h) / 140);
  for (let i = 0; i < n; i++) {
    list.push({ x: Math.floor(r() * w), y: Math.floor(r() * h * 0.62), big: r() < 0.12, blink: r() < 0.35, phase: Math.floor(r() * 4) });
  }
  starCache = { w, h, stars: list };
  return list;
}

/**
 * Desenha o cenário em pixels lógicos. Devolve o ponto onde o ninho fica.
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawScene(ctx, w, h, t, { reducedMotion = false, sky = null, branch = true } = {}) {
  // céu em faixas (sem gradiente suave); `sky` = 4 chars da paleta (papel de parede)
  const bands = (sky ?? ['k', 'K', 'b', 'ã']).map((c) => P[c]);
  const bandH = Math.ceil((h * 0.8) / bands.length);
  bands.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(0, i * bandH, w, bandH + 1);
  });
  ctx.fillStyle = bands[bands.length - 1];
  ctx.fillRect(0, bandH * bands.length, w, h);
  // dither entre faixas
  for (let i = 1; i < bands.length; i++) {
    ctx.fillStyle = bands[i];
    const y = i * bandH - 1;
    for (let x = i % 2; x < w; x += 2) ctx.fillRect(x, y, 1, 1);
  }

  // estrelas piscando em steps(2)
  const tick = reducedMotion ? 0 : Math.floor(t / 700);
  for (const s of stars(w, h)) {
    const on = !s.blink || (tick + s.phase) % 4 !== 0;
    if (!on) continue;
    ctx.fillStyle = s.big ? P.l : P.V;
    ctx.fillRect(s.x, s.y, 1, 1);
    if (s.big) {
      ctx.fillStyle = P.h;
      ctx.fillRect(s.x - 1, s.y, 1, 1);
      ctx.fillRect(s.x + 1, s.y, 1, 1);
      ctx.fillRect(s.x, s.y - 1, 1, 1);
      ctx.fillRect(s.x, s.y + 1, 1, 1);
    }
  }

  // lua com halo pontilhado
  const mx = w - 18;
  const my = 16;
  for (let y = -11; y <= 11; y++) {
    for (let x = -11; x <= 11; x++) {
      const d = Math.hypot(x, y);
      if (d <= 6) {
        ctx.fillStyle = x + y < -3 ? P.w : x + y > 4 ? P.W : P.l;
        if ((x === 2 && y === -1) || (x === -2 && y === 3) || (x === 3 && y === 2)) ctx.fillStyle = P.W;
        ctx.fillRect(mx + x, my + y, 1, 1);
      } else if (d <= 10 && (x + y) % 2 === 0 && d > 7.2) {
        ctx.fillStyle = P.h;
        ctx.fillRect(mx + x, my + y, 1, 1);
      }
    }
  }

  // galho atravessando
  const groundY = h - 18;
  const nestX = Math.round(w / 2);
  if (!branch) return { nestX, groundY };
  for (let x = 0; x < w; x++) {
    const sag = Math.round(Math.sin((x / w) * Math.PI) * 2);
    const y = groundY + 4 - sag;
    ctx.fillStyle = P.e;
    ctx.fillRect(x, y - 1, 1, 5);
    ctx.fillStyle = P.o;
    ctx.fillRect(x, y, 1, 3);
    ctx.fillStyle = P.O;
    if (x % 5 !== 0) ctx.fillRect(x, y, 1, 1);
  }
  // folhas em tufos
  const leaves = [8, 22, w - 26, w - 10];
  for (const lx of leaves) {
    const ly = groundY + 1;
    const pts = [[0, 0], [1, 0], [2, -1], [-1, -1], [0, -1], [1, -1], [0, -2], [3, -2], [2, -2]];
    for (const [dx, dy] of pts) {
      ctx.fillStyle = dy === -2 ? P.n : dy === -1 ? P.m : P.M;
      ctx.fillRect(lx + dx, ly + dy, 1, 1);
    }
  }

  // névoa violeta embaixo (dither)
  ctx.fillStyle = P.u;
  for (let y = h - 6; y < h; y++) {
    for (let x = (y % 2); x < w; x += 2) ctx.fillRect(x, y, 1, 1);
  }

  // vinheta nas bordas
  ctx.fillStyle = P.k;
  for (let y = 0; y < h; y++) {
    for (let i = 0; i < 3; i++) {
      if ((y + i) % (i + 2) === 0) {
        ctx.fillRect(i, y, 1, 1);
        ctx.fillRect(w - 1 - i, y, 1, 1);
      }
    }
  }

  return { nestX, groundY };
}
