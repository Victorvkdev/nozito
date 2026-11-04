// Tela de minijogo: instruções → contagem → 20s → servidor valida e dá a recompensa.
import * as api from '../net/api.js';
import { MINIGAMES } from '../../shared/rules.js';
import { fitPixelCanvas } from '../render/pixel.js';

export function createMinigameScreen(root, logic, { onResult, onError, onHome }) {
  const game = root.dataset.game;
  const cfg = MINIGAMES[game];
  const canvas = root.querySelector('canvas');
  const stage = root.querySelector('.mg-stage');
  const overlay = root.querySelector('.mg-overlay');
  const text = root.querySelector('.mg-msg');
  const startBtn = root.querySelector('.mg-start');
  const homeBtn = root.querySelector('.mg-home');
  const keys = root.querySelector('.mg-keys');
  const scoreEl = root.querySelector('.mg-score');
  const timeEl = root.querySelector('.mg-time');
  const ctx = canvas.getContext('2d');
  const px = fitPixelCanvas(canvas, stage, { minW: 80, minH: 100 });

  let phase = 'idle'; // idle | countdown | play | sending | done
  let score = 0;
  let startedAt = 0;
  let roundId = null;
  let visible = false;

  function setScore(v) {
    score = Math.max(0, v);
    scoreEl.textContent = String(score);
  }

  function showOverlay(html) {
    overlay.hidden = false;
    text.replaceChildren(...html);
  }

  function loop(t) {
    if (!visible) return;
    if (phase === 'play') {
      const elapsed = t - startedAt;
      const pts = logic.update(t, elapsed, px.W, px.H);
      if (pts) hit(pts);
      const left = Math.max(0, Math.ceil((cfg.durationMs - elapsed) / 1000));
      timeEl.textContent = String(left);
      if (elapsed >= cfg.durationMs) finish();
    }
    logic.draw(ctx, t, px.W, px.H);
    requestAnimationFrame(loop);
  }

  async function begin() {
    if (phase === 'countdown' || phase === 'play' || phase === 'sending') return;
    phase = 'countdown';
    setScore(0);
    logic.reset(px.W, px.H);
    startBtn.hidden = true;
    homeBtn.hidden = true;
    keys.hidden = true;
    try {
      const r = await api.roundStart(game);
      roundId = r.roundId;
    } catch (e) {
      phase = 'idle';
      startBtn.hidden = false;
      onError(e);
      return;
    }
    for (const n of ['3', '2', '1']) {
      const big = document.createElement('p');
      big.className = 'mg-big';
      big.textContent = n;
      showOverlay([big]);
      await new Promise((r) => setTimeout(r, 600));
    }
    overlay.hidden = true;
    phase = 'play';
    startedAt = performance.now();
  }

  async function finish() {
    if (phase !== 'play') return;
    phase = 'sending';
    timeEl.textContent = '0';
    const msg = document.createElement('p');
    msg.className = 'mg-text';
    msg.textContent = 'Contando…';
    overlay.hidden = false;
    text.replaceChildren(msg);
    // o servidor confere o tempo desde o início: espera completar se o relógio daqui adiantou
    await new Promise((r) => setTimeout(r, 300));
    try {
      const res = await api.roundFinish(roundId, score);
      phase = 'done';
      const big = document.createElement('p');
      big.className = 'mg-big';
      big.textContent = String(res.score);
      const line = document.createElement('p');
      line.className = 'mg-text';
      line.textContent = onResult(game, res);
      showOverlay([big, line]);
    } catch (e) {
      phase = 'done';
      onError(e);
      const line = document.createElement('p');
      line.className = 'mg-text';
      line.textContent = 'Não deu para salvar esta rodada.';
      showOverlay([line]);
    }
    startBtn.textContent = 'Jogar de novo';
    startBtn.hidden = false;
    homeBtn.hidden = false;
  }

  function hit(points) {
    if (points) setScore(score + points);
  }

  stage.addEventListener('pointerdown', (ev) => {
    if (phase !== 'play') return;
    const p = px.toLogical(ev);
    hit(logic.tap(p.x, p.y, performance.now()));
  });
  // arrastar: minijogos de movimento (Caça ao Brilho) seguem o dedo/mouse
  stage.addEventListener('pointermove', (ev) => {
    if (phase !== 'play' || !logic.move) return;
    const p = px.toLogical(ev);
    logic.move(p.x, p.y, performance.now());
  });
  document.addEventListener('keydown', (ev) => {
    if (!visible || phase !== 'play') return;
    const pts = logic.key(ev.key, performance.now(), ev);
    if (pts) {
      ev.preventDefault();
      hit(pts);
    }
  });
  document.addEventListener('keyup', (ev) => {
    if (visible && logic.keyup) logic.keyup(ev.key);
  });
  startBtn.addEventListener('click', begin);
  homeBtn.addEventListener('click', onHome);

  return {
    show() {
      visible = true;
      px.resize();
      timeEl.textContent = String(cfg.durationMs / 1000);
      requestAnimationFrame(loop);
    },
    hide() {
      visible = false;
      if (phase === 'countdown' || phase === 'play') {
        phase = 'idle'; // saiu no meio: a rodada é abandonada
        overlay.hidden = false;
        startBtn.hidden = false;
        startBtn.textContent = 'Começar';
      }
    },
  };
}
