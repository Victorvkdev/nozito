import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBridge, resolveOrigins, ENOIS_ORIGIN } from '../src/enois/bridge.js';

function fakeWindow() {
  const listeners = new Set();
  const parent = { postMessage: vi.fn() };
  return {
    parent,
    location: { search: '' },
    addEventListener: (_t, fn) => listeners.add(fn),
    removeEventListener: (_t, fn) => listeners.delete(fn),
    emit: (event) => listeners.forEach((fn) => fn(event)),
    listeners,
  };
}

let win;
let bridge;
beforeEach(() => {
  win = fakeWindow();
  bridge = createBridge({ win, origins: new Set([ENOIS_ORIGIN]) });
});
const sent = () => win.parent.postMessage.mock.calls;

describe('envio', () => {
  it('sempre com origem explícita e version 1, nunca "*"', () => {
    bridge.ready();
    expect(sent()[0]).toEqual([{ version: 1, type: 'enois:ready' }, ENOIS_ORIGIN]);
    for (const [, origin] of sent()) expect(origin).not.toBe('*');
  });

  it('fora do iframe não envia', () => {
    const top = fakeWindow();
    top.parent = top;
    const b = createBridge({ win: top, origins: new Set([ENOIS_ORIGIN]) });
    expect(b.embedded).toBe(false);
    expect(b.ready()).toBe(false);
  });

  it('loading arredonda e limita 0..100; rejeita string', () => {
    bridge.loading(42.6);
    bridge.loading(150);
    expect(bridge.loading('50')).toBe(false);
    expect(sent().map(([m]) => m.progress)).toEqual([43, 100]);
  });

  it('error corta em 200 caracteres', () => {
    bridge.error('x'.repeat(300));
    expect(sent()[0][0].message).toHaveLength(200);
  });

  it('spend valida amount inteiro > 0 e requestId', () => {
    expect(bridge.spend({ amount: -10, requestId: 'a' })).toBe(false);
    expect(bridge.spend({ amount: 1.5, requestId: 'a' })).toBe(false);
    expect(bridge.spend({ amount: 3000, requestId: '' })).toBe(false);
    expect(bridge.spend({ amount: 3000, requestId: 'req-1', motivo: 'Banquete' })).toBe(true);
    expect(sent()).toHaveLength(1);
    expect(sent()[0][0]).toEqual({ version: 1, type: 'enois:spend', amount: 3000, requestId: 'req-1', motivo: 'Banquete' });
  });

  it('share valida texto e imagem', () => {
    expect(bridge.share({ texto: '' })).toBe(false);
    expect(bridge.share({ texto: 'x'.repeat(601) })).toBe(false);
    expect(bridge.share({ texto: 'oi', imagem: 'data:image/svg+xml;base64,AAAA' })).toBe(false);
    expect(bridge.share({ texto: ' Nózito III completou 30 dias! ', imagem: 'data:image/png;base64,iVBORw0KGgo=' })).toBe(true);
    expect(sent()[0][0].texto).toBe('Nózito III completou 30 dias!');
  });
});

describe('recebimento', () => {
  it('identity resolve com token vindo do pai e da origem certa', async () => {
    const p = bridge.requestIdentity();
    expect(sent()[0][0].type).toBe('enois:identity');
    win.emit({ source: {}, origin: ENOIS_ORIGIN, data: { type: 'enois:identity', token: 'falso' } });
    win.emit({ source: win.parent, origin: 'https://evil.example', data: { type: 'enois:identity', token: 'falso' } });
    win.emit({ source: win.parent, origin: ENOIS_ORIGIN, data: { type: 'enois:identity', token: 'tok' } });
    await expect(p).resolves.toBe('tok');
  });

  it('identity resolve null no timeout', async () => {
    vi.useFakeTimers();
    const p = bridge.requestIdentity({ timeoutMs: 1000 });
    vi.advanceTimersByTime(1000);
    await expect(p).resolves.toBeNull();
    vi.useRealTimers();
  });

  it('pedidos simultâneos de identidade compartilham a mesma promessa', () => {
    const a = bridge.requestIdentity();
    const b = bridge.requestIdentity();
    expect(a).toBe(b);
    expect(sent()).toHaveLength(1);
  });

  it('spend:result (proposta) só chega com status válido', () => {
    const fn = vi.fn();
    bridge.onSpendResult(fn);
    win.emit({ source: win.parent, origin: ENOIS_ORIGIN, data: { type: 'enois:spend:result', requestId: 'r', status: 'hacked' } });
    win.emit({ source: win.parent, origin: ENOIS_ORIGIN, data: { type: 'enois:spend:result', requestId: 'r', status: 'paid' } });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith({ requestId: 'r', status: 'paid' });
  });

  it('destroy remove o listener', () => {
    bridge.destroy();
    expect(win.listeners.size).toBe(0);
  });
});

describe('origens', () => {
  it('produção ignora ?parent=', () => {
    expect([...resolveOrigins({ dev: false, search: '?parent=http://localhost:8080' })]).toEqual([ENOIS_ORIGIN]);
  });
  it('dev aceita ?parent= para testar com o front local', () => {
    expect(resolveOrigins({ dev: true, search: '?parent=http://localhost:8080/x' }).has('http://localhost:8080')).toBe(true);
  });
});
