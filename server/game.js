// Regras no servidor: lê/grava D1 usando shared/rules.js. Morte é aplicada aqui, nunca no cliente.
import catalog from '../content/items.json';
import * as R from '../shared/rules.js';
import { HttpError } from './http.js';

export const ITEMS = Object.fromEntries(catalog.items.map((i) => [i.id, i]));

const CROW_COLS =
  'id, player_ref, generation, name, born_at, last_fed_at, deadline_at, mood, mood_at, last_pet_at, died_at, status';

export function rowToCrow(r) {
  return {
    id: r.id,
    playerRef: r.player_ref,
    generation: r.generation,
    name: r.name,
    bornAt: r.born_at,
    lastFedAt: r.last_fed_at,
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
    .prepare(`INSERT INTO crows (${CROW_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(c.id, c.playerRef, c.generation, c.name, c.bornAt, c.lastFedAt, c.deadlineAt, c.mood, c.moodAt, c.lastPetAt, c.diedAt, c.status);
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

/** Carrega o corvo atual aplicando nascimento (conta nova) e morte preguiçosa. */
export async function currentCrow(db, playerRef, now) {
  let crow = await latestCrow(db, playerRef);
  if (!crow) {
    crow = R.summon(null, now, { id: crypto.randomUUID(), playerRef });
    try {
      await db.batch([insertCrow(db, crow), event(db, playerRef, crow.id, 'SUMMON', { generation: 1 }, now)]);
    } catch {
      return latestCrow(db, playerRef); // outro pedido criou ao mesmo tempo
    }
    return crow;
  }
  const resolved = R.resolveCrow(crow, now);
  if (resolved.status !== crow.status) {
    const upd = await db
      .prepare("UPDATE crows SET status = 'DEAD', died_at = ? WHERE id = ? AND status IN ('ALIVE', 'REVIVED')")
      .bind(resolved.diedAt, crow.id)
      .run();
    // Só quem de fato mudou o status registra o evento (evita DIE duplicado em pedidos simultâneos).
    if (upd.meta?.changes) {
      await event(db, playerRef, crow.id, 'DIE', { ageDays: R.ageDays(resolved, now) }, now).run();
    }
  }
  return resolved;
}

async function dailyRow(db, playerRef, now) {
  const r = await db
    .prepare('SELECT meals, seeds_earned FROM daily WHERE player_ref = ? AND day_key = ?')
    .bind(playerRef, R.dayKey(now))
    .first();
  return { meals: r?.meals ?? 0, seedsEarned: r?.seeds_earned ?? 0 };
}

export async function getState(db, playerRef, now) {
  const crow = await currentCrow(db, playerRef, now);
  const player = await db.prepare('SELECT seeds, streak_days FROM players WHERE player_ref = ?').bind(playerRef).first();
  if (!player) throw new HttpError(401, 'NO_SESSION', 'Entre de novo.');
  const daily = await dailyRow(db, playerRef, now);
  const graves = await db
    .prepare(`SELECT ${CROW_COLS} FROM crows WHERE player_ref = ? AND status = 'DEAD' ORDER BY generation DESC LIMIT 20`)
    .bind(playerRef)
    .all();
  return {
    serverNow: now,
    player: { seeds: player.seeds, streakDays: player.streak_days },
    crow,
    daily: { meals: daily.meals, mealsMax: R.MAX_MEALS_PER_DAY },
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

export async function feedCrow(db, playerRef, itemId, now) {
  const item = requireItem(itemId);
  if (item.type !== 'food') throw new HttpError(400, 'NOT_FOOD', 'Item não é comida.');
  if (item.price.currency !== 'semente') {
    throw new HttpError(409, 'PAYMENT_UNAVAILABLE', 'Pagamento com Faísca chega em breve.');
  }
  const crow = await currentCrow(db, playerRef, now);
  const { meals } = await dailyRow(db, playerRef, now);
  const fed = R.feed(crow, item, now, meals); // lança RuleError (morto, limite)
  const cost = item.price.amount;
  try {
    await db.batch([
      // CHECK (seeds >= 0) e CHECK (meals <= 3) desfazem tudo se outro pedido passou na frente.
      db.prepare('UPDATE players SET seeds = seeds - ? WHERE player_ref = ?').bind(cost, playerRef),
      db.prepare(
        'INSERT INTO daily (player_ref, day_key, meals) VALUES (?, ?, 1) ON CONFLICT(player_ref, day_key) DO UPDATE SET meals = meals + 1',
      ).bind(playerRef, R.dayKey(now)),
      db.prepare(
        "UPDATE crows SET last_fed_at = ?, deadline_at = ?, mood = ?, mood_at = ? WHERE id = ? AND status IN ('ALIVE', 'REVIVED')",
      ).bind(fed.lastFedAt, fed.deadlineAt, fed.mood, fed.moodAt, crow.id),
      event(db, playerRef, crow.id, 'FEED', { itemId, cost }, now),
    ]);
  } catch (err) {
    const msg = String(err?.message ?? err);
    if (msg.includes('seeds')) throw new HttpError(409, 'NO_SEEDS', 'Sementes insuficientes.');
    if (msg.includes('meals')) throw new HttpError(409, 'MEAL_LIMIT', 'Já comeu 3 vezes hoje.');
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
    await db.batch([insertCrow(db, crow), event(db, playerRef, crow.id, 'SUMMON', { generation: crow.generation }, now)]);
  } catch {
    throw new HttpError(409, 'ALREADY_SUMMONED', 'O próximo Nózito já nasceu.');
  }
  return crow;
}
