// Ponte postMessage com o Énóis — protocolo v1 (enois-frontend/docs/jogos-integracao.md).
// Regras: origem explícita (nunca "*"), só aceita mensagens da janela pai e da origem do Énóis,
// nada de alert/confirm/popup/form. Mensagem inválida não é enviada (o Énóis descartaria).

export const PROTOCOL_VERSION = 1;
export const ENOIS_ORIGIN = 'https://enois.ia.br';
const MAX_ERROR_CHARS = 200;
const MAX_SHARE_CHARS = 600;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_RE = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/;

/**
 * Origens aceitas. Em DEV, `?parent=http://localhost:8080` acrescenta o front local do Énóis
 * (mesmo truque do jogo-de-teste.html). Em produção a lista é fixa.
 */
export function resolveOrigins({ dev = false, search = '' } = {}) {
  const origins = new Set([ENOIS_ORIGIN]);
  if (dev) {
    const parent = new URLSearchParams(search).get('parent');
    if (parent) {
      try {
        origins.add(new URL(parent).origin);
      } catch {
        /* parâmetro inválido: ignora */
      }
    }
  }
  return origins;
}

export function createBridge({ win = globalThis.window, origins } = {}) {
  const env = import.meta.env ?? {};
  const allowed = origins ?? resolveOrigins({ dev: Boolean(env.DEV), search: win?.location?.search ?? '' });
  const embedded = Boolean(win) && win.parent && win.parent !== win;

  let pendingIdentity = null; // { resolve, timer }
  const spendResultHandlers = new Set();

  function post(message) {
    if (!embedded) return false;
    const payload = { version: PROTOCOL_VERSION, ...message };
    for (const origin of allowed) win.parent.postMessage(payload, origin);
    return true;
  }

  function onMessage(event) {
    if (event.source !== win.parent || !allowed.has(event.origin)) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'enois:identity' && typeof data.token === 'string' && pendingIdentity) {
      const { resolve, timer } = pendingIdentity;
      pendingIdentity = null;
      clearTimeout(timer);
      resolve(data.token);
      return;
    }

    // PROPOSTA (issue no Énóis), ainda não existe no protocolo v1. Só repassa; quem entrega
    // item é o servidor do Nózito depois de conferir o débito no Énóis.
    if (
      data.type === 'enois:spend:result' &&
      typeof data.requestId === 'string' &&
      ['paid', 'cancelled', 'failed'].includes(data.status)
    ) {
      for (const fn of spendResultHandlers) fn({ requestId: data.requestId, status: data.status });
    }
  }

  if (win?.addEventListener) win.addEventListener('message', onMessage);

  return {
    embedded,
    origins: allowed,

    /** progress opcional, inteiro 0..100. */
    loading(progress) {
      if (progress === undefined) return post({ type: 'enois:loading' });
      if (typeof progress !== 'number' || !Number.isFinite(progress)) return false;
      return post({ type: 'enois:loading', progress: Math.min(100, Math.max(0, Math.round(progress))) });
    },

    ready() {
      return post({ type: 'enois:ready' });
    },

    error(message) {
      if (message === undefined) return post({ type: 'enois:error' });
      return post({ type: 'enois:error', message: String(message).slice(0, MAX_ERROR_CHARS) });
    },

    /**
     * Pede o token (uso único, 15 min). Resolve com a string, ou null se não vier
     * (fora do Énóis, jogador deslogado, ou tempo esgotado). O token vai para o NOSSO servidor.
     */
    requestIdentity({ timeoutMs = 8000 } = {}) {
      if (!embedded) return Promise.resolve(null);
      if (pendingIdentity) return pendingIdentity.promise;
      let resolve;
      const promise = new Promise((r) => (resolve = r));
      const timer = setTimeout(() => {
        pendingIdentity = null;
        resolve(null);
      }, timeoutMs);
      pendingIdentity = { resolve, timer, promise };
      post({ type: 'enois:identity' });
      return promise;
    },

    /**
     * Pede o gasto. amount e requestId vêm do SERVIDOR do Nózito (nunca do front).
     * amount em milésimos de Faísca (1 Faísca = 1000). Repetir o mesmo requestId é seguro.
     */
    spend({ amount, requestId, motivo } = {}) {
      if (!Number.isInteger(amount) || amount <= 0) return false;
      if (typeof requestId !== 'string' || !requestId.trim()) return false;
      const msg = { type: 'enois:spend', amount, requestId };
      if (typeof motivo === 'string' && motivo.trim()) msg.motivo = motivo.trim();
      return post(msg);
    },

    /** Abre a prévia de post no feed. Publica só com o clique da pessoa. */
    share({ texto, imagem } = {}) {
      if (typeof texto !== 'string') return false;
      const t = texto.trim();
      if (!t || t.length > MAX_SHARE_CHARS) return false;
      const msg = { type: 'enois:share', texto: t };
      if (imagem !== undefined) {
        const m = typeof imagem === 'string' ? IMAGE_RE.exec(imagem) : null;
        if (!m) return false;
        const bytes = Math.floor((m[2].length * 3) / 4);
        if (bytes > MAX_IMAGE_BYTES) return false;
        msg.imagem = imagem;
      }
      return post(msg);
    },

    /** PROPOSTA: escuta enois:spend:result. Devolve função para cancelar. */
    onSpendResult(fn) {
      spendResultHandlers.add(fn);
      return () => spendResultHandlers.delete(fn);
    },

    destroy() {
      if (win?.removeEventListener) win.removeEventListener('message', onMessage);
      if (pendingIdentity) {
        clearTimeout(pendingIdentity.timer);
        pendingIdentity.resolve(null);
        pendingIdentity = null;
      }
      spendResultHandlers.clear();
    },
  };
}
