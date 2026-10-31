-- Nózito · D1 (SQLite) · Sprint 0
-- Timestamps em ms (epoch). day_key = dia do jogo em America/Sao_Paulo (ver shared/rules.js).
-- Preço, saldo e morte são decididos no servidor; o cliente nunca escreve aqui direto.

-- D1 já aplica foreign keys por padrão.

-- Conta do jogador. player_ref vem do Énóis (POST /api/games/tokens/validate).
CREATE TABLE players (
  player_ref       TEXT    PRIMARY KEY CHECK (player_ref LIKE 'plr\_%' ESCAPE '\'),
  seeds            INTEGER NOT NULL DEFAULT 0 CHECK (seeds >= 0),
  streak_days      INTEGER NOT NULL DEFAULT 0 CHECK (streak_days >= 0),
  last_streak_day  INTEGER,
  created_at       INTEGER NOT NULL
);

-- Sessão própria do Nózito (token opaco em memória no front; só o hash fica aqui).
-- Cookie de terceiro no iframe não é confiável (Safari), por isso Bearer.
CREATE TABLE sessions (
  token_hash  TEXT    PRIMARY KEY,
  player_ref  TEXT    NOT NULL REFERENCES players(player_ref) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_sessions_player ON sessions(player_ref);

-- Linhagem: um corvo por geração.
CREATE TABLE crows (
  id           TEXT    PRIMARY KEY,
  player_ref   TEXT    NOT NULL REFERENCES players(player_ref) ON DELETE CASCADE,
  generation   INTEGER NOT NULL CHECK (generation >= 1),
  name         TEXT    NOT NULL,
  born_at      INTEGER NOT NULL,
  last_fed_at  INTEGER NOT NULL,
  deadline_at  INTEGER NOT NULL,
  mood         INTEGER NOT NULL CHECK (mood BETWEEN 0 AND 100),
  mood_at      INTEGER NOT NULL,
  last_pet_at  INTEGER,
  died_at      INTEGER,
  status       TEXT    NOT NULL CHECK (status IN ('ALIVE', 'DEAD', 'REVIVED')),
  UNIQUE (player_ref, generation),
  CHECK (deadline_at > last_fed_at),
  CHECK ((status = 'DEAD') = (died_at IS NOT NULL))
);
-- No máximo um Nózito vivo por conta.
CREATE UNIQUE INDEX uq_crows_one_living ON crows(player_ref) WHERE status IN ('ALIVE', 'REVIVED');
CREATE INDEX idx_crows_player_gen ON crows(player_ref, generation DESC);

-- Inventário é da CONTA (cosméticos sobrevivem à morte).
CREATE TABLE inventory (
  player_ref  TEXT    NOT NULL REFERENCES players(player_ref) ON DELETE CASCADE,
  item_id     TEXT    NOT NULL,
  qty         INTEGER NOT NULL CHECK (qty >= 0),
  PRIMARY KEY (player_ref, item_id)
);

-- O que o corvo está usando (vai para a lápide).
CREATE TABLE equipped (
  crow_id  TEXT NOT NULL REFERENCES crows(id) ON DELETE CASCADE,
  slot     TEXT NOT NULL CHECK (slot IN ('hat', 'nest', 'toy', 'wallpaper', 'scene')),
  item_id  TEXT NOT NULL,
  PRIMARY KEY (crow_id, slot)
);

-- Compras. request_id é gerado pelo SERVIDOR e reaproveitado no enois:spend (idempotência).
-- amount: Sementes em unidades; Faísca em milésimos (mesmo amount do protocolo Énóis).
CREATE TABLE purchases (
  request_id   TEXT    PRIMARY KEY,
  player_ref   TEXT    NOT NULL REFERENCES players(player_ref) ON DELETE CASCADE,
  item_id      TEXT    NOT NULL,
  currency     TEXT    NOT NULL CHECK (currency IN ('semente', 'faisca')),
  amount       INTEGER NOT NULL CHECK (amount > 0),
  status       TEXT    NOT NULL CHECK (status IN ('PENDING', 'PAID', 'DELIVERED', 'CANCELLED', 'FAILED')),
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_purchases_player ON purchases(player_ref, created_at DESC);
CREATE INDEX idx_purchases_pending ON purchases(status, created_at) WHERE status = 'PENDING';

-- Contadores diários (limite de refeições, teto de Sementes do minijogo).
CREATE TABLE daily (
  player_ref     TEXT    NOT NULL REFERENCES players(player_ref) ON DELETE CASCADE,
  day_key        INTEGER NOT NULL,
  meals          INTEGER NOT NULL DEFAULT 0 CHECK (meals BETWEEN 0 AND 3),
  seeds_earned   INTEGER NOT NULL DEFAULT 0 CHECK (seeds_earned >= 0),
  PRIMARY KEY (player_ref, day_key)
);

-- Log de ações (depuração e futuras conquistas). payload = JSON curto, sem dado pessoal.
CREATE TABLE events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  player_ref  TEXT    NOT NULL REFERENCES players(player_ref) ON DELETE CASCADE,
  crow_id     TEXT,
  kind        TEXT    NOT NULL CHECK (kind IN (
                'SUMMON', 'FEED', 'PET', 'MINIGAME', 'DIE', 'REVIVE',
                'BUY', 'EQUIP', 'UNEQUIP', 'SHARE')),
  payload     TEXT    CHECK (payload IS NULL OR json_valid(payload)),
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_events_player ON events(player_ref, created_at DESC);
