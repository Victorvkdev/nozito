// Tela inicial: liga estado do servidor, palco e UI. Quem decide é o servidor;
// aqui só se anima com shared/rules.js usando o relógio do servidor.
import catalog from '../../content/items.json';
import * as R from '../../shared/rules.js';
import * as api from '../net/api.js';
import { spriteDataURL } from '../art/render.js';
import { createStage } from '../render/stage.js';

const $ = (id) => document.getElementById(id);
const FOODS = catalog.items.filter((i) => i.type === 'food');

const ERRORS = {
  NO_SEEDS: 'Sementes insuficientes.',
  MEAL_LIMIT: 'Ele já comeu 3 vezes hoje. Volte amanhã!',
  CROW_DEAD: 'O Nózito não está mais aqui.',
  CROW_ALIVE: 'Seu Nózito ainda está vivo!',
  PAYMENT_UNAVAILABLE: 'Pagamento com Faísca chega em breve.',
  ALREADY_SUMMONED: 'O próximo Nózito já nasceu.',
  OFFLINE: 'Sem conexão. Tente de novo.',
};


export function startApp({ bridge }) {
  let state = null;
  let offset = 0; // serverNow - Date.now()
  let busy = false;
  let petPending = false;
  let refetching = false;

  const now = () => Date.now() + offset;

  const stage = createStage($('canvas'), $('stage'), {
    onTap: () => {
      if (!state || !R.isLiving(state.crow)) return;
      stage.play('tap');
      doPet();
    },
  });

  $('seedIcon').src = spriteDataURL('icon_seed', { scale: 2 });

  // ---------- toasts
  function toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    $('toasts').append(el);
    setTimeout(() => el.remove(), 2600);
  }
  const fail = (e) => toast(ERRORS[e?.code] ?? e?.message ?? 'Algo deu errado.', 'err');

  function apply(next) {
    state = next;
    offset = next.serverNow - Date.now();
    render();
  }

  // ---------- render
  function meter(el, level, colorFn) {
    if (el.children.length !== 10) el.replaceChildren(...Array.from({ length: 10 }, () => document.createElement('i')));
    [...el.children].forEach((seg, i) => {
      const on = i < level;
      seg.className = on ? 'on' : '';
      seg.style.setProperty('--seg', on ? colorFn(level) : '');
    });
    el.setAttribute('aria-valuenow', String(level));
  }

  function fmtLeft(ms) {
    const h = Math.max(0, ms) / R.HOUR;
    if (h >= 24) return `${Math.floor(h / 24)}d ${Math.floor(h % 24)}h`;
    if (h >= 1) return `${Math.floor(h)}h ${Math.floor((h % 1) * 60)}min`;
    return `${Math.max(1, Math.ceil(h * 60))}min`;
  }

  function render() {
    if (!state) return;
    const t = now();
    const crow = state.crow;
    const living = R.isLiving(crow) && t < crow.deadlineAt;
    const s = living ? R.hungerStage(crow, t) : 'morto';
    stage.setStage(s);

    if (R.isLiving(crow) && !living && !refetching) {
      refetching = true; // morreu agora: quem confirma é o servidor
      api.getState().then(apply).catch(() => {}).finally(() => (refetching = false));
    }

    $('crowName').textContent = crow.name;
    const age = R.ageDays(crow, t);
    $('crowAge').textContent = `${age} ${age === 1 ? 'dia' : 'dias'} de vida`;
    $('seeds').textContent = String(state.player.seeds);
    $('canvas').setAttribute('aria-label', `${crow.name}: ${{ feliz: 'feliz', com_fome: 'com fome', faminto: 'faminto', fraco: 'fraco', morto: 'descansando' }[s]}`);

    const frac = living ? R.hungerFraction(crow, t) : 1;
    const food = living ? Math.ceil((1 - frac) * 10) : 0;
    meter($('meterFood'), food, (l) => (l >= 6 ? '#7fae6e' : l >= 3 ? '#f5c542' : '#c2334a'));
    const mood = living ? R.currentMood(crow, t) : 0;
    meter($('meterMood'), Math.ceil(mood / 10), (l) => (l >= 6 ? '#7c4dff' : '#a78bfa'));

    const dl = $('deadline');
    if (living) {
      dl.textContent = `Precisa comer em até ${fmtLeft(crow.deadlineAt - t)}`;
      dl.classList.toggle('alert', frac >= 0.66);
    } else {
      dl.textContent = 'Descansa em paz.';
      dl.classList.remove('alert');
    }

    $('actionsAlive').hidden = !living;
    $('actionsDead').hidden = living;
    $('stageHint').hidden = !living;
    if (!living) {
      const next = R.crowName(crow.generation + 1);
      $('deadText').textContent = `${crow.name} viveu ${age} ${age === 1 ? 'dia' : 'dias'}. A linhagem continua.`;
      $('btnSummon').textContent = `Invocar ${next}`;
    }
    $('btnFeed').disabled = busy;
    $('btnSummon').disabled = busy;

    const graves = state.graves ?? [];
    $('gravesBox').hidden = graves.length === 0;
    $('graves').replaceChildren(
      ...graves.map((g) => {
        const li = document.createElement('li');
        li.textContent = `${g.name} · ${g.ageDays} ${g.ageDays === 1 ? 'dia' : 'dias'}`;
        return li;
      }),
    );
    if (!$('sheet').hidden) renderFoods();
  }

  // ---------- comidas
  function renderFoods() {
    const meals = state.daily.meals;
    const full = meals >= state.daily.mealsMax;
    $('mealsInfo').textContent = full
      ? 'Já comeu 3 vezes hoje. Volte amanhã!'
      : `Refeições hoje: ${meals}/${state.daily.mealsMax}`;
    $('foodList').replaceChildren(
      ...FOODS.map((item) => {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'food';
        const faisca = item.price.currency === 'faisca';
        const cant = faisca || full || busy || state.player.seeds < item.price.amount;
        b.disabled = cant;
        const img = document.createElement('img');
        img.src = spriteDataURL(item.sprite, { scale: 4 });
        img.alt = '';
        const txt = document.createElement('span');
        const name = document.createElement('span');
        name.className = 'food-name';
        name.textContent = item.name;
        const desc = document.createElement('span');
        desc.className = 'food-desc';
        desc.textContent = item.description;
        txt.append(name, desc);
        const price = document.createElement('span');
        price.className = `food-price ${item.price.currency}`;
        price.textContent = faisca ? 'em breve' : `${item.price.amount} Sementes`;
        b.setAttribute('aria-label', `${item.name}, ${price.textContent}. ${item.description}`);
        b.append(img, txt, price);
        b.addEventListener('click', () => doFeed(item));
        li.append(b);
        return li;
      }),
    );
  }

  function openSheet() {
    $('sheet').hidden = false;
    renderFoods();
    ($('foodList').querySelector('button:not(:disabled)') ?? $('sheetClose')).focus();
  }
  function closeSheet() {
    $('sheet').hidden = true;
    $('btnFeed').focus();
  }

  async function doFeed(item) {
    if (busy) return;
    busy = true;
    closeSheet();
    stage.play('eat');
    try {
      apply(await api.feed(item.id));
      stage.floatText('+Barriga');
    } catch (e) {
      fail(e);
    } finally {
      busy = false;
      render();
    }
  }

  async function doPet() {
    stage.play('pet');
    if (petPending) return;
    petPending = true;
    try {
      const r = await api.pet();
      apply(r);
      stage.floatText(r.gained ? '+Humor' : '♥');
    } catch (e) {
      fail(e);
    } finally {
      petPending = false;
    }
  }

  async function doSummon() {
    if (busy) return;
    busy = true;
    render();
    try {
      apply(await api.summon());
      stage.play('happy');
      toast(`${state.crow.name} nasceu!`, 'ok');
    } catch (e) {
      fail(e);
    } finally {
      busy = false;
      render();
    }
  }

  $('btnFeed').addEventListener('click', openSheet);
  $('btnPet').addEventListener('click', () => {
    stage.play('tap');
    doPet();
  });
  $('btnSummon').addEventListener('click', doSummon);
  $('sheetClose').addEventListener('click', closeSheet);
  $('sheet').addEventListener('click', (e) => {
    if (e.target === $('sheet')) closeSheet();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('sheet').hidden) closeSheet();
  });

  setInterval(render, 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') api.getState().then(apply).catch(() => {});
  });

  return { apply, toast };
}
