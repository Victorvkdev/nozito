// Palco do ninho: cenário, corvo com cosméticos, animações em steps.
import { drawSprite, spriteInfo } from '../art/render.js';
import { drawScene } from './scene.js';
import { fitPixelCanvas, reducedMotion } from './pixel.js';

const POSE_BY_STAGE = { feliz: 'idle', com_fome: 'idle', faminto: 'hungry', fraco: 'weak', morto: 'dead' };

export function createStage(canvas, container, { onTap, items = {} } = {}) {
  const ctx = canvas.getContext('2d');
  const px = fitPixelCanvas(canvas, container);
  let stage = 'feliz';
  let equipped = {};
  let treasures = [];
  let transient = null;
  let squashUntil = 0;
  let particles = [];
  let crowBox = { x: 0, y: 0, w: 32, h: 32 };
  let running = true;

  container.addEventListener('pointerup', (ev) => {
    const p = px.toLogical(ev);
    onTap?.({ onCrow: p.x >= crowBox.x - 6 && p.x <= crowBox.x + 38 && p.y >= crowBox.y - 6 && p.y <= crowBox.y + 38 });
  });

  function pose(t) {
    if (stage === 'morto') return 'dead';
    if (transient && t < transient.until) return transient.pose;
    transient = null;
    return POSE_BY_STAGE[stage] ?? 'idle';
  }

  function frameFor(p, t) {
    const rm = reducedMotion();
    switch (p) {
      case 'idle':
        return { id: 'crow_idle', frame: t % 3400 < 160 ? 1 : 0, dy: !rm && Math.floor(t / 650) % 2 ? 1 : 0 };
      case 'happy': {
        const f = rm ? 0 : Math.floor(t / 200) % 2;
        return { id: 'crow_happy', frame: f, dy: f ? -2 : 0, spriteShifted: true };
      }
      case 'eat':
        return { id: 'crow_eat', frame: Math.floor(t / 180) % 2 };
      case 'pet':
        return { id: 'crow_pet', frame: 0 };
      case 'hungry': {
        const f = rm ? 0 : Math.floor(t / 900) % 2;
        return { id: 'crow_hungry', frame: f, dy: f, spriteShifted: true };
      }
      case 'weak': {
        const f = rm ? 0 : Math.floor(t / 140) % 2;
        return { id: 'crow_weak', frame: f, dx: f, skin: 'weak', spriteShifted: true };
      }
      default:
        return { id: 'crow_idle', frame: 0 };
    }
  }

  /** Cosmético desenhado relativo ao corvo (anchor do items.json). */
  function drawWorn(slot, x, y) {
    const id = equipped[slot];
    const item = id && items[id];
    if (!item?.anchor) return;
    drawSprite(ctx, item.sprite, x + item.anchor[0], y + item.anchor[1]);
  }

  function draw(t) {
    if (!running) return;
    const { W, H } = px;
    const sky = items[equipped.wallpaper]?.sky ?? null;
    const { nestX, groundY } = drawScene(ctx, W, H, t, { reducedMotion: reducedMotion(), sky });
    const crowX = nestX - 16;
    const crowY = groundY - 29;
    crowBox = { x: crowX, y: crowY, w: 32, h: 32 };

    if (stage === 'morto') {
      const bob = reducedMotion() ? 0 : Math.floor(t / 500) % 2;
      drawSprite(ctx, 'crow_dead', crowX, crowY - 14 - bob, { skin: 'ghost', alpha: 0.55 });
      drawSprite(ctx, 'grave', nestX - 8, groundY - 12);
    } else {
      const f = frameFor(pose(t), t);
      const squash = t < squashUntil;
      // sprites "shifted" já trazem o deslocamento no desenho; o cosmético acompanha por dx/dy
      const bodyDy = f.spriteShifted ? 0 : (f.dy ?? 0);
      const wx = crowX + (f.dx ?? 0);
      const wy = crowY + (f.dy ?? 0);
      if (!squash) drawWorn('cape', wx, wy);
      drawSprite(ctx, squash ? 'crow_squash' : f.id, crowX, crowY + bodyDy, {
        frame: squash ? 0 : f.frame,
        skin: f.skin ?? 'default',
      });
      if (!squash) {
        drawWorn('glasses', wx, wy);
        drawWorn('hat', wx, wy);
      }
      // tesouros da Caça ao Brilho enfeitam o galho, dos dois lados do ninho
      const spots = [];
      for (let x = nestX - 33; x > 1; x -= 9) spots.push(x);
      for (let x = nestX + 25; x < W - 9; x += 9) spots.push(x);
      treasures.slice(0, spots.length).forEach((id, i) => drawSprite(ctx, items[id]?.sprite ?? id, spots[i], groundY - 4));
      const nestId = items[equipped.nest]?.sprite ?? 'scene_nest';
      const nest = spriteInfo(nestId);
      drawSprite(ctx, nestId, nestX - nest.w / 2, groundY - 9);
    }

    particles = particles.filter((q) => t - q.born < q.life);
    for (const q of particles) {
      if (t < q.born) continue;
      const k = Math.floor(((t - q.born) / q.life) * 6) / 6;
      if (q.kind === 'heart') {
        drawSprite(ctx, 'icon_heart', q.x, q.y - k * 14, { alpha: 1 - k * 0.6 });
      } else {
        ctx.fillStyle = q.color;
        ctx.fillRect(Math.round(q.x + q.vx * k * 6), Math.round(q.y + k * 8), 2, 2);
      }
    }
    requestAnimationFrame(draw);
  }

  function burst(kind) {
    const t = performance.now();
    const n = reducedMotion() ? 1 : kind === 'heart' ? 3 : 6;
    for (let i = 0; i < n; i++) {
      if (kind === 'heart') {
        particles.push({ kind, born: t + i * 120, life: 900, x: crowBox.x + 18 + i * 4 - 4, y: crowBox.y - 2 });
      } else {
        particles.push({
          kind, born: t, life: 600, x: crowBox.x + 27, y: crowBox.y + 13, vx: (i % 3) - 1,
          color: ['#946b43', '#e98aa6', '#c9a36a'][i % 3],
        });
      }
    }
  }

  function floatText(text) {
    const el = document.createElement('span');
    el.className = 'floater';
    el.textContent = text;
    el.setAttribute('aria-hidden', 'true');
    container.append(el);
    setTimeout(() => el.remove(), 1000);
  }

  requestAnimationFrame(draw);

  return {
    setStage(s) {
      stage = s;
    },
    setEquipped(e) {
      equipped = e ?? {};
    },
    setTreasures(list) {
      treasures = list ?? [];
    },
    play(kind) {
      const t = performance.now();
      if (kind === 'tap') squashUntil = t + 90;
      if (kind === 'eat') {
        transient = { pose: 'eat', until: t + 1200 };
        burst('crumb');
        setTimeout(() => (transient = { pose: 'happy', until: performance.now() + 700 }), 1200);
      }
      if (kind === 'pet') {
        transient = { pose: 'pet', until: t + 900 };
        burst('heart');
      }
      if (kind === 'happy') transient = { pose: 'happy', until: t + 1200 };
    },
    floatText,
    pause() {
      running = false;
    },
    resume() {
      if (running) return;
      running = true;
      px.resize();
      requestAnimationFrame(draw);
    },
  };
}
