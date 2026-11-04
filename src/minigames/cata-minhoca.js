// Cata Minhoca: minhocas saem dos buracos; toque antes que se escondam.
import { drawSprite } from '../art/render.js';
import { PALETTE as P } from '../art/sprites.js';
import { drawScene } from '../render/scene.js';

export function createCataMinhoca() {
  let holes = [];
  let nextSpawn = 0;
  let pops = [];

  function layout(W, H) {
    const cols = [0.2, 0.5, 0.8].map((f) => Math.round(W * f));
    const rows = [Math.round(H * 0.58), Math.round(H * 0.82)];
    holes = rows.flatMap((y) => cols.map((x) => ({ x, y, until: 0, shownAt: 0 })));
  }

  return {
    reset(W, H) {
      layout(W, H);
      nextSpawn = 0;
      pops = [];
    },
    update(t, elapsed, W, H) {
      if (holes.length === 0) layout(W, H);
      const active = holes.filter((h) => h.until > t).length;
      if (t >= nextSpawn && active < 3) {
        const free = holes.filter((h) => h.until <= t);
        const h = free[Math.floor(Math.random() * free.length)];
        if (h) {
          const life = 1300 - Math.min(500, elapsed / 40); // fica mais rápido
          h.shownAt = t;
          h.until = t + life;
        }
        nextSpawn = t + 520;
      }
    },
    draw(ctx, t, W, H) {
      drawScene(ctx, W, H, t, { branch: false });
      const top = Math.round(H * 0.42);
      ctx.fillStyle = P.M;
      ctx.fillRect(0, top, W, 3);
      ctx.fillStyle = P.m;
      for (let x = 0; x < W; x += 3) ctx.fillRect(x, top - 1, 1, 1);
      ctx.fillStyle = P.e;
      ctx.fillRect(0, top + 3, W, H - top);
      ctx.fillStyle = P.o;
      for (let y = top + 5; y < H; y += 4) for (let x = (y * 7) % 5; x < W; x += 6) ctx.fillRect(x, y, 1, 1);
      for (const h of holes) {
        drawSprite(ctx, 'mg_hole', h.x - 7, h.y - 2);
        if (h.until > t) {
          const rise = Math.min(1, (t - h.shownAt) / 120);
          const frame = Math.floor(t / 160) % 2;
          ctx.save();
          ctx.beginPath();
          ctx.rect(h.x - 8, h.y - 16, 16, 16);
          ctx.clip();
          drawSprite(ctx, 'mg_worm', h.x - 4, h.y + 1 - Math.round(12 * rise), { frame });
          ctx.restore();
        }
      }
      pops = pops.filter((p) => t - p.t < 500);
      ctx.fillStyle = P.y;
      for (const p of pops) {
        const k = Math.floor(((t - p.t) / 500) * 4);
        ctx.fillRect(p.x - 1, p.y - 14 - k * 2, 3, 1);
        ctx.fillRect(p.x, p.y - 15 - k * 2, 1, 3);
      }
    },
    /** Toque: devolve pontos ganhos. */
    tap(x, y, t) {
      for (const h of holes) {
        if (h.until > t && Math.abs(x - h.x) <= 9 && y >= h.y - 16 && y <= h.y + 4) {
          h.until = 0;
          pops.push({ x: h.x, y: h.y, t });
          return 1;
        }
      }
      return 0;
    },
    key(k, t) {
      const i = Number(k) - 1;
      const h = holes[i];
      if (!Number.isInteger(i) || !h || h.until <= t) return 0;
      h.until = 0;
      pops.push({ x: h.x, y: h.y, t });
      return 1;
    },
  };
}
