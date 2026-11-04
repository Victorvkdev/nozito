// Caça ao Brilho: o Nózito voa de verdade. Arraste (ou use ← →) para posicioná-lo e pegue o que brilha.
// Pedra atordoa e zera o combo. Combo sobe o multiplicador. Ímã puxa brilhos. 3 estrelas de meta.
import { drawSprite } from '../art/render.js';
import { PALETTE as P } from '../art/sprites.js';
import { drawScene } from '../render/scene.js';
import { reducedMotion } from '../render/pixel.js';

/** Pontos para cada estrela (a 1ª também libera a chance de tesouro). */
export const STARS = [10, 30, 50];

const KINDS = [
  { id: 'coin', sprite: 'mg_coin', value: 1, weight: 46 },
  { id: 'ring', sprite: 'mg_ring', value: 2, weight: 20 },
  { id: 'gem', sprite: 'mg_gem', value: 5, weight: 8, fast: true }, // dourado: rápido e em zigue-zague
  { id: 'rock', sprite: 'mg_rock', value: -3, weight: 26, bad: true },
  { id: 'magnet', sprite: null, value: 0, weight: 4, magnet: true },
];

const COMBO_WINDOW = 2000; // ms para pegar o próximo sem perder o combo
const STUN_MS = 600;
const INVULN_MS = 1400;
const MAGNET_MS = 3000;
const MAGNET_RADIUS = 46;
const CROW_SIZE = 32;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const multFor = (combo) => (combo >= 14 ? 3 : combo >= 6 ? 2 : 1);
export const starsFor = (score) => STARS.filter((s) => score >= s).length;

// ---------- mini fonte 3×5 (só o que a tela precisa)
const GLYPH = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111',
  4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001001001',
  8: '111101111101111', 9: '111101111001111', '+': '000010111010000', '-': '000000111000000',
  x: '000101010101000',
};
function text(ctx, s, x, y, color) {
  for (const [dx, dy, c] of [[1, 1, P.k], [0, 0, color]]) {
    ctx.fillStyle = c;
    let cx = x;
    for (const ch of s) {
      const g = GLYPH[ch];
      if (g) for (let i = 0; i < 15; i++) if (g[i] === '1') ctx.fillRect(cx + dx + (i % 3), y + dy + Math.floor(i / 3), 1, 1);
      cx += 4;
    }
  }
}
const textW = (s) => s.length * 4 - 1;

const STAR = ['00100', '00100', '11111', '01110', '11011'];
function star(ctx, x, y, on) {
  ctx.fillStyle = on ? P.g : P.N;
  STAR.forEach((row, j) => {
    for (let i = 0; i < 5; i++) if (row[i] === '1') ctx.fillRect(x + i, y + j, 1, 1);
  });
}

const MAGNET_ART = ['11000011', '11000011', '11000011', '11000011', '01100110', '00111100'];
function drawMagnet(ctx, x, y, t) {
  const bx = Math.round(x);
  const by = Math.round(y);
  MAGNET_ART.forEach((row, j) => {
    for (let i = 0; i < 8; i++) {
      if (row[i] !== '1') continue;
      ctx.fillStyle = j < 2 ? (i < 4 ? P.r : P.V) : P.W; // pontas coloridas, curva cinza
      ctx.fillRect(bx + i, by + j, 1, 1);
    }
  });
  ctx.fillStyle = P.y;
  if (Math.floor(t / 180) % 2) ctx.fillRect(bx + 3, by + 6, 2, 1);
}

export function createCacaBrilho() {
  let drops = [];
  let nextSpawn = 0;
  let last = 0;
  let W = 100;
  let H = 140;
  let cx = 50; // centro do corvo
  let tx = 50; // alvo do dedo
  let held = 0; // -1 esquerda, 0 parado, 1 direita (teclado)
  let stunUntil = 0;
  let invulUntil = 0;
  let happyUntil = 0;
  let magnetUntil = 0;
  let shakeUntil = 0;
  let combo = 0;
  let comboUntil = 0;
  let score = 0;
  let popups = [];
  let sparks = [];
  let rm = false;

  const crowY = () => H - CROW_SIZE - 2;
  const minX = () => 14;
  const maxX = () => W - 14;

  function pick(t) {
    const pool = KINDS.filter((k) => !(k.magnet && (t < magnetUntil || t < 4000 || drops.some((d) => d.magnet))));
    const total = pool.reduce((s, k) => s + k.weight, 0);
    let r = Math.random() * total;
    for (const k of pool) if ((r -= k.weight) < 0) return k;
    return pool[0];
  }

  function spawn(t, elapsed) {
    const base = H / (2600 - Math.min(900, elapsed / 15));
    const x = 6 + Math.random() * (W - 20);
    const kind = pick(t);
    // trilha: 4 moedas em fila, premia quem se posiciona
    if (kind.id === 'coin' && Math.random() < 0.10) {
      for (let i = 0; i < 4; i++) drops.push({ ...kind, bx: x, x, y: -8 - i * 12, speed: base, born: t, amp: 0 });
      return 900;
    }
    drops.push({
      ...kind,
      bx: x,
      x,
      y: -8,
      speed: base * (kind.fast ? 1.45 : kind.magnet ? 0.85 : 1),
      born: t,
      amp: kind.fast ? 9 : 0,
    });
    return Math.max(460, 720 - elapsed / 70);
  }

  function addPopup(x, y, s, c, t) {
    popups.push({ x, y, s, c, t });
  }
  function burst(x, y, t) {
    if (rm) return;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.random();
      sparks.push({ x, y, vx: Math.cos(a) * 0.03, vy: Math.sin(a) * 0.03 - 0.02, t });
    }
  }

  function setTarget(x) {
    tx = clamp(x, minX(), maxX());
  }

  return {
    reset(w, h) {
      if (w) W = w;
      if (h) H = h;
      drops = [];
      popups = [];
      sparks = [];
      nextSpawn = 0;
      last = 0;
      cx = tx = Math.round(W / 2);
      held = 0;
      stunUntil = invulUntil = happyUntil = magnetUntil = shakeUntil = 0;
      combo = 0;
      comboUntil = 0;
      score = 0;
      rm = reducedMotion();
    },

    /** Devolve os pontos ganhos/perdidos neste quadro. */
    update(t, elapsed, w, h) {
      W = w;
      H = h;
      const dt = last ? Math.min(50, t - last) : 0;
      last = t;
      let pts = 0;

      if (t >= nextSpawn) nextSpawn = t + spawn(t, elapsed);

      // corvo: segue o dedo com velocidade limitada (posicionar é a habilidade)
      if (t >= stunUntil) {
        if (held) setTarget(held > 0 ? maxX() : minX());
        const step = (W / 800) * dt;
        cx += clamp(tx - cx, -step, step);
      } else {
        tx = cx;
      }
      cx = clamp(cx, minX(), maxX());

      if (combo > 0 && t > comboUntil) combo = 0;

      const cy = crowY() + 16;
      const magnet = t < magnetUntil;
      for (const d of drops) {
        d.y += d.speed * dt;
        if (magnet && d.value > 0) {
          const dx = cx - (d.bx + 4);
          const dy = cy - (d.y + 4);
          if (Math.hypot(dx, dy) < MAGNET_RADIUS) {
            d.bx += dx * Math.min(1, dt * 0.008);
            d.y += dy * Math.min(1, dt * 0.004);
            d.amp = 0;
          }
        }
        d.x = d.amp ? clamp(d.bx + Math.sin((t - d.born) / 260) * d.amp, 0, W - 8) : d.bx;

        // pegou? (caixa de captura do corpo do corvo)
        const ix = d.x + 4;
        const iy = d.y + 4;
        if (Math.abs(ix - cx) <= 12 && iy >= crowY() + 6 && iy <= crowY() + 24) {
          if (d.bad) {
            if (t < invulUntil) continue; // pedra passa direto enquanto ele se recupera
            d.gone = true;
            stunUntil = t + STUN_MS;
            invulUntil = t + INVULN_MS;
            shakeUntil = t + 250;
            combo = 0;
            pts -= 3;
            addPopup(cx, crowY(), '-3', P.r, t);
          } else if (d.magnet) {
            d.gone = true;
            magnetUntil = t + MAGNET_MS;
            happyUntil = t + 350;
            burst(ix, iy, t);
          } else {
            d.gone = true;
            combo += 1;
            comboUntil = t + COMBO_WINDOW;
            const gain = d.value * multFor(combo);
            pts += gain;
            happyUntil = t + 350;
            addPopup(cx, crowY(), `+${gain}`, d.id === 'gem' ? P.y : P.g, t);
            burst(ix, iy, t);
          }
        }
      }
      drops = drops.filter((d) => d.y < H && !d.gone);
      score = Math.max(0, score + pts);
      return pts;
    },

    draw(ctx, t, w, h) {
      W = w;
      H = h;
      const shake = !rm && t < shakeUntil ? (Math.floor(t / 40) % 2 ? 1 : -1) : 0;
      ctx.save();
      if (shake) ctx.translate(shake, 0);
      drawScene(ctx, W, H, t, { branch: false });

      for (const d of drops) {
        if (d.magnet) drawMagnet(ctx, d.x, d.y, t);
        else drawSprite(ctx, d.sprite, d.x, d.y);
        if (d.value > 0 && !rm && Math.floor((t + d.born) / 220) % 3 === 0) {
          ctx.fillStyle = P.w;
          ctx.fillRect(Math.round(d.x) + 6, Math.round(d.y) + 1, 1, 1);
        }
      }

      // ímã ativo: anel de pontinhos girando
      if (t < magnetUntil) {
        const cy = crowY() + 16;
        const left = magnetUntil - t;
        ctx.fillStyle = left < 800 && Math.floor(t / 100) % 2 ? P.N : P.V;
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2 + t / 600;
          ctx.fillRect(Math.round(cx + Math.cos(a) * 24), Math.round(cy + Math.sin(a) * 20), 1, 1);
        }
      }

      // corvo
      const stunned = t < stunUntil;
      const blink = t < invulUntil && !stunned && Math.floor(t / 90) % 2;
      const happy = t < happyUntil;
      const bob = stunned || rm ? 0 : Math.round(Math.sin(t / 170) * 1.5);
      drawSprite(ctx, stunned ? 'crow_squash' : happy ? 'crow_happy' : 'crow_idle', Math.round(cx) - CROW_SIZE / 2, crowY() + bob, {
        frame: happy ? Math.floor(t / 110) % 2 : Math.floor(t / 260) % 2,
        alpha: blink ? 0.45 : 1,
      });

      // popups e faíscas
      popups = popups.filter((p) => t - p.t < 700);
      for (const p of popups) {
        const age = t - p.t;
        text(ctx, p.s, Math.round(p.x - textW(p.s) / 2), Math.round(p.y - 2 - (rm ? 0 : age / 70)), p.c);
      }
      sparks = sparks.filter((s) => t - s.t < 400);
      ctx.fillStyle = P.y;
      for (const s of sparks) {
        const age = t - s.t;
        ctx.fillRect(Math.round(s.x + s.vx * age), Math.round(s.y + s.vy * age), 1, 1);
      }

      // HUD no canvas: estrelas + progresso, combo com barra de tempo
      const got = starsFor(score);
      const sx = Math.round(W / 2) - 9;
      STARS.forEach((_, i) => star(ctx, sx + i * 7, 3, i < got));
      const next = STARS[got];
      if (next) {
        const from = got ? STARS[got - 1] : 0;
        ctx.fillStyle = P.N;
        ctx.fillRect(sx, 10, 19, 1);
        ctx.fillStyle = P.g;
        ctx.fillRect(sx, 10, Math.round(19 * clamp((score - from) / (next - from), 0, 1)), 1);
      }
      if (combo >= 2) {
        const m = multFor(combo);
        const label = `x${m}`;
        text(ctx, label, 4, 3, m >= 3 ? P.y : m === 2 ? P.g : P.V);
        text(ctx, String(combo), 4, 10, P.W);
        ctx.fillStyle = P.N;
        ctx.fillRect(4, 17, 14, 1);
        ctx.fillStyle = P.V;
        ctx.fillRect(4, 17, Math.round(14 * clamp((comboUntil - t) / COMBO_WINDOW, 0, 1)), 1);
      }
      ctx.restore();
    },

    /** O toque também manda o Nózito voar até aquele ponto. */
    tap(x) {
      setTarget(x);
      return 0;
    },
    move(x) {
      setTarget(x);
    },
    key(k, t, ev) {
      const key = k.toLowerCase();
      if (key === 'arrowleft' || key === 'a') held = -1;
      else if (key === 'arrowright' || key === 'd') held = 1;
      else return 0;
      ev?.preventDefault();
      return 0;
    },
    keyup(k) {
      const key = k.toLowerCase();
      if ((key === 'arrowleft' || key === 'a') && held < 0) held = 0;
      if ((key === 'arrowright' || key === 'd') && held > 0) held = 0;
      if (!held) tx = cx;
    },
  };
}
