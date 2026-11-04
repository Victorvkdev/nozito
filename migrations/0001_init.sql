-- Nózito · D1 (SQLite)
-- Timestamps em ms (epoch). Preço, estoque e morte são decididos no servidor.
-- Sprint 2 reescreveu este arquivo (o banco ainda não estava no ar). A partir do deploy:
-- só migrations novas (0002_*.sql), nunca editar esta.

-- Conta do jogador. player_ref vem do Énóis (tokens/validate) ou é de convidado (plr_g…).
CREATE TABLE players (
  player_ref       TEXT    PRIMARY KEY CHECK (player_ref LIKE 'plr\_%' ESCAPE '\'),
  streak_days      INTEGER NOT NULL DEFAULT 0 CHECK (streak_days >= 0),
  last_streak_day  INTEGER,
  created_at       INTEGER NOT NULL
);

-- Sessão própria (Bearer). Só o hash do token fica aqui.
CREATE TABLE sessions (
  token_hash  TEXT    PRIMARY KEY,
  player_ref  TEXT    NOT NULL REFERENCES players(player_ref) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_sessions_player ON sessions(player_ref);

-- Linhagem: um corvo por geração. deadline_at = hora da morte se ninguém alimentar
-- (barriga vazia + 12h), recalculada a cada refeição.
CREATE TABLE crows (
  id           TEXT    PRIMARY KEY,
  player_ref   TEXT    NOT NULL REFERENCES players(player_ref) ON DELETE CASCADE,
  generation   INTEGER NOT NULL CHECK (generation >= 1),
  name         TEXT    NOT NULL,
  born_at      INTEGER NOT NULL,
  last_fed_at  INTEGER NOT NULL,
  belly        REAL    NOT NULL CHECK (belly BETWEEN 0 AND 100),
  belly_at     INTEGER NOT NULL,
  slow_until   INTEGER,
  deadline_at  INTEGER NOT NULL,
  mood         INTEGER NOT NULL CHECK (mood BETWEEN 0 AND 100),
  mood_at      INTEGER NOT NULL,
  last_pet_at  INTEGER,
  died_at      INTEGER,
  status       TEXT    NOT NULL CHECK (status IN ('ALIVE', 'DEAD', 'REVIVED')),
  UNIQUE (player_ref, generation),
  CHECK (deadline_at > belly_at),
  CHECK ((status = 'DEAD') = (died_at IS NOT NULL))
);
-- No máximo um Nózito vivo por conta.
CREATE UNIQUE INDEX uq_crows_one_living ON crows(player_ref) WHERE status IN ('ALIVE', 'REVIVED');
CREATE INDEX idx_crows_player_gen ON crows(player_ref, generation DESC);

-- Inventário da CONTA: comidas compradas, cosméticos e tesouros (qty 1). Sobrevive à morte.
CREATE TABLE inventory (
  player_ref  TEXT    NOT NULL REFERENCES players(player_ref) ON DELETE CASCADE,
  item_id     TEXT    NOT NULL,
  qty         INTEGER NOT NULL CHECK (qty >= 0),
  PRIMARY KEY (player_ref, item_id)
);

-- Comida fresca (Minhoca): cada leva estraga em `expires_at`. Come-se a leva mais antiga primeiro.
CREATE TABLE food_batches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  player_ref  TEXT    NOT NULL REFERENCES players(player_ref) ON DELETE CASCADE,
  item_id     TEXT    NOT NULL,
  qty         INTEGER NOT NULL CHECK (qty >= 0),
  expires_at  INTEGER NOT NULL
);
CREATE INDEX idx_batches_player ON food_batches(player_ref, item_id, expires_at);

-- O que o corvo está usando (vai para a lápide; o próximo da linhagem herda).
CREATE TABLE equipped (
  crow_id  TEXT NOT NULL REFERENCES crows(id) ON DELETE CASCADE,
  slot     TEXT NOT NULL CHECK (slot IN ('hat', 'glasses', 'cape', 'nest', 'toy', 'wallpaper', 'scene')),
  item_id  TEXT NOT NULL,
  PRIMARY KEY (crow_id, slot)
);

-- Rodadas de minijogo: o servidor marca o início; o fim só vale dentro do tempo.
CREATE TABLE rounds (
  id           TEXT    PRIMARY KEY,
  player_ref   TEXT    NOT NULL REFERENCES players(player_ref) ON DELETE CASCADE,
  game         TEXT    NOT NULL CHECK (game IN ('cata_minhoca', 'caca_brilho')),
  started_at   INTEGER NOT NULL,
  finished_at  INTEGER,
  score        INTEGER CHECK (score IS NULL OR score >= 0)
);
CREATE INDEX idx_rounds_player ON rounds(player_ref, started_at DESC);

-- Compras com Faísca. request_id gerado pelo SERVIDOR e reaproveitado no enois:spend.
-- amount em milésimos de Faísca (mesmo amount do protocolo Énóis).
CREATE TABLE purchases (
  request_id   TEXT    PRIMARY KEY,
  player_ref   TEXT    NOT NULL REFERENCES players(player_ref) ON DELETE CASCADE,
  item_id      TEXT    NOT NULL,
  currency     TEXT    NOT NULL CHECK (currency = 'faisca'),
  amount       INTEGER NOT NULL CHECK (amount > 0),
  status       TEXT    NOT NULL CHECK (status IN ('PENDING', 'PAID', 'DELIVERED', 'CANCELLED', 'FAILED')),
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_purchases_player ON purchases(player_ref, created_at DESC);

-- Log de ações (depuração e futuras conquistas). payload = JSON curto, sem dado pessoal.
CREATE TABLE events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  player_ref  TEXT    NOT NULL REFERENCES players(player_ref) ON DELETE CASCADE,
  crow_id     TEXT,
  kind        TEXT    NOT NULL CHECK (kind IN (
                'SUMMON', 'FEED', 'PET', 'MINIGAME', 'DIE', 'REVIVE',
                'BUY', 'EQUIP', 'UNEQUIP', 'SHARE', 'GRANT')),
  payload     TEXT    CHECK (payload IS NULL OR json_valid(payload)),
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_events_player ON events(player_ref, created_at DESC);
