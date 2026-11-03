// Laboratório: simula o servidor na memória para ver as regras funcionando.
import catalog from '../content/items.json';
import * as R from '../shared/rules.js';
import { createBridge } from '../src/enois/bridge.js';

const $ = (id) => document.getElementById(id);
const items = Object.fromEntries(catalog.items.map((i) => [i.id, i]));
const bridge = createBridge();

// "Servidor" de mentira
let now = Date.now();
let seeds = 20;
let crow = R.summon(null, now, { id: crypto.randomUUID(), playerRef: 'plr_dev' });
const graves = [];
const daily = new Map(); // dayKey -> { meals, seeds }
const pending = new Map(); // requestId -> ação a executar quando pago
let hearts = [];

const today = () => {
  const k = R.dayKey(now);
  if (!daily.has(k)) daily.set(k, { meals: 0, seeds: 0 });
  return daily.get(k);
};

function say(text, kind = '') {
  const el = $('msg');
  el.textContent = text;
  el.className = `msg ${kind}`;
}

function log(text) {
  const li = document.createElement('li');
  li.textContent = text;
  $('log').prepend(li);
}

function tick() {
  const before = crow.status;
  crow = R.resolveCrow(crow, now);
  if (before !== R.STATUS.DEAD && crow.status === R.STATUS.DEAD) {
    graves.unshift({ name: crow.name, gen: crow.generation, age: R.ageDays(crow, now), diedAt: crow.diedAt });
    say(`${crow.name} morreu de fome.`, 'err');
  }
}

function run(fn, okText) {
  try {
    tick();
    fn();
    if (okText) say(okText, 'ok');
  } catch (e) {
    say(e instanceof R.RuleError ? e.message : 'Erro inesperado.', 'err');
    if (!(e instanceof R.RuleError)) console.error(e);
  }
  render();
}

const fmtH = (ms) => {
  const h = Math.max(0, ms) / R.HOUR;
  return h >= 24 ? `${Math.floor(h / 24)}d ${Math.floor(h % 24)}h` : `${h.toFixed(1)}h`;
};

const STAGE_LABEL = {
  feliz: 'Feliz', com_fome: 'Com fome', faminto: 'Faminto', fraco: 'Fraco', morto: 'Morto',
};

function render() {
  tick();
  const stage = R.hungerStage(crow, now);
  const living = R.isLiving(crow);
  const mood = living ? R.currentMood(crow, now) : 0;
  const frac = R.hungerFraction(crow, now);
  $('badge').textContent = `${crow.name} · ${STAGE_LABEL[stage]}`;
  $('clock').textContent = new Date(now).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const rows = [
    ['Geração', crow.generation],
    ['Status', crow.status],
    ['Fome', `${Math.round(frac * 100)}% do prazo`],
    ['Morre em', living ? fmtH(crow.deadlineAt - now) : '—'],
    ['Humor', living ? `${mood}/100` : '—'],
    ['Idade', `${R.ageDays(crow, now)} dia(s)`],
    ['Refeições hoje', `${today().meals}/${R.MAX_MEALS_PER_DAY}`],
    ['Sementes', `${seeds} (hoje +${today().seeds}/${R.MINIGAME_DAILY_SEED_CAP})`],
  ];
  if (crow.status === R.STATUS.DEAD) {
    const left = crow.diedAt + R.REVIVE_WINDOW_MS - now;
    rows.push(['Pedra vale por', left > 0 ? fmtH(left) : 'expirou']);
  }
  $('stats').replaceChildren(...rows.flatMap(([k, v]) => {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    return [dt, dd];
  }));
  const bar = $('hungerBar');
  bar.style.width = `${Math.round((1 - frac) * 100)}%`;
  bar.style.background = frac < 0.5 ? '#166534' : frac < 0.75 ? '#a16207' : '#9a3412';

  for (const b of document.querySelectorAll('[data-food], #pet, #game')) b.disabled = !living;
  $('summon').disabled = living;
  $('revive').disabled = !R.canRevive(crow, now);
  $('graves').replaceChildren(...graves.map((g) => {
    const li = document.createElement('li');
    li.textContent = `🪦 ${g.name} (geração ${g.gen}) · ${g.age} dia(s)`;
    return li;
  }));
}

// ---- Ações
document.querySelectorAll('[data-time]').forEach((b) =>
  b.addEventListener('click', () => {
    now += Number(b.dataset.time) * R.HOUR;
    render();
  }),
);

for (const food of catalog.items.filter((i) => i.type === 'food')) {
  const b = document.createElement('button');
  b.dataset.food = food.id;
  const cur = food.price.currency === 'faisca' ? 'Faíscas' : 'Sementes';
  b.textContent = `${food.name} (${food.price.amount} ${cur})`;
  b.addEventListener('click', () => buyFood(food));
  $('foods').append(b);
}

function buyFood(food) {
  if (food.price.currency === 'semente') {
    return run(() => {
      if (seeds < food.price.amount) throw new R.RuleError('NO_SEEDS', 'Sementes insuficientes.');
      crow = R.feed(crow, food, now, today().meals);
      today().meals += 1;
      seeds -= food.price.amount;
    }, `${crow.name} comeu ${food.name}.`);
  }
  requestFaisca(food, () => run(() => {
    crow = R.feed(crow, food, now, today().meals);
    today().meals += 1;
  }, `${crow.name} comeu ${food.name}.`));
}

// Faísca: pede pelo Énóis; só aplica quando chegar "paid" (no servidor real: depois de conferir o débito).
function requestFaisca(item, onPaid) {
  const requestId = crypto.randomUUID();
  const amount = R.protocolAmount(item.price);
  if (!bridge.embedded) {
    say('Faísca só funciona dentro do Énóis. Abra dev/enois.html.', 'err');
    return;
  }
  pending.set(requestId, onPaid);
  bridge.spend({ amount, requestId, motivo: item.name });
  log(`→ enois:spend ${amount} (${item.name})`);
  say('Confirme no Énóis…');
}

bridge.onSpendResult(({ requestId, status }) => {
  log(`← enois:spend:result ${status}`);
  const fn = pending.get(requestId);
  pending.delete(requestId);
  if (status === 'paid' && fn) fn();
  else if (fn) { say(status === 'cancelled' ? 'Compra cancelada.' : 'Pagamento falhou.', 'err'); render(); }
});

$('pet').addEventListener('click', () => run(() => {
  const r = R.pet(crow, now);
  crow = r.crow;
  hearts.push({ t: performance.now() });
  say(r.gained ? 'Carinho! +humor' : 'Ele gostou, mas humor só sobe 1x por hora.', r.gained ? 'ok' : '');
}));

$('game').addEventListener('click', () => run(() => {
  const score = 30 + Math.floor(Math.random() * 30);
  const got = R.minigameReward(score, R.currentMood(crow, now), today().seeds);
  crow = R.playMinigame(crow, now);
  today().seeds += got;
  seeds += got;
  say(`Caça ao Brilho: ${score} pontos, +${got} Sementes.`, 'ok');
}));

$('summon').addEventListener('click', () => run(() => {
  crow = R.summon(crow, now, { id: crypto.randomUUID(), playerRef: 'plr_dev' });
}, 'Um novo Nózito nasceu!'));

$('revive').addEventListener('click', () =>
  requestFaisca(items.consumable_pedra_ressurreicao, () => run(() => {
    crow = R.revive(crow, now);
    graves.shift();
  }, `${crow.name} voltou do submundo!`)),
);

$('identity').addEventListener('click', async () => {
  log('→ enois:identity');
  const token = await bridge.requestIdentity({ timeoutMs: 4000 });
  log(token ? `← token recebido (${token.length} caracteres)` : '← sem token (fora do Énóis ou deslogado)');
});

$('share').addEventListener('click', () => {
  const ok = bridge.share({
    texto: `${crow.name} está com ${R.ageDays(crow, now)} dia(s) de vida no Nózito!`,
    imagem: $('crow').toDataURL('image/png'),
  });
  log(ok ? '→ enois:share' : '(fora do Énóis: nada enviado)');
});

$('where').textContent = bridge.embedded
  ? `Dentro de um quadro. Origens: ${[...bridge.origins].join(', ')}`
  : 'Fora do Énóis. Para testar Faísca, identidade e share, abra /dev/enois.html.';

// ---- Desenho (placeholder até os sprites do Piskel)
const CROW = [
  '................',
  '.....kkkkk......',
  '....kkkkkkk.....',
  '...kkkwwkkkk....',
  '...kkkwpkkkkbb..',
  '...kkkkkkkkbbbb.',
  '...kkkkkkkkkbb..',
  '..kkkkkkkkkk....',
  '.kkkkgkkkkkk....',
  '.kkkgkkkkkkk....',
  '..kkkkkkkkkk....',
  '...kkkkkkkk.....',
  '....kkkkkk......',
  '.....f..f.......',
  '....ff..ff......',
  '................',
];
const GRAVE = [
  '................', '................', '.....ssssss.....', '....ssssssss....',
  '....sssddsss....', '....ssddddss....', '....sssddsss....', '....sssddsss....',
  '....ssssssss....', '....ssssssss....', '....ssssssss....', '....ssssssss....',
  '..gggggggggggg..', '.gggggggggggggg.', '................', '................',
];
const BODY = { feliz: '#2b2d42', com_fome: '#3a3a4f', faminto: '#4b4b5c', fraco: '#66667a' };
const ctx = $('crow').getContext('2d');

function draw(t) {
  const stage = R.hungerStage(crow, now);
  const dead = stage === 'morto';
  const speed = { feliz: 300, com_fome: 450, faminto: 700, fraco: 1200 }[stage] ?? 1;
  const bob = dead ? 0 : Math.round(Math.sin(t / speed) * (stage === 'fraco' ? 0.5 : 1));
  const pal = {
    k: BODY[stage], w: '#ffffff', p: '#000000', b: '#f59e0b', f: '#f59e0b', g: dead ? '#4d7c0f' : '#6b6b8a',
    s: '#9ca3af', d: '#4b5563',
  };
  ctx.clearRect(0, 0, 192, 192);
  const map = dead ? GRAVE : CROW;
  const S = 12;
  map.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    ctx.fillStyle = pal[ch];
    ctx.fillRect(x * S, (y + bob) * S, S, S);
  }));
  hearts = hearts.filter((h) => t - h.t < 900);
  for (const h of hearts) {
    const k = (t - h.t) / 900;
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = '#e11d48';
    ctx.fillRect(120, 30 - k * 30, 12, 12);
    ctx.fillRect(132, 30 - k * 30, 12, 12);
    ctx.fillRect(126, 42 - k * 30, 12, 12);
    ctx.globalAlpha = 1;
  }
  requestAnimationFrame(draw);
}

render();
requestAnimationFrame(draw);
bridge.ready();
