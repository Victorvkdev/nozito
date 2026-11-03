// Palco: canvas em pixels lógicos, escala inteira, animações em steps.
import { drawSprite, spriteInfo } from '../art/render.js';
import { drawScene } from './scene.js';

const POSE_BY_STAGE = { feliz: 'idle', com_fome: 'idle', faminto: 'hungry', fraco: 'weak', morto: 'dead' };

export function createStage(canvas, container, { onTap } = {}) {
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let W = 90;
  let H = 80;
  let scale = 4;
  let stage = 'feliz';
  let transient = null; // { pose, until }
  let squashUntil = 0;
  let particles = [];
  let crowBox = { x: 0, y: 0, w: 32, h: 32 };
  let raf = 0;

  function resize() {
    const r = container.getBoundingClientRect();
    if (!r.width || !r.height) return;
    scale = Math.max(2, Math.min(6, Math.floor(Math.min(r.width / 88, r.height / 76))));
    W = Math.ceil(r.width / scale);
    H = Math.ceil(r.height / scale);
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = `${W * scale}px`;
    canvas.style.height = `${H * scale}px`;
  }
  new ResizeObserver(resize).observe(container);
  resize();

  function toLogical(ev) {
    const r = canvas.getBoundingClientRect();
    return { x: ((ev.clientX - r.left) / r.width) * W, y: ((ev.clientY - r.top) / r.height) * H };
  }

  container.addEventListener('pointerup', (ev) => {
    const p = toLogical(ev);
    onTap?.({ onCrow: p.x >= crowBox.x - 6 && p.x <= crowBox.x + crowBox.w + 6 && p.y >= crowBox.y - 6 && p.y <= crowBox.y + crowBox.h + 6 });
  });

  function pose(now) {
    if (stage === 'morto') return 'dead';
    if (transient && now < transient.until) return transient.pose;
    transient = null;
    return POSE_BY_STAGE[stage] ?? 'idle';
  }

  function frameFor(p, t) {
    const rm = reduced.matches;
    switch (p) {
      case 'idle': {
        const blink = t % 3400 < 160;
        return { id: 'crow_idle', frame: blink ? 1 : 0, dy: !rm && Math.floor(t / 650) % 2 ? 1 : 0 };
      }
      case 'happy':
        return { id: 'crow_happy', frame: rm ? 0 : Math.floor(t / 200) % 2 };
      case 'eat':
        return { id: 'crow_eat', frame: Math.floor(t / 180) % 2 };
      case 'pet':
        return { id: 'crow_pet', frame: 0 };
      case 'hungry':
        return { id: 'crow_hungry', frame: rm ? 0 : Math.floor(t / 900) % 2 };
      case 'weak':
        return { id: 'crow_weak', frame: rm ? 0 : Math.floor(t / 140) % 2, skin: 'weak' };
      default:
        return { id: 'crow_idle', frame: 0 };
    }
  }

  function draw(t) {
    const { nestX, groundY } = drawScene(ctx, W, H, t, { reducedMotion: reduced.matches });
    const crowX = nestX - 16;
    const crowY = groundY - 29;
    crowBox = { x: crowX, y: crowY, w: 32, h: 32 };

    if (stage === 'morto') {
      const bob = reduced.matches ? 0 : Math.floor(t / 500) % 2;
      drawSprite(ctx, 'crow_dead', crowX, crowY - 14 - bob, { skin: 'ghost', alpha: 0.55 });
      drawSprite(ctx, 'grave', nestX - 8, groundY - 12);
    } else {
      const p = pose(t);
      const f = frameFor(p, t);
      const squash = t < squashUntil;
      drawSprite(ctx, squash ? 'crow_squash' : f.id, crowX, crowY + (f.dy ?? 0), {
        frame: squash ? 0 : f.frame,
        skin: f.skin ?? 'default',
      });
      const nest = spriteInfo('scene_nest');
      drawSprite(ctx, 'scene_nest', nestX - nest.w / 2, groundY - 9);
    }

    // partículas (corações, migalhas)
    particles = particles.filter((q) => t - q.born < q.life);
    for (const q of particles) {
      const k = Math.floor(((t - q.born) / q.life) * 6) / 6; // steps(6)
      if (q.kind === 'heart') {
        drawSprite(ctx, 'icon_heart', q.x, q.y - k * 14, { alpha: 1 - k * 0.6 });
      } else {
        ctx.fillStyle = q.color;
        ctx.fillRect(Math.round(q.x + q.vx * k * 6), Math.round(q.y + k * 8), 2, 2);
      }
    }
    raf = requestAnimationFrame(draw);
  }

  function burst(kind) {
    const t = performance.now();
    const n = reduced.matches ? 1 : kind === 'heart' ? 3 : 6;
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

  /** Texto flutuante (DOM, VT323) por cima do canvas. */
  function floatText(text) {
    const el = document.createElement('span');
    el.className = 'floater';
    el.textContent = text;
    el.setAttribute('aria-hidden', 'true');
    container.append(el);
    setTimeout(() => el.remove(), 1000);
  }

  raf = requestAnimationFrame(draw);

  return {
    setStage(s) {
      stage = s;
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
    snapshot() {
      return canvas.toDataURL('image/png');
    },
    stop() {
      cancelAnimationFrame(raf);
    },
  };
}
