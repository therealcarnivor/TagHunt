import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootData = path.resolve(__dirname, '../../data');
const backendData = path.resolve(__dirname, '../data');

for (const dir of [rootData, backendData]) {
  fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, 'taghunt.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    DROP TABLE IF EXISTS finds;
    DROP TABLE IF EXISTS player_hints;
    DROP TABLE IF EXISTS hint_uses;
    DROP TABLE IF EXISTS tags;
    DROP TABLE IF EXISTS rooms;
    DROP TABLE IF EXISTS players;
    DROP TABLE IF EXISTS game_settings;

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
      room_clue TEXT,
      detail_clue TEXT,
      room_id TEXT,
      is_gold INTEGER NOT NULL DEFAULT 0,
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
      winner_player_id TEXT,
      no_clue_points INTEGER NOT NULL DEFAULT 3,
      one_clue_points INTEGER NOT NULL DEFAULT 2,
      two_clue_points INTEGER NOT NULL DEFAULT 1,
      rate_limit_per_min INTEGER DEFAULT 1000,
      triple_points_mins INTEGER DEFAULT 30
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const now = Date.now();
  const startTime = new Date(now - 15 * 60 * 1000).toISOString();
  const endTime = new Date(now + 45 * 60 * 1000).toISOString();

  db.prepare('INSERT OR REPLACE INTO game_settings (id, start_time, end_time, no_clue_points, one_clue_points, two_clue_points, rate_limit_per_min, triple_points_mins) VALUES (1, ?, ?, 3, 2, 1, 1000, 30)').run(startTime, endTime);

  // Insert rooms
  const rooms = [
    { id: 'rm_living', name: 'Living Room' },
    { id: 'rm_kitchen', name: 'Kitchen' },
    { id: 'rm_garden', name: 'Garden' },
    { id: 'rm_playroom', name: 'Playroom' },
    { id: 'rm_attic', name: 'Attic' },
  ];
  for (const r of rooms) {
    db.prepare('INSERT INTO rooms (id, name) VALUES (?, ?)').run(r.id, r.name);
  }

  // Insert tags
  const tags = [
    { id: 'tag_lego', name: 'Lego Box', room_id: 'rm_living', detail_clue: 'Look inside the red storage bin beneath the coffee table.', is_gold: 0 },
    { id: 'tag_tv', name: 'Behind the TV', room_id: 'rm_living', detail_clue: 'Check behind the big screen on the media unit.', is_gold: 0 },
    { id: 'tag_fridge', name: 'Golden Dinosaur Fridge Magnet', room_id: 'rm_kitchen', detail_clue: 'Behind the green T-Rex magnet on the fridge door.', is_gold: 1 },
    { id: 'tag_pantry', name: 'Cereal Shelf', room_id: 'rm_kitchen', detail_clue: 'Right next to the Honey Nut Crunch box on the second shelf.', is_gold: 0 },
    { id: 'tag_tree', name: 'Treehouse Ladder', room_id: 'rm_garden', detail_clue: 'Tucked behind the second wooden step going up.', is_gold: 1 },
    { id: 'tag_flower', name: 'Sunflower Pot', room_id: 'rm_garden', detail_clue: 'Underneath the large terracotta planter on the patio.', is_gold: 0 },
    { id: 'tag_monopoly', name: 'Board Game Shelf', room_id: 'rm_playroom', detail_clue: 'Hidden under the Monopoly box stack.', is_gold: 0 },
    { id: 'tag_beanbag', name: 'Blue Bean Bag', room_id: 'rm_playroom', detail_clue: 'Under the giant blue bean bag in the reading corner.', is_gold: 0 },
    { id: 'tag_trunk', name: 'Vintage Travel Trunk', room_id: 'rm_attic', detail_clue: 'Beneath the handle of the old leather trunk.', is_gold: 0 },
    { id: 'tag_telescope', name: 'Star Telescope', room_id: 'rm_attic', detail_clue: 'Attached to the tripod leg by the skylight window.', is_gold: 1 },
  ];
  for (const t of tags) {
    db.prepare('INSERT INTO tags (id, name, room_id, detail_clue, is_gold) VALUES (?, ?, ?, ?, ?)').run(t.id, t.name, t.room_id, t.detail_clue, t.is_gold);
  }

  // Insert players
  const players = [
    { id: 'ply_leo', name: 'Leo', avatar: '🦁' },
    { id: 'ply_maya', name: 'Maya', avatar: '🦊' },
    { id: 'ply_sam', name: 'Sam', avatar: '🚀' },
    { id: 'ply_chloe', name: 'Chloe', avatar: '🦄' },
  ];
  for (const p of players) {
    db.prepare('INSERT INTO players (id, name, avatar) VALUES (?, ?, ?)').run(p.id, p.name, p.avatar);
  }

  // Insert finds
  const finds = [
    { player_id: 'ply_leo', tag_id: 'tag_lego', minsAgo: 14, clues_used: 0 },
    { player_id: 'ply_leo', tag_id: 'tag_tv', minsAgo: 12, clues_used: 1 },
    { player_id: 'ply_leo', tag_id: 'tag_fridge', minsAgo: 9, clues_used: 0 },
    { player_id: 'ply_leo', tag_id: 'tag_pantry', minsAgo: 7, clues_used: 1 },
    { player_id: 'ply_leo', tag_id: 'tag_tree', minsAgo: 4, clues_used: 0 },
    { player_id: 'ply_leo', tag_id: 'tag_monopoly', minsAgo: 2, clues_used: 2 },

    { player_id: 'ply_maya', tag_id: 'tag_pantry', minsAgo: 13, clues_used: 0 },
    { player_id: 'ply_maya', tag_id: 'tag_flower', minsAgo: 10, clues_used: 0 },
    { player_id: 'ply_maya', tag_id: 'tag_tree', minsAgo: 6, clues_used: 1 },
    { player_id: 'ply_maya', tag_id: 'tag_beanbag', minsAgo: 3, clues_used: 0 },

    { player_id: 'ply_sam', tag_id: 'tag_lego', minsAgo: 11, clues_used: 0 },
    { player_id: 'ply_sam', tag_id: 'tag_flower', minsAgo: 5, clues_used: 1 },

    { player_id: 'ply_chloe', tag_id: 'tag_tv', minsAgo: 8, clues_used: 0 },
  ];

  for (const f of finds) {
    const foundAt = new Date(now - f.minsAgo * 60 * 1000).toISOString();
    db.prepare('INSERT INTO finds (player_id, tag_id, found_at, clues_used) VALUES (?, ?, ?, ?)').run(
      f.player_id,
      f.tag_id,
      foundAt,
      f.clues_used
    );
  }

  db.close();
}

console.log('Seeding completed successfully!');
