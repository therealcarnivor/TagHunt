import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, 'taghunt.db'));

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    avatar TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    points INTEGER NOT NULL DEFAULT 1,
    clue TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS finds (
    player_id TEXT NOT NULL REFERENCES players(id),
    tag_id TEXT NOT NULL REFERENCES tags(id),
    found_at TEXT NOT NULL DEFAULT (datetime('now')),
    clues_used INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (player_id, tag_id)
  );

  CREATE TABLE IF NOT EXISTS player_hints (
    player_id TEXT NOT NULL REFERENCES players(id),
    tag_id TEXT NOT NULL REFERENCES tags(id),
    stage INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (player_id, tag_id)
  );

  CREATE TABLE IF NOT EXISTS hint_uses (
    player_id TEXT NOT NULL REFERENCES players(id),
    tag_id TEXT NOT NULL REFERENCES tags(id),
    stage INTEGER NOT NULL,
    used_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS game_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    start_time TEXT,
    end_time TEXT,
    completed_at TEXT,
    winner_player_id TEXT
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES players(id),
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.prepare('INSERT OR IGNORE INTO game_settings (id, start_time, end_time) VALUES (1, NULL, NULL)').run();

// Enforce unique player names case-insensitively. Wrapped in try/catch since
// this can fail on databases created before this constraint existed if
// duplicate names already slipped in — the app-level check in players.js
// is the primary guard for new signups either way.
try {
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_players_name_nocase ON players (name COLLATE NOCASE);`
  );
} catch (err) {
  console.warn('Could not create unique player name index (likely pre-existing duplicates):', err.message);
}

// Migrate older databases created before the "clue" column existed.
const tagColumns = db.prepare("PRAGMA table_info(tags)").all();
if (!tagColumns.some((c) => c.name === 'clue')) {
  db.exec('ALTER TABLE tags ADD COLUMN clue TEXT');
}

// Migrate older databases to the two-stage clue system: a room clue shown
// first, then a more detailed clue on a repeat hint request.
if (!tagColumns.some((c) => c.name === 'room_clue')) {
  db.exec('ALTER TABLE tags ADD COLUMN room_clue TEXT');
  // Carry forward anything already typed into the old single "clue" field.
  db.exec("UPDATE tags SET room_clue = clue WHERE clue IS NOT NULL");
}
if (!tagColumns.some((c) => c.name === 'detail_clue')) {
  db.exec('ALTER TABLE tags ADD COLUMN detail_clue TEXT');
}

const findColumns = db.prepare("PRAGMA table_info(finds)").all();
if (!findColumns.some((c) => c.name === 'clues_used')) {
  db.exec('ALTER TABLE finds ADD COLUMN clues_used INTEGER NOT NULL DEFAULT 0');
}

// Migrate older databases to structured room selection (a central rooms list
// picked from a dropdown) instead of free-text room clues, and gold-tag
// marking for the Treasure Hunter achievement.
if (!tagColumns.some((c) => c.name === 'room_id')) {
  db.exec('ALTER TABLE tags ADD COLUMN room_id TEXT REFERENCES rooms(id)');
}
if (!tagColumns.some((c) => c.name === 'is_gold')) {
  db.exec('ALTER TABLE tags ADD COLUMN is_gold INTEGER NOT NULL DEFAULT 0');
}

// Migrate older databases created before game-completion tracking existed.
const gameSettingsColumns = db.prepare("PRAGMA table_info(game_settings)").all();
if (!gameSettingsColumns.some((c) => c.name === 'completed_at')) {
  db.exec('ALTER TABLE game_settings ADD COLUMN completed_at TEXT');
}
if (!gameSettingsColumns.some((c) => c.name === 'winner_player_id')) {
  db.exec('ALTER TABLE game_settings ADD COLUMN winner_player_id TEXT');
}

// Migrate older databases created before the admin-settable rate limit existed.
if (!gameSettingsColumns.some((c) => c.name === 'rate_limit_per_min')) {
  db.exec('ALTER TABLE game_settings ADD COLUMN rate_limit_per_min INTEGER');
  db.exec('UPDATE game_settings SET rate_limit_per_min = 1000 WHERE rate_limit_per_min IS NULL');
}

// Migrate older databases created before the "avatar" column existed.
const playerColumns = db.prepare("PRAGMA table_info(players)").all();
if (!playerColumns.some((c) => c.name === 'avatar')) {
  db.exec('ALTER TABLE players ADD COLUMN avatar TEXT');
}

// Race-condition safety net alongside the app-level checks in players.js —
// NULLs are exempt so it never blocks players created before avatars existed.
try {
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_players_avatar ON players (avatar) WHERE avatar IS NOT NULL;`
  );
} catch (err) {
  console.warn('Could not create unique player avatar index (likely pre-existing duplicates):', err.message);
}

// Account columns for the username/password login system. Players created
// before this existed keep their progress, but need an admin password reset
// before they can sign in again.
if (!playerColumns.some((c) => c.name === 'username')) {
  db.exec('ALTER TABLE players ADD COLUMN username TEXT');
  db.exec("UPDATE players SET username = LOWER(REPLACE(name, ' ', '')) WHERE username IS NULL");
}
if (!playerColumns.some((c) => c.name === 'password_hash')) {
  db.exec('ALTER TABLE players ADD COLUMN password_hash TEXT');
}
if (!playerColumns.some((c) => c.name === 'password_salt')) {
  db.exec('ALTER TABLE players ADD COLUMN password_salt TEXT');
}
if (!playerColumns.some((c) => c.name === 'is_admin')) {
  db.exec('ALTER TABLE players ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
}
if (!playerColumns.some((c) => c.name === 'is_active')) {
  db.exec('ALTER TABLE players ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1');
}

try {
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_players_username_nocase ON players (username COLLATE NOCASE) WHERE username IS NOT NULL;`
  );
} catch (err) {
  console.warn('Could not create unique username index (likely pre-existing duplicates):', err.message);
}

// Disabled tags keep their row and printed URL but are excluded from
// scoring, hints, totals and achievements.
if (!tagColumns.some((c) => c.name === 'is_enabled')) {
  db.exec('ALTER TABLE tags ADD COLUMN is_enabled INTEGER NOT NULL DEFAULT 1');
}
