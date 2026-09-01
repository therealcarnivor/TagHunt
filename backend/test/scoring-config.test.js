import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'taghunt-score-'));
process.env.DATA_DIR = tempDir;

const { db } = await import('../src/db.js');
const { computeFindPoints } = await import('../src/scoring.js');

test('admin-configured clue scoring uses custom values with defaults for missing settings', () => {
  db.exec('DELETE FROM finds');
  db.exec('DELETE FROM tags');
  db.exec('DELETE FROM players');
  db.exec('DELETE FROM game_settings');
  db.exec(`
    INSERT INTO players (id, name) VALUES ('p1', 'One');
    INSERT INTO tags (id, name) VALUES ('t1', 'Tag 1');
    INSERT INTO tags (id, name) VALUES ('t2', 'Tag 2');
    INSERT INTO tags (id, name) VALUES ('t3', 'Tag 3');
    INSERT INTO game_settings (id, start_time, end_time, no_clue_points, one_clue_points, two_clue_points)
    VALUES (1, NULL, NULL, 5, 3, 1);
    INSERT INTO finds (player_id, tag_id, clues_used) VALUES ('p1', 't1', 0), ('p1', 't2', 1), ('p1', 't3', 2);
  `);

  const points = computeFindPoints().map((row) => ({ tagId: row.tagId, points: row.points }));

  assert.deepEqual(points, [
    { tagId: 't1', points: 5 },
    { tagId: 't2', points: 3 },
    { tagId: 't3', points: 1 },
  ]);
});

test('configurable triple points window awards triple points only within configured minutes before end time', () => {
  db.exec('DELETE FROM finds');
  db.exec('DELETE FROM tags');
  db.exec('DELETE FROM players');
  db.exec('DELETE FROM game_settings');

  const now = Date.now();
  const endTime = new Date(now + 60 * 60 * 1000).toISOString(); // ends in 60 mins
  // 15 min window for triple points
  const find1Time = new Date(now + 30 * 60 * 1000).toISOString(); // 30 mins before end (outside 15 min window)
  const find2Time = new Date(now + 50 * 60 * 1000).toISOString(); // 10 mins before end (inside 15 min window)

  db.exec(`
    INSERT INTO players (id, name) VALUES ('p1', 'One');
    INSERT INTO tags (id, name) VALUES ('t1', 'Tag 1');
    INSERT INTO tags (id, name) VALUES ('t2', 'Tag 2');
    INSERT INTO game_settings (id, start_time, end_time, no_clue_points, one_clue_points, two_clue_points, triple_points_mins)
    VALUES (1, NULL, '${endTime}', 3, 2, 1, 15);
    INSERT INTO finds (player_id, tag_id, clues_used, found_at) VALUES ('p1', 't1', 0, '${find1Time}');
    INSERT INTO finds (player_id, tag_id, clues_used, found_at) VALUES ('p1', 't2', 0, '${find2Time}');
  `);

  const points = computeFindPoints().map((row) => ({ tagId: row.tagId, points: row.points }));

  assert.deepEqual(points, [
    { tagId: 't1', points: 3 },
    { tagId: 't2', points: 9 },
  ]);
});

test('setting triple points window to 0 disables triple points before end time', () => {
  db.exec('DELETE FROM finds');
  db.exec('DELETE FROM tags');
  db.exec('DELETE FROM players');
  db.exec('DELETE FROM game_settings');

  const now = Date.now();
  const endTime = new Date(now + 60 * 60 * 1000).toISOString();
  const findTime = new Date(now + 55 * 60 * 1000).toISOString(); // 5 mins before end

  db.exec(`
    INSERT INTO players (id, name) VALUES ('p1', 'One');
    INSERT INTO tags (id, name) VALUES ('t1', 'Tag 1');
    INSERT INTO game_settings (id, start_time, end_time, no_clue_points, one_clue_points, two_clue_points, triple_points_mins)
    VALUES (1, NULL, '${endTime}', 3, 2, 1, 0);
    INSERT INTO finds (player_id, tag_id, clues_used, found_at) VALUES ('p1', 't1', 0, '${findTime}');
  `);

  const points = computeFindPoints().map((row) => ({ tagId: row.tagId, points: row.points }));

  assert.deepEqual(points, [
    { tagId: 't1', points: 3 },
  ]);
});
