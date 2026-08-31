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
