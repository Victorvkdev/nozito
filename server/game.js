// Regras no servidor: lê/grava D1 usando shared/rules.js. Morte, estoque e recompensas são decididos aqui.
import catalog from '../content/items.json';
import * as R from '../shared/rules.js';
import { HttpError } from './http.js';

export const ITEMS = Object.fromEntries(catalog.items.map((i) => [i.id, i]));
export const TREASURES = catalog.items.filter((i) => i.type === 'treasure');
const isFresh = (item) => Number.isFinite(item?.freshHours);
const SLOTS = new Set(['hat', 'glasses', 'cape', 'nest', 'wallpaper']);

const CROW_COLS =
  'id, player_ref, generation, name, born_at, last_fed_at, belly, belly_at, slow_until, deadline_at, mood, mood_at, last_pet_at, died_at, status';

export function rowToCrow(r) {
  return {
    id: r.id,
    playerRef: r.player_ref,
    generation: r.generation,
    name: r.name,
    bornAt: r.born_at,
    lastFedAt: r.last_fed_at,
    belly: r.belly,
    bellyAt: r.belly_at,
    slowUntil: r.slow_until ?? null,
    deadlineAt: r.deadline_at,
    mood: r.mood,
    moodAt: r.mood_at,
    lastPetAt: r.last_pet_at ?? null,
    diedAt: r.died_at ?? null,
    status: r.status,
  };
}

function insertCrow(db, c) {
  return db
    .prepare(`INSERT INTO crows (${CROW_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(c.id, c.playerRef, c.generation, c.name, c.bornAt, c.lastFedAt, c.belly, c.bellyAt, c.slowUntil,
      c.deadlineAt, c.mood, c.moodAt, c.lastPetAt, c.diedAt, c.status);
}

function event(db, playerRef, crowId, kind, payload, now) {
  return db
    .prepare('INSERT INTO events (player_ref, crow_id, kind, payload, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(playerRef, crowId, kind, payload ? JSON.stringify(payload) : null, now);
}

async function latestCrow(db, playerRef) {
  const r = await db
    .prepare(`SELECT ${CROW_COLS} FROM crows WHERE player_ref = ? ORDER BY generation DESC LIMIT 1`)
    .bind(playerRef)
    .first();
  return r ? rowToCrow(r) : null;
}

/** Corvo atual, aplicando nascimento (conta nova) e morte preguiçosa. */
export async function currentCrow(db, playerRef, now) {
  let crow = await latestCrow(db, playerRef);
  if (!crow) {
    crow = R.summon(null, now, { id: crypto.randomUUID(), playerRef });
    try {
      await db.batch([insertCrow(db, crow), event(db, playerRef, crow.id, 'SUMMON', { generation: 1 }, now)]);
    } catch {
      return latestCrow(db, playerRef);
    }
    return crow;
  }
  const resolved = R.resolveCrow(crow, now);
  if (resolved.status !== crow.status) {
    const upd = await db
      .prepare("UPDATE crows SET status = 'DEAD', died_at = ? WHERE id = ? AND status IN ('ALIVE', 'REVIVED')")
      .bind(resolved.diedAt, crow.id)
      .run();
    if (upd.meta?.changes) {
      await event(db, playerRef, crow.id, 'DIE', { ageDays: R.ageDays(resolved, now) }, now).run();
    }
  }
  return resolved;
}

async function inventoryOf(db, playerRef, now) {
  const rows = await db.prepare('SELECT item_id, qty FROM inventory WHERE player_ref = ? AND qty > 0').bind(playerRef).all();
  const inv = Object.fromEntries(rows.results.map((r) => [r.item_id, r.qty]));
  const fresh = {};
  const batches = await db
    .prepare('SELECT item_id, qty, expires_at FROM food_batches WHERE player_ref = ? AND qty > 0 AND expires_at > ? ORDER BY expires_at')
    .bind(playerRef, now)
    .all();
  for (const b of batches.results) {
    inv[b.item_id] = (inv[b.item_id] ?? 0) + b.qty;
    (fresh[b.item_id] ??= []).push({ qty: b.qty, expiresAt: b.expires_at });
  }
  return { inventory: inv, fresh };
}

/** Quanto tem de um item agora (comida fresca: só o que não estragou). */
async function stockOf(db, playerRef, itemId, now) {
  if (isFresh(ITEMS[itemId])) {
    return (
      (await db
        .prepare('SELECT COALESCE(SUM(qty), 0) AS n FROM food_batches WHERE player_ref = ? AND item_id = ? AND expires_at > ?')
        .bind(playerRef, itemId, now)
        .first('n')) ?? 0
    );
  }
  return qtyOf(db, playerRef, itemId);
}

async function equippedOf(db, crowId) {
  const rows = await db.prepare('SELECT slot, item_id FROM equipped WHERE crow_id = ?').bind(crowId).all();
  return Object.fromEntries(rows.results.map((r) => [r.slot, r.item_id]));
}

export async function getState(db, playerRef, now) {
  const crow = await currentCrow(db, playerRef, now);
  const player = await db.prepare('SELECT streak_days FROM players WHERE player_ref = ?').bind(playerRef).first();
  if (!player) throw new HttpError(401, 'NO_SESSION', 'Entre de novo.');
  const graves = await db
    .prepare(`SELECT ${CROW_COLS} FROM crows WHERE player_ref = ? AND status = 'DEAD' ORDER BY generation DESC LIMIT 20`)
    .bind(playerRef)
    .all();
  // limpeza preguiçosa do que estragou
  await db.prepare('DELETE FROM food_batches WHERE player_ref = ? AND (expires_at <= ? OR qty = 0)').bind(playerRef, now).run();
  const { inventory, fresh } = await inventoryOf(db, playerRef, now);
  return {
    serverNow: now,
    player: { streakDays: player.streak_days },
    crow,
    inventory,
    fresh,
    equipped: await equippedOf(db, crow.id),
    graves: graves.results.map((r) => {
      const c = rowToCrow(r);
      return { name: c.name, generation: c.generation, ageDays: R.ageDays(c, now), diedAt: c.diedAt };
    }),
  };
}

function requireItem(itemId) {
  if (typeof itemId !== 'string' || !Object.hasOwn(ITEMS, itemId)) {
    throw new HttpError(400, 'UNKNOWN_ITEM', 'Item desconhecido.');
  }
  return ITEMS[itemId];
}

async function qtyOf(db, playerRef, itemId) {
  return (await db.prepare('SELECT qty FROM inventory WHERE player_ref = ? AND item_id = ?').bind(playerRef, itemId).first('qty')) ?? 0;
}

/** Alimentar com um item do estoque (minhoca, petisco ou comida comprada). */
export async function feedCrow(db, playerRef, itemId, now) {
  const item = requireItem(itemId);
  if (item.type !== 'food') throw new HttpError(400, 'NOT_FOOD', 'Item não é comida.');
  let spend;
  if (isFresh(item)) {
    // a leva mais antiga que ainda não estragou
    const batch = await db
      .prepare('SELECT id FROM food_batches WHERE player_ref = ? AND item_id = ? AND qty > 0 AND expires_at > ? ORDER BY expires_at LIMIT 1')
      .bind(playerRef, itemId, now)
      .first();
    if (!batch) throw new HttpError(409, 'NO_FOOD', 'Acabou essa comida.');
    spend = db.prepare('UPDATE food_batches SET qty = qty - 1 WHERE id = ?').bind(batch.id);
  } else {
    if ((await qtyOf(db, playerRef, itemId)) < 1) throw new HttpError(409, 'NO_FOOD', 'Acabou essa comida.');
    spend = db.prepare('UPDATE inventory SET qty = qty - 1 WHERE player_ref = ? AND item_id = ?').bind(playerRef, itemId);
  }
  const crow = await currentCrow(db, playerRef, now);
  const fed = R.feed(crow, item, now); // RuleError: morto, barriga cheia
  try {
    await db.batch([
      // CHECK (qty >= 0) desfaz tudo se outro pedido gastou a última unidade.
      spend,
      db.prepare(
        "UPDATE crows SET last_fed_at = ?, belly = ?, belly_at = ?, slow_until = ?, deadline_at = ?, mood = ?, mood_at = ? WHERE id = ? AND status IN ('ALIVE', 'REVIVED')",
      ).bind(fed.lastFedAt, fed.belly, fed.bellyAt, fed.slowUntil, fed.deadlineAt, fed.mood, fed.moodAt, crow.id),
      event(db, playerRef, crow.id, 'FEED', { itemId }, now),
    ]);
  } catch (err) {
    if (String(err?.message ?? err).includes('qty')) throw new HttpError(409, 'NO_FOOD', 'Acabou essa comida.');
    throw err;
  }
}

export async function petCrow(db, playerRef, now) {
  const crow = await currentCrow(db, playerRef, now);
  const { crow: next, gained } = R.pet(crow, now);
  if (gained) {
    await db.batch([
      db.prepare('UPDATE crows SET mood = ?, mood_at = ?, last_pet_at = ? WHERE id = ?')
        .bind(next.mood, next.moodAt, next.lastPetAt, crow.id),
      event(db, playerRef, crow.id, 'PET', null, now),
    ]);
  }
  return gained;
}

export async function summonNext(db, playerRef, now) {
  const prev = await currentCrow(db, playerRef, now);
  const crow = R.summon(prev, now, { id: crypto.randomUUID(), playerRef }); // RuleError se vivo
  try {
    await db.batch([
      insertCrow(db, crow),
      // cosméticos são da conta: o próximo da linhagem nasce vestido igual
      db.prepare('INSERT INTO equipped (crow_id, slot, item_id) SELECT ?, slot, item_id FROM equipped WHERE crow_id = ?')
        .bind(crow.id, prev.id),
      event(db, playerRef, crow.id, 'SUMMON', { generation: crow.generation }, now),
    ]);
  } catch {
    throw new HttpError(409, 'ALREADY_SUMMONED', 'O próximo Nózito já nasceu.');
  }
  return crow;
}

/** Pedra da Ressurreição: gasta 1 da conta e revive o mesmo corvo (até 7 dias, sem geração nova). */
export async function reviveCrow(db, playerRef, now) {
  const stone = 'consumable_pedra_ressurreicao';
  const crow = await currentCrow(db, playerRef, now);
  if (crow.status !== R.STATUS.DEAD) throw new HttpError(409, 'CROW_ALIVE', 'O Nózito está vivo.');
  if (!R.canRevive(crow, now)) throw new HttpError(409, 'REVIVE_EXPIRED', 'A Pedra só funciona até 7 dias depois da morte.');
  if ((await qtyOf(db, playerRef, stone)) < 1) throw new HttpError(409, 'NO_STONE', 'Você não tem a Pedra da Ressurreição.');
  const next = R.revive(crow, now);
  try {
    await db.batch([
      // CHECK (qty >= 0) desfaz tudo se outro pedido gastou a última Pedra.
      db.prepare('UPDATE inventory SET qty = qty - 1 WHERE player_ref = ? AND item_id = ?').bind(playerRef, stone),
      db.prepare(
        "UPDATE crows SET status = 'REVIVED', died_at = NULL, belly = ?, belly_at = ?, last_fed_at = ?, slow_until = NULL, deadline_at = ?, mood = ?, mood_at = ? WHERE id = ? AND status = 'DEAD'",
      ).bind(next.belly, next.bellyAt, next.lastFedAt, next.deadlineAt, next.mood, next.moodAt, crow.id),
      event(db, playerRef, crow.id, 'REVIVE', null, now),
    ]);
  } catch (err) {
    if (String(err?.message ?? err).includes('qty')) throw new HttpError(409, 'NO_STONE', 'Você não tem a Pedra da Ressurreição.');
    throw err;
  }
  return next;
}

// ---------- Minijogos

const secureRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

export async function startRound(db, playerRef, game, now) {
  if (typeof game !== 'string' || !Object.hasOwn(R.MINIGAMES, game)) {
    throw new HttpError(400, 'UNKNOWN_GAME', 'Minijogo desconhecido.');
  }
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO rounds (id, player_ref, game, started_at) VALUES (?, ?, ?, ?)').bind(id, playerRef, game, now).run();
  return { roundId: id, game, durationMs: R.MINIGAMES[game].durationMs };
}

function stockUpsert(db, playerRef, itemId, qty) {
  return db
    .prepare('INSERT INTO inventory (player_ref, item_id, qty) VALUES (?, ?, ?) ON CONFLICT(player_ref, item_id) DO UPDATE SET qty = excluded.qty')
    .bind(playerRef, itemId, qty);
}

export async function finishRound(db, playerRef, roundId, rawScore, now, rand = secureRandom) {
  if (typeof roundId !== 'string' || roundId.length > 64) throw new HttpError(400, 'INVALID_ROUND', 'Rodada inválida.');
  const row = await db
    .prepare('SELECT id, game, started_at, finished_at FROM rounds WHERE id = ? AND player_ref = ?')
    .bind(roundId, playerRef)
    .first();
  if (!row) throw new HttpError(404, 'ROUND_NOT_FOUND', 'Rodada não encontrada.');
  const score = R.validateRound({ game: row.game, startedAt: row.started_at, finishedAt: row.finished_at }, rawScore, now);

  const close = await db
    .prepare('UPDATE rounds SET finished_at = ?, score = ? WHERE id = ? AND finished_at IS NULL')
    .bind(now, score, roundId)
    .run();
  if (!close.meta?.changes) throw new HttpError(409, 'ROUND_FINISHED', 'Rodada já encerrada.');

  const reward = { itemId: null, gained: 0, full: false, mood: false, bonus: false, treasure: null };
  const writes = [];
  const crow = await currentCrow(db, playerRef, now);
  const crowId = crow.id;
  const living = R.isLiving(crow);

  if (row.game === 'cata_minhoca') {
    const mood = living ? R.currentMood(crow, now) : 0;
    const amount = R.wormsForScore(score, mood);
    reward.bonus = amount > R.wormsForScore(score, 0);
    const current = await stockOf(db, playerRef, 'food_minhoca', now);
    const { gained } = R.addToStock('food_minhoca', current, amount);
    reward.itemId = 'food_minhoca';
    reward.gained = gained;
    reward.full = amount > gained;
    if (gained > 0) {
      writes.push(
        db.prepare('INSERT INTO food_batches (player_ref, item_id, qty, expires_at) VALUES (?, ?, ?, ?)')
          .bind(playerRef, 'food_minhoca', gained, now + ITEMS.food_minhoca.freshHours * R.HOUR),
      );
    }
  } else {
    if (living) {
      const next = R.playMinigame(crow, now);
      writes.push(db.prepare('UPDATE crows SET mood = ?, mood_at = ? WHERE id = ?').bind(next.mood, next.moodAt, crow.id));
      reward.mood = true;
    }
    const owned = await db
      .prepare("SELECT item_id FROM inventory WHERE player_ref = ? AND item_id LIKE 'treasure\\_%' ESCAPE '\\' AND qty > 0")
      .bind(playerRef)
      .all();
    const found = R.pickTreasure(TREASURES, new Set(owned.results.map((r) => r.item_id)), score, rand);
    if (found) {
      reward.treasure = found.id;
      writes.push(stockUpsert(db, playerRef, found.id, 1));
    }
  }
  writes.push(event(db, playerRef, crowId, 'MINIGAME', { game: row.game, score, gained: reward.gained, treasure: reward.treasure }, now));
  await db.batch(writes);
  return { score, reward };
}

// ---------- Cosméticos

export async function equip(db, playerRef, slot, itemId, now) {
  if (typeof slot !== 'string' || !SLOTS.has(slot)) throw new HttpError(400, 'INVALID_SLOT', 'Lugar inválido.');
  const crow = await currentCrow(db, playerRef, now);
  if (!R.isLiving(crow)) throw new HttpError(409, 'CROW_DEAD', 'O Nózito não está vivo.');
  if (itemId === null) {
    await db.batch([
      db.prepare('DELETE FROM equipped WHERE crow_id = ? AND slot = ?').bind(crow.id, slot),
      event(db, playerRef, crow.id, 'UNEQUIP', { slot }, now),
    ]);
    return;
  }
  const item = requireItem(itemId);
  if (item.slot !== slot) throw new HttpError(400, 'WRONG_SLOT', 'Esse item não vai aí.');
  if ((await qtyOf(db, playerRef, itemId)) < 1) throw new HttpError(403, 'NOT_OWNED', 'Você ainda não tem esse item.');
  await db.batch([
    db.prepare('INSERT INTO equipped (crow_id, slot, item_id) VALUES (?, ?, ?) ON CONFLICT(crow_id, slot) DO UPDATE SET item_id = excluded.item_id')
      .bind(crow.id, slot, itemId),
    event(db, playerRef, crow.id, 'EQUIP', { slot, itemId }, now),
  ]);
}

/** Só no laboratório local: dá itens para testar a loja antes do pagamento existir. */
export async function grantDev(db, playerRef, itemIds, now) {
  if (!Array.isArray(itemIds) || itemIds.length > 30) throw new HttpError(400, 'INVALID_ITEMS', 'Lista inválida.');
  const writes = [];
  for (const id of itemIds) {
    const item = requireItem(id);
    if (isFresh(item)) throw new HttpError(400, 'INVALID_ITEMS', 'Comida fresca vem do minijogo.');
    const add = item.type === 'food' ? 3 : 1;
    const current = await qtyOf(db, playerRef, id);
    const qty = item.type === 'food' || item.type === 'consumable' ? current + add : 1;
    writes.push(stockUpsert(db, playerRef, id, qty));
  }
  writes.push(event(db, playerRef, null, 'GRANT', { itemIds }, now));
  await db.batch(writes);
}
