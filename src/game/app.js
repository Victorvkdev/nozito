// Telas do jogo: ninho, minijogos e loja. Quem decide é o servidor; aqui só se anima
// com shared/rules.js usando o relógio do servidor.
import catalog from '../../content/items.json';
import * as R from '../../shared/rules.js';
import * as api from '../net/api.js';
import { spriteDataURL } from '../art/render.js';
import { createStage } from '../render/stage.js';
import { createMinigameScreen } from '../minigames/screen.js';
import { createCataMinhoca } from '../minigames/cata-minhoca.js';
import { createCacaBrilho, starsFor } from '../minigames/caca-brilho.js';

const $ = (id) => document.getElementById(id);
const ITEMS = Object.fromEntries(catalog.items.map((i) => [i.id, i]));
const FOODS = catalog.items.filter((i) => i.type === 'food');
const TREASURES = catalog.items.filter((i) => i.type === 'treasure');
const RARITY = { comum: 'comum', raro: 'raro', lendario: 'lendário' };

const ERRORS = {
  NO_FOOD: 'Acabou essa comida.',
  BELLY_FULL: 'Está de barriga cheia!',
  CROW_DEAD: 'O Nózito não está mais aqui.',
  CROW_ALIVE: 'Seu Nózito ainda está vivo!',
  PAYMENT_UNAVAILABLE: 'Compras com Faísca chegam em breve.',
  ALREADY_SUMMONED: 'O próximo Nózito já nasceu.',
  NO_STONE: 'Você não tem a Pedra da Ressurreição.',
  REVIVE_EXPIRED: 'A Pedra só funciona até 7 dias depois da morte.',
  ROUND_EXPIRED: 'A rodada expirou. Jogue de novo!',
  OFFLINE: 'Sem conexão. Tente de novo.',
};

const SHOP_SECTIONS = [
  ['food', 'Comidas'],
  ['hat', 'Chapéus'],
  ['glasses', 'Óculos'],
  ['cape', 'Capas'],
  ['nest', 'Ninhos'],
  ['wallpaper', 'Céus'],
  ['consumable', 'Especiais'],
];

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function fmtLeft(ms) {
  const h = Math.max(0, ms) / R.HOUR;
  if (h >= 24) return `${Math.floor(h / 24)}d ${Math.floor(h % 24)}h`;
  if (h >= 1) return `${Math.floor(h)}h ${Math.floor((h % 1) * 60)}min`;
  return `${Math.max(1, Math.ceil(h * 60))}min`;
}

function effectLine(item) {
  const fx = item.effects ?? {};
  const parts = [];
  if (fx.belly) parts.push(`+${fx.belly} barriga`);
  if (fx.mood) parts.push(`+${fx.mood} humor`);
  if (fx.slowDigestionHours) parts.push(`digestão lenta ${fx.slowDigestionHours}h`);
  return parts.join(' · ');
}

export function startApp({ bridge }) {
  let state = null;
  let offset = 0;
  let busy = false;
  let petPending = false;
  let refetching = false;
  let screen = 'ninho';

  const now = () => Date.now() + offset;
  const qty = (id) => state?.inventory?.[id] ?? 0;

  const stage = createStage($('canvas'), $('stage'), {
    items: ITEMS,
    onTap: () => {
      if (!state || !R.isLiving(state.crow) || screen !== 'ninho') return;
      stage.play('tap');
      doPet();
    },
  });

  $('wormIcon').src = spriteDataURL('food_minhoca', { scale: 2 });

  function toast(text, kind = '') {
    const t = el('div', `toast ${kind}`, text);
    $('toasts').append(t);
    setTimeout(() => t.remove(), 2600);
  }
  const fail = (e) => toast(ERRORS[e?.code] ?? e?.message ?? 'Algo deu errado.', 'err');

  function apply(next) {
    state = next;
    offset = next.serverNow - Date.now();
    render();
  }

  // ---------- navegação
  const minigames = {
    minhoca: createMinigameScreen($('screen-minhoca'), createCataMinhoca(), {
      onResult,
      onError: fail,
      onHome: () => {
        go('ninho');
        openSheet();
      },
    }),
    brilho: createMinigameScreen($('screen-brilho'), createCacaBrilho(), {
      onResult,
      onError: fail,
      onHome: () => go('ninho'),
    }),
  };

  function onResult(game, res) {
    apply(res.state);
    const r = res.reward;
    const parts = [];
    if (game === 'cata_minhoca') {
      if (r.gained > 0) parts.push(`+${plural(r.gained, 'minhoca', 'minhocas')} fresquinhas.`);
      else if (r.full) parts.push('Já tem 10 minhocas guardadas. Alimente o Nózito primeiro.');
      else parts.push('Cate 3 para ganhar 1 minhoca.');
      if (r.bonus) parts.push('Nózito feliz: +1 de bônus!');
    } else {
      const stars = starsFor(res.score);
      parts.push(`${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`);
      if (r.treasure) parts.push(`Achou um tesouro: ${ITEMS[r.treasure].name}!`);
      else if (res.score < R.TREASURE_MIN_SCORE) parts.push('Faça 10 pontos para ter chance de achar um tesouro.');
      else parts.push('Nenhum tesouro desta vez.');
      if (r.mood) parts.push('O Nózito adorou brincar!');
    }
    return parts.join(' ');
  }

  function go(name) {
    if (name === screen) return;
    if (minigames[screen]) minigames[screen].hide();
    screen = name;
    for (const s of ['ninho', 'minhoca', 'brilho', 'loja']) $(`screen-${s}`).hidden = s !== name;
    for (const b of document.querySelectorAll('.tab')) {
      if (b.dataset.screen === name) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
    if (name === 'ninho') stage.resume();
    else stage.pause();
    if (minigames[name]) minigames[name].show();
    if (name === 'loja') renderShop();
    render();
    window.scrollTo(0, 0);
  }
  for (const b of document.querySelectorAll('.tab')) b.addEventListener('click', () => go(b.dataset.screen));

  // ---------- ninho
  function meter(node, level, colorFn) {
    if (node.children.length !== 10) node.replaceChildren(...Array.from({ length: 10 }, () => el('i')));
    [...node.children].forEach((seg, i) => {
      const on = i < level;
      seg.className = on ? 'on' : '';
      seg.style.setProperty('--seg', on ? colorFn(level) : '');
    });
    node.setAttribute('aria-valuenow', String(level));
  }

  function render() {
    if (!state) return;
    const t = now();
    const crow = state.crow;
    const living = R.isLiving(crow) && t < crow.deadlineAt;
    const s = living ? R.hungerStage(crow, t) : 'morto';
    stage.setStage(s);
    stage.setEquipped(state.equipped);
    stage.setTreasures(TREASURES.filter((t) => qty(t.id) > 0).map((t) => t.id));

    if (R.isLiving(crow) && !living && !refetching) {
      refetching = true;
      api.getState().then(apply).catch(() => {}).finally(() => (refetching = false));
    }

    $('crowName').textContent = crow.name;
    $('crowAge').textContent = `${plural(R.ageDays(crow, t), 'dia', 'dias')} de vida`;
    $('wormCount').textContent = String(qty('food_minhoca'));
    $('canvas').setAttribute(
      'aria-label',
      `${crow.name}: ${{ feliz: 'feliz', com_fome: 'com fome', faminto: 'faminto', fraco: 'fraco', morto: 'descansando' }[s]}`,
    );

    const belly = living ? R.currentBelly(crow, t) : 0;
    meter($('meterFood'), Math.ceil(belly / 10), (l) => (l >= 6 ? '#7fae6e' : l >= 3 ? '#f5c542' : '#c2334a'));
    const mood = living ? R.currentMood(crow, t) : 0;
    meter($('meterMood'), Math.ceil(mood / 10), (l) => (l >= 6 ? '#7c4dff' : '#a78bfa'));

    const dl = $('deadline');
    if (!living) {
      dl.textContent = 'Descansa em paz.';
      dl.classList.remove('alert');
    } else if (belly > 0) {
      dl.textContent = `Barriga vazia em ${fmtLeft(R.emptyAt(crow) - t)}`;
      dl.classList.toggle('alert', belly < 30);
    } else {
      dl.textContent = `Fraco de fome! Alimente em até ${fmtLeft(crow.deadlineAt - t)}`;
      dl.classList.add('alert');
    }
    $('happyTag').hidden = !(living && mood >= R.HAPPY_MOOD);
    const slow = living && crow.slowUntil && crow.slowUntil > t;
    $('slowTag').hidden = !slow;
    if (slow) $('slowTag').textContent = `Sopa quentinha: digestão lenta por mais ${fmtLeft(crow.slowUntil - t)}`;

    $('actionsAlive').hidden = !living;
    $('actionsDead').hidden = living;
    $('stageHint').hidden = !living;
    if (!living) {
      $('deadText').textContent = `${crow.name} viveu ${plural(R.ageDays(crow, t), 'dia', 'dias')}. A linhagem continua.`;
      $('btnSummon').textContent = `Invocar ${R.crowName(crow.generation + 1)}`;
      $('btnShare').hidden = false;
      const hasStone = qty('consumable_pedra_ressurreicao') > 0;
      const canStone = R.canRevive(crow, t);
      $('btnRevive').hidden = !(hasStone && canStone);
      $('reviveHint').hidden = hasStone && canStone;
      $('reviveHint').textContent = canStone
        ? 'Pedra da Ressurreição: em breve na loja'
        : 'A Pedra só funciona até 7 dias depois da morte.';
    }
    $('btnFeed').disabled = busy;
    $('btnSummon').disabled = busy;
    $('btnRevive').disabled = busy;

    const graves = state.graves ?? [];
    $('gravesBox').hidden = graves.length === 0;
    $('graves').replaceChildren(...graves.map((g) => el('li', '', `${g.name} · ${plural(g.ageDays, 'dia', 'dias')}`)));

    document.querySelector('#screen-minhoca .mg-stock').textContent =
      `Minhocas no estoque: ${qty('food_minhoca')}/${R.STOCK_MAX.food_minhoca}`;
    const found = TREASURES.filter((t) => qty(t.id) > 0).length;
    document.querySelector('#screen-brilho .mg-stock').textContent = `Tesouros: ${found}/${TREASURES.length}`;
    if (screen === 'brilho') renderCollection();

    if (!$('sheet').hidden) renderPantry();
  }

  // ---------- coleção
  let collectionKey = '';
  function renderCollection() {
    const key = TREASURES.map((t) => qty(t.id)).join();
    if (key === collectionKey) return;
    collectionKey = key;
    $('collection').replaceChildren(
      ...TREASURES.map((t) => {
        const has = qty(t.id) > 0;
        const li = el('li', `col-item${has ? ' has' : ''}`);
        const img = el('img');
        img.src = spriteDataURL(has ? t.sprite : 'treasure_unknown', { scale: 4 });
        img.alt = '';
        li.append(img, el('span', '', has ? t.name : '???'), el('span', `rar ${t.rarity}`, RARITY[t.rarity]));
        if (has) li.title = t.description;
        return li;
      }),
    );
  }

  // ---------- despensa
  function renderPantry() {
    const t = now();
    const full = R.isLiving(state.crow) && R.currentBelly(state.crow, t) >= R.BELLY_FULL;
    const owned = FOODS.filter((f) => qty(f.id) > 0);
    $('sheetInfo').textContent = full
      ? 'Está de barriga cheia! Volte daqui a pouco.'
      : owned.length
        ? 'Escolha o que ele vai comer.'
        : 'A despensa está vazia. Vá catar minhocas!';
    $('foodList').replaceChildren(
      ...owned.map((item) => {
        const b = el('button', 'food');
        b.type = 'button';
        b.disabled = full || busy;
        const img = el('img');
        img.src = spriteDataURL(item.sprite, { scale: 4 });
        img.alt = '';
        const txt = el('span');
        txt.append(el('span', 'food-name', item.name), el('span', 'food-desc', effectLine(item)));
        const batches = state.fresh?.[item.id];
        if (batches?.length) {
          const first = batches[0];
          txt.append(el('span', 'food-desc warn', `${first.qty} ${first.qty === 1 ? 'estraga' : 'estragam'} em ${fmtLeft(first.expiresAt - t)}`));
        }
        const q = el('span', 'food-qty', `×${qty(item.id)}`);
        b.setAttribute('aria-label', `${item.name}, ${qty(item.id)} no estoque. ${effectLine(item)}`);
        b.append(img, txt, q);
        b.addEventListener('click', () => doFeed(item));
        const li = el('li');
        li.append(b);
        return li;
      }),
    );
  }

  function openSheet() {
    $('sheet').hidden = false;
    renderPantry();
    ($('foodList').querySelector('button:not(:disabled)') ?? $('sheetClose')).focus();
  }
  function closeSheet(focusBack = true) {
    $('sheet').hidden = true;
    if (focusBack && screen === 'ninho') $('btnFeed').focus();
  }

  async function doFeed(item) {
    if (busy) return;
    busy = true;
    closeSheet();
    stage.play('eat');
    try {
      apply(await api.feed(item.id));
      stage.floatText(`+${item.effects.belly} barriga`);
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
      stage.floatText(r.gained ? '+humor' : '♥');
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

  async function doRevive() {
    if (busy) return;
    busy = true;
    render();
    try {
      apply(await api.revive());
      stage.play('happy');
      toast(`${state.crow.name} voltou!`, 'ok');
    } catch (e) {
      fail(e);
    } finally {
      busy = false;
      render();
    }
  }

  function doShare() {
    const c = state.crow;
    const texto = `${c.name} viveu ${plural(R.ageDays(c, now()), 'dia', 'dias')} no Nózito. Venha cuidar do seu corvinho!`;
    if (!bridge.share({ texto })) toast('Abra o Nózito dentro do Énóis para compartilhar.', 'err');
  }

  // ---------- loja
  function renderShop() {
    if (!state) return;
    const sections = SHOP_SECTIONS.map(([type, title]) => {
      const list = catalog.items.filter((i) => i.type === type && i.price);
      if (!list.length) return null;
      const sec = el('section', 'shop-sec');
      sec.append(el('h3', '', title));
      const ul = el('ul', 'shop-grid');
      for (const item of list) {
        const owned = qty(item.id) > 0;
        const worn = item.slot && state.equipped?.[item.slot] === item.id;
        const li = el('li', `card${worn ? ' on' : ''}`);
        const art = el('div', 'card-art');
        const img = el('img');
        const info = spriteDataURL(item.sprite, { scale: item.type === 'nest' ? 2 : 4 });
        img.src = info;
        img.alt = '';
        art.append(img);
        li.append(art, el('span', 'card-name', item.name), el('span', 'card-desc', item.type === 'food' ? effectLine(item) : item.description));
        li.append(el('span', 'card-price', plural(item.price.amount, 'Faísca', 'Faíscas')));
        let btn;
        if (item.slot && owned) {
          btn = el('button', `btn ${worn ? 'btn-ghost' : 'btn-violet'}`, worn ? 'Tirar' : 'Usar');
          btn.addEventListener('click', () => doEquip(item.slot, worn ? null : item.id));
          btn.disabled = !R.isLiving(state.crow);
        } else {
          btn = el('button', 'btn btn-gold', owned ? `Você tem ${qty(item.id)}` : 'Em breve');
          btn.disabled = true;
        }
        btn.type = 'button';
        li.append(btn);
        ul.append(li);
      }
      sec.append(ul);
      return sec;
    }).filter(Boolean);
    $('shop').replaceChildren(...sections);
  }

  async function doEquip(slot, itemId) {
    try {
      apply(await api.equip(slot, itemId));
      renderShop();
      toast(itemId ? `${ITEMS[itemId].name}: no Nózito!` : 'Guardado.', 'ok');
    } catch (e) {
      fail(e);
    }
  }

  // laboratório local: o servidor só aceita em localhost com ENOIS_DEV_FAKE
  if (['localhost', '127.0.0.1'].includes(location.hostname)) {
    $('devGrant').hidden = false;
    $('devGrant').addEventListener('click', async () => {
      try {
        apply(await api.devGrant(catalog.items.filter((i) => i.price && i.type !== 'consumable').map((i) => i.id)));
        renderShop();
        toast('Itens de teste no inventário.', 'ok');
      } catch (e) {
        fail(e);
      }
    });
  }

  // ---------- eventos
  $('btnFeed').addEventListener('click', openSheet);
  $('btnPet').addEventListener('click', () => {
    stage.play('tap');
    doPet();
  });
  $('btnSummon').addEventListener('click', doSummon);
  $('btnRevive').addEventListener('click', doRevive);
  $('btnShare').addEventListener('click', doShare);
  $('sheetClose').addEventListener('click', () => closeSheet());
  $('goWorms').addEventListener('click', () => {
    closeSheet(false);
    go('minhoca');
  });
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

  $('screen-ninho').hidden = false;
  document.querySelector('.tab[data-screen="ninho"]').setAttribute('aria-current', 'page');
  void bridge;
  return { apply, toast };
}
