// Boot: identidade (Énóis ou convidado) → estado → tela. Fala o protocolo enois:* em cada etapa.
import '@fontsource/pixelify-sans/600.css';
import '@fontsource/pixelify-sans/700.css';
import '@fontsource/vt323/400.css';
import './ui/style.css';
import { createBridge } from './enois/bridge.js';
import * as api from './net/api.js';
import { startApp } from './game/app.js';

const bridge = createBridge();
const $ = (id) => document.getElementById(id);

function progress(p, msg) {
  bridge.loading(p);
  $('loadbar').style.width = `${p}%`;
  if (msg) $('loadmsg').textContent = msg;
}

async function login() {
  if (bridge.embedded) {
    const token = await bridge.requestIdentity({ timeoutMs: 6000 });
    if (token) {
      try {
        return await api.loginWithEnois(token);
      } catch (e) {
        console.warn('nozito: login Énóis falhou, seguindo como convidado', e.code);
      }
    }
  }
  if (api.loadSavedSession()) {
    try {
      await api.getState();
      return { mode: 'saved' };
    } catch (e) {
      if (e.status !== 401) throw e;
      api.clearSession();
    }
  }
  return api.loginAsGuest();
}

const fontsReady = () =>
  Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 2500))]);

let app = null;

async function boot() {
  $('retry').hidden = true;
  try {
    progress(10, 'Chocando o ovo…');
    await login();
    progress(55, 'Arrumando o ninho…');
    const [state] = await Promise.all([api.getState(), fontsReady()]);
    progress(90);
    $('loading').hidden = true;
    $('game').hidden = false;
    if (!app) app = startApp({ bridge });
    app.apply(state);
    requestAnimationFrame(() => {
      progress(100);
      bridge.ready();
    });
  } catch (e) {
    const msg = e?.message || 'Não deu para carregar o Nózito.';
    $('loadmsg').textContent = msg;
    $('retry').hidden = false;
    bridge.error(msg);
  }
}

$('retry').addEventListener('click', boot);
boot();
