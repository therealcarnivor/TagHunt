import { Router } from 'express';
import crypto from 'node:crypto';
import { nanoid } from 'nanoid';
import { db } from '../db.js';
import { notifyLeaderboardChanged } from '../sse.js';

export const adminRouter = Router();

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Guards every route in this router behind a shared secret set via env var.
adminRouter.use((req, res, next) => {
  const adminKey = process.env.ADMIN_KEY;
  const supplied = req.get('x-admin-key');
  if (!adminKey || !supplied || !timingSafeEqual(supplied, adminKey)) {
    return res.status(401).json({ error: 'Invalid or missing admin key.' });
  }
  next();
});

function sanitizeClue(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().slice(0, 200);
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeRoomName(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().slice(0, 50);
  return trimmed.length > 0 ? trimmed : null;
}

// Central list of rooms, picked from a dropdown when setting up a tag,
// instead of typing a free-text room clue each time.
adminRouter.get('/rooms', (_req, res) => {
  const rooms = db.prepare('SELECT id, name FROM rooms ORDER BY name').all();
  res.json({ rooms });
});

adminRouter.post('/rooms', (req, res) => {
  const name = sanitizeRoomName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'A room name is required.' });

  const existing = db.prepare('SELECT 1 FROM rooms WHERE name = ? COLLATE NOCASE').get(name);
  if (existing) return res.status(409).json({ error: `Room "${name}" already exists.` });

  const id = nanoid(8);
  db.prepare('INSERT INTO rooms (id, name) VALUES (?, ?)').run(id, name);
  res.status(201).json({ id, name });
});

adminRouter.delete('/rooms/:id', (req, res) => {
  db.prepare('UPDATE tags SET room_id = NULL WHERE room_id = ?').run(req.params.id);
  const result = db.prepare('DELETE FROM rooms WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Room not found.' });
  res.status(204).end();
});

adminRouter.get('/tags', (_req, res) => {
  const tags = db
    .prepare(
      `SELECT t.id, t.name, t.room_id AS roomId, r.name AS roomName, t.detail_clue AS detailClue,
              t.is_gold AS isGold, t.created_at
       FROM tags t LEFT JOIN rooms r ON r.id = t.room_id
       ORDER BY t.created_at`
    )
    .all();
  res.json({ tags: tags.map((t) => ({ ...t, isGold: Boolean(t.isGold) })) });
});

adminRouter.post('/tags', (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 50) : '';
  const roomId = typeof req.body?.roomId === 'string' && req.body.roomId ? req.body.roomId : null;
  const detailClue = sanitizeClue(req.body?.detailClue);
  const isGold = Boolean(req.body?.isGold);
  if (!name) return res.status(400).json({ error: 'A tag name is required.' });
  if (roomId && !db.prepare('SELECT 1 FROM rooms WHERE id = ?').get(roomId)) {
    return res.status(400).json({ error: 'Unknown room.' });
  }

  const id = nanoid(8);
  db.prepare('INSERT INTO tags (id, name, room_id, detail_clue, is_gold) VALUES (?, ?, ?, ?, ?)').run(
    id,
    name,
    roomId,
    detailClue,
    isGold ? 1 : 0
  );
  res.status(201).json({ id, name, roomId, detailClue, isGold });
});

// Lets you write or change a tag's room/clue/gold status at any point, e.g.
// once you've decided where to actually hide it.
adminRouter.patch('/tags/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM tags WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Tag not found.' });

  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 50) : undefined;
  const detailClue = req.body?.detailClue !== undefined ? sanitizeClue(req.body.detailClue) : undefined;
  const isGold = req.body?.isGold !== undefined ? Boolean(req.body.isGold) : undefined;
  let roomId;
  if (req.body?.roomId !== undefined) {
    roomId = req.body.roomId || null;
    if (roomId && !db.prepare('SELECT 1 FROM rooms WHERE id = ?').get(roomId)) {
      return res.status(400).json({ error: 'Unknown room.' });
    }
  }

  if (name !== undefined) db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(name, req.params.id);
  if (roomId !== undefined) db.prepare('UPDATE tags SET room_id = ? WHERE id = ?').run(roomId, req.params.id);
  if (detailClue !== undefined) db.prepare('UPDATE tags SET detail_clue = ? WHERE id = ?').run(detailClue, req.params.id);
  if (isGold !== undefined) db.prepare('UPDATE tags SET is_gold = ? WHERE id = ?').run(isGold ? 1 : 0, req.params.id);

  const updated = db
    .prepare(
      `SELECT t.id, t.name, t.room_id AS roomId, r.name AS roomName, t.detail_clue AS detailClue, t.is_gold AS isGold
       FROM tags t LEFT JOIN rooms r ON r.id = t.room_id
       WHERE t.id = ?`
    )
    .get(req.params.id);
  res.json({ ...updated, isGold: Boolean(updated.isGold) });
});


adminRouter.delete('/tags/:id', (req, res) => {
  db.prepare('DELETE FROM player_hints WHERE tag_id = ?').run(req.params.id);
  db.prepare('DELETE FROM finds WHERE tag_id = ?').run(req.params.id);
  const result = db.prepare('DELETE FROM tags WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Tag not found.' });
  res.status(204).end();
});

adminRouter.get('/players', (_req, res) => {
  const players = db.prepare('SELECT id, name, created_at FROM players ORDER BY created_at').all();
  res.json({ players });
});

adminRouter.delete('/players/:id', (req, res) => {
  db.prepare('DELETE FROM player_hints WHERE player_id = ?').run(req.params.id);
  db.prepare('DELETE FROM finds WHERE player_id = ?').run(req.params.id);
  const result = db.prepare('DELETE FROM players WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Player not found.' });
  notifyLeaderboardChanged();
  res.status(204).end();
});

// Tags a specific player has found, for the admin's per-player detail view.
adminRouter.get('/players/:id/finds', (req, res) => {
  const player = db.prepare('SELECT id, name FROM players WHERE id = ?').get(req.params.id);
  if (!player) return res.status(404).json({ error: 'Player not found.' });

  const finds = db
    .prepare(
      `SELECT t.id, t.name, f.found_at AS foundAt
       FROM finds f JOIN tags t ON t.id = f.tag_id
       WHERE f.player_id = ?
       ORDER BY f.found_at DESC`
    )
    .all(req.params.id);
  res.json({ player, finds });
});

// Removes a single acquired tag from a player, e.g. to correct a mis-scan.
adminRouter.delete('/players/:id/finds/:tagId', (req, res) => {
  const result = db
    .prepare('DELETE FROM finds WHERE player_id = ? AND tag_id = ?')
    .run(req.params.id, req.params.tagId);
  if (result.changes === 0) return res.status(404).json({ error: 'That find was not on record.' });
  notifyLeaderboardChanged();
  res.status(204).end();
});

// Clears all players and finds for a fresh party, keeping tags (already hidden physically).
// Also lifts any previous hunt-complete lock so scanning works again.
adminRouter.post('/reset', (_req, res) => {
  const resetAll = db.transaction(() => {
    db.prepare('DELETE FROM hint_uses').run();
    db.prepare('DELETE FROM player_hints').run();
    db.prepare('DELETE FROM finds').run();
    db.prepare('DELETE FROM players').run();
    db.prepare('UPDATE game_settings SET completed_at = NULL, winner_player_id = NULL WHERE id = 1').run();
  });
  resetAll();
  notifyLeaderboardChanged();
  res.json({ ok: true });
});

// Lifts a hunt-complete lock without wiping players/finds, e.g. if the admin
// wants to extend the hunt after someone finished, or undid a mis-scan.
adminRouter.post('/unlock', (_req, res) => {
  db.prepare('UPDATE game_settings SET completed_at = NULL, winner_player_id = NULL WHERE id = 1').run();
  notifyLeaderboardChanged();
  res.json({ ok: true });
});

function sanitizeIsoOrNull(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') return undefined;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

adminRouter.get('/settings', (_req, res) => {
  const row = db
    .prepare(
      `SELECT g.start_time AS startTime, g.end_time AS endTime, g.completed_at AS completedAt,
              g.rate_limit_per_min AS rateLimitPerMin, p.name AS winnerName
       FROM game_settings g LEFT JOIN players p ON p.id = g.winner_player_id
       WHERE g.id = 1`
    )
    .get();
  res.json(row || { startTime: null, endTime: null, completedAt: null, winnerName: null, rateLimitPerMin: 1000 });
});

adminRouter.put('/settings', (req, res) => {
  const startTime = sanitizeIsoOrNull(req.body?.startTime);
  const endTime = sanitizeIsoOrNull(req.body?.endTime);
  if (startTime === undefined || endTime === undefined) {
    return res.status(400).json({ error: 'Start/end time must be a valid date or empty.' });
  }
  if (startTime && endTime && new Date(endTime) <= new Date(startTime)) {
    return res.status(400).json({ error: 'End time must be after the start time.' });
  }

  let rateLimitPerMin;
  if (req.body?.rateLimitPerMin !== undefined) {
    rateLimitPerMin = Number(req.body.rateLimitPerMin);
    if (!Number.isInteger(rateLimitPerMin) || rateLimitPerMin < 10 || rateLimitPerMin > 100000) {
      return res.status(400).json({ error: 'Rate limit must be a whole number between 10 and 100000.' });
    }
  } else {
    rateLimitPerMin = db.prepare('SELECT rate_limit_per_min AS v FROM game_settings WHERE id = 1').get().v;
  }

  db.prepare('UPDATE game_settings SET start_time = ?, end_time = ?, rate_limit_per_min = ? WHERE id = 1').run(
    startTime,
    endTime,
    rateLimitPerMin
  );
  res.json({ startTime, endTime, rateLimitPerMin });
});

