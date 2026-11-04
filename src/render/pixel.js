// Canvas em pixels lógicos esticado por escala INTEIRA (nada borrado).
export function fitPixelCanvas(canvas, container, { minW = 88, minH = 76 } = {}) {
  const state = { W: minW, H: minH, scale: 4 };
  function resize() {
    const r = container.getBoundingClientRect();
    if (!r.width || !r.height) return;
    state.scale = Math.max(2, Math.min(6, Math.floor(Math.min(r.width / minW, r.height / minH))));
    state.W = Math.ceil(r.width / state.scale);
    state.H = Math.ceil(r.height / state.scale);
    canvas.width = state.W;
    canvas.height = state.H;
    canvas.style.width = `${state.W * state.scale}px`;
    canvas.style.height = `${state.H * state.scale}px`;
  }
  new ResizeObserver(resize).observe(container);
  resize();
  state.resize = resize;
  /** Coordenada do ponteiro em pixels lógicos. */
  state.toLogical = (ev) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((ev.clientX - r.left) / r.width) * state.W, y: ((ev.clientY - r.top) / r.height) * state.H };
  };
  return state;
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
