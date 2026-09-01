import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db } from '../db.js';
import { notifyLeaderboardChanged } from '../sse.js';
import { destroyAllSessionsFor, hashPassword, requireAdmin } from '../auth.js';
import { randomAvailableAvatar } from '../avatars.js';

export const adminRouter = Router();

const MIN_PASSWORD_LENGTH = 6;

// Every route below requires a signed-in player flagged as an admin.
adminRouter.use(requireAdmin);

// Headline counts for the admin dashboard.
adminRouter.get('/stats', (_req, res) => {
  const one = (sql) => db.prepare(sql).get().n;
  res.json({
    tagsTotal: one('SELECT COUNT(*) AS n FROM tags'),
    tagsEnabled: one('SELECT COUNT(*) AS n FROM tags WHERE is_enabled = 1'),
    tagsDisabled: one('SELECT COUNT(*) AS n FROM tags WHERE is_enabled = 0'),
    tagsGold: one('SELECT COUNT(*) AS n FROM tags WHERE is_gold = 1 AND is_enabled = 1'),
    tagsUnassigned: one('SELECT COUNT(*) AS n FROM tags WHERE room_id IS NULL'),
    rooms: one('SELECT COUNT(*) AS n FROM rooms'),
    playersTotal: one('SELECT COUNT(*) AS n FROM players'),
    playersActive: one('SELECT COUNT(*) AS n FROM players WHERE is_active = 1'),
    playersDisabled: one('SELECT COUNT(*) AS n FROM players WHERE is_active = 0'),
    admins: one('SELECT COUNT(*) AS n FROM players WHERE is_admin = 1'),
    finds: one('SELECT COUNT(*) AS n FROM finds'),
    playersWithFinds: one('SELECT COUNT(DISTINCT player_id) AS n FROM finds'),
  });
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
              t.is_gold AS isGold, t.is_enabled AS isEnabled, t.created_at
       FROM tags t LEFT JOIN rooms r ON r.id = t.room_id
       ORDER BY t.created_at`
    )
    .all();
  res.json({ tags: tags.map((t) => ({ ...t, isGold: Boolean(t.isGold), isEnabled: Boolean(t.isEnabled) })) });
});

adminRouter.post('/tags', (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 50) : '';
  const roomId = typeof req.body?.roomId === 'string' && req.body.roomId ? req.body.roomId : null;
  const detailClue = sanitizeClue(req.body?.detailClue);
  const isGold = Boolean(req.body?.isGold);
  const isEnabled = req.body?.isEnabled === undefined ? true : Boolean(req.body.isEnabled);
  if (!name) return res.status(400).json({ error: 'A tag name is required.' });
  if (roomId && !db.prepare('SELECT 1 FROM rooms WHERE id = ?').get(roomId)) {
    return res.status(400).json({ error: 'Unknown room.' });
  }

  const id = nanoid(8);
  db.prepare('INSERT INTO tags (id, name, room_id, detail_clue, is_gold, is_enabled) VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    name,
    roomId,
    detailClue,
    isGold ? 1 : 0,
    isEnabled ? 1 : 0
  );
  notifyLeaderboardChanged();
  res.status(201).json({ id, name, roomId, detailClue, isGold, isEnabled });
});

// Lets you write or change a tag's room/clue/gold status at any point, e.g.
// once you've decided where to actually hide it.
adminRouter.patch('/tags/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM tags WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Tag not found.' });

  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 50) : undefined;
  const detailClue = req.body?.detailClue !== undefined ? sanitizeClue(req.body.detailClue) : undefined;
  const isGold = req.body?.isGold !== undefined ? Boolean(req.body.isGold) : undefined;
  const isEnabled = req.body?.isEnabled !== undefined ? Boolean(req.body.isEnabled) : undefined;
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
  if (isEnabled !== undefined) db.prepare('UPDATE tags SET is_enabled = ? WHERE id = ?').run(isEnabled ? 1 : 0, req.params.id);

  const updated = db
    .prepare(
      `SELECT t.id, t.name, t.room_id AS roomId, r.name AS roomName, t.detail_clue AS detailClue,
              t.is_gold AS isGold, t.is_enabled AS isEnabled
       FROM tags t LEFT JOIN rooms r ON r.id = t.room_id
       WHERE t.id = ?`
    )
    .get(req.params.id);
  notifyLeaderboardChanged();
  res.json({ ...updated, isGold: Boolean(updated.isGold), isEnabled: Boolean(updated.isEnabled) });
});

const TAG_ID_PATTERN = /^[A-Za-z0-9_-]{3,40}$/;

// Lets you set the tag's own URL slug (the part after /t/) instead of the
// random one it was created with, e.g. to match a label already printed.
adminRouter.patch('/tags/:id/id', (req, res) => {
  const existing = db.prepare('SELECT id FROM tags WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Tag not found.' });

  const newId = typeof req.body?.newId === 'string' ? req.body.newId.trim() : '';
  if (!TAG_ID_PATTERN.test(newId)) {
    return res.status(400).json({ error: 'Tag URL must be 3-40 characters: letters, numbers, - or _.' });
  }
  if (newId === req.params.id) {
    return res.json({ id: newId });
  }
  if (db.prepare('SELECT 1 FROM tags WHERE id = ?').get(newId)) {
    return res.status(409).json({ error: 'That tag URL is already in use.' });
  }

  const renameTag = db.transaction((oldId, id) => {
    db.prepare('UPDATE tags SET id = ? WHERE id = ?').run(id, oldId);
    db.prepare('UPDATE finds SET tag_id = ? WHERE tag_id = ?').run(id, oldId);
    db.prepare('UPDATE player_hints SET tag_id = ? WHERE tag_id = ?').run(id, oldId);
    db.prepare('UPDATE hint_uses SET tag_id = ? WHERE tag_id = ?').run(id, oldId);
  });
  renameTag(req.params.id, newId);

  notifyLeaderboardChanged();
  res.json({ id: newId });
});

adminRouter.delete('/tags/:id', (req, res) => {
  db.prepare('DELETE FROM hint_uses WHERE tag_id = ?').run(req.params.id);
  db.prepare('DELETE FROM player_hints WHERE tag_id = ?').run(req.params.id);
  db.prepare('DELETE FROM finds WHERE tag_id = ?').run(req.params.id);
  const result = db.prepare('DELETE FROM tags WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Tag not found.' });
  notifyLeaderboardChanged();
  res.status(204).end();
});

adminRouter.get('/players', (_req, res) => {
  const players = db
    .prepare(
      `SELECT p.id, p.name, p.username, p.avatar, p.is_admin AS isAdmin, p.is_active AS isActive,
              p.password_hash IS NOT NULL AS hasPassword, p.created_at,
              (SELECT COUNT(*) FROM finds f WHERE f.player_id = p.id) AS finds
       FROM players p ORDER BY p.created_at`
    )
    .all();
  res.json({
    players: players.map((p) => ({
      ...p,
      isAdmin: Boolean(p.isAdmin),
      isActive: Boolean(p.isActive),
      hasPassword: Boolean(p.hasPassword),
    })),
  });
});

adminRouter.post('/players', (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const name = typeof req.body?.name === 'string' && req.body.name.trim() ? req.body.name.trim().slice(0, 30) : username;
  const isAdmin = Boolean(req.body?.isAdmin);

  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-30 characters, using letters, numbers, dots, dashes or underscores.' });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
  }
  if (db.prepare('SELECT 1 FROM players WHERE username = ? COLLATE NOCASE').get(username)) {
    return res.status(409).json({ error: 'That username is already taken.' });
  }
  if (db.prepare('SELECT 1 FROM players WHERE name = ? COLLATE NOCASE').get(name)) {
    return res.status(409).json({ error: `"${name}" is already taken as a display name.` });
  }

  const takenAvatars = db.prepare('SELECT avatar FROM players WHERE avatar IS NOT NULL').all().map((r) => r.avatar);
  const { hash, salt } = hashPassword(password);
  const id = nanoid(12);
  db.prepare(
    `INSERT INTO players (id, name, username, password_hash, password_salt, avatar, is_admin, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
  ).run(id, name, username, hash, salt, randomAvailableAvatar(takenAvatars), isAdmin ? 1 : 0);

  res.status(201).json({ id, name, username, isAdmin, isActive: true });
});

// Enable/disable an account, toggle admin rights, or rename a player.
adminRouter.patch('/players/:id', (req, res) => {
  const player = db.prepare('SELECT id, name, is_admin AS isAdmin FROM players WHERE id = ?').get(req.params.id);
  if (!player) return res.status(404).json({ error: 'Player not found.' });

  if (req.body?.isActive !== undefined) {
    const isActive = Boolean(req.body.isActive);
    if (!isActive && req.params.id === req.player.id) {
      return res.status(400).json({ error: "You can't disable your own account." });
    }
    db.prepare('UPDATE players SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, req.params.id);
    // Disabling an account should kick any device already signed in as them.
    if (!isActive) destroyAllSessionsFor(req.params.id);
  }

  if (req.body?.isAdmin !== undefined) {
    const isAdmin = Boolean(req.body.isAdmin);
    if (!isAdmin && req.params.id === req.player.id) {
      return res.status(400).json({ error: "You can't remove your own admin rights." });
    }
    if (!isAdmin && db.prepare('SELECT COUNT(*) AS n FROM players WHERE is_admin = 1').get().n <= 1) {
      return res.status(400).json({ error: 'There must be at least one admin.' });
    }
    db.prepare('UPDATE players SET is_admin = ? WHERE id = ?').run(isAdmin ? 1 : 0, req.params.id);
  }

  if (req.body?.name !== undefined) {
    const name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 30) : '';
    if (!name) return res.status(400).json({ error: 'A valid name is required.' });
    if (db.prepare('SELECT 1 FROM players WHERE name = ? COLLATE NOCASE AND id != ?').get(name, req.params.id)) {
      return res.status(409).json({ error: `"${name}" is already taken.` });
    }
    db.prepare('UPDATE players SET name = ? WHERE id = ?').run(name, req.params.id);
  }

  const updated = db
    .prepare('SELECT id, name, username, is_admin AS isAdmin, is_active AS isActive FROM players WHERE id = ?')
    .get(req.params.id);
  notifyLeaderboardChanged();
  res.json({ ...updated, isAdmin: Boolean(updated.isAdmin), isActive: Boolean(updated.isActive) });
});

// Admin-driven password reset; signs the player out of every device.
adminRouter.post('/players/:id/password', (req, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
  }
  const player = db.prepare('SELECT id FROM players WHERE id = ?').get(req.params.id);
  if (!player) return res.status(404).json({ error: 'Player not found.' });

  const { hash, salt } = hashPassword(password);
  db.prepare('UPDATE players SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, req.params.id);
  destroyAllSessionsFor(req.params.id);
  res.json({ ok: true });
});

adminRouter.delete('/players/:id', (req, res) => {
  if (req.params.id === req.player.id) {
    return res.status(400).json({ error: "You can't delete your own account." });
  }
  db.prepare('DELETE FROM sessions WHERE player_id = ?').run(req.params.id);
  db.prepare('DELETE FROM hint_uses WHERE player_id = ?').run(req.params.id);
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

// Clears finds and hint history for a fresh hunt. Player accounts are kept —
// use the player admin page to remove accounts.
adminRouter.post('/reset', (_req, res) => {
  const resetAll = db.transaction(() => {
    db.prepare('DELETE FROM hint_uses').run();
    db.prepare('DELETE FROM player_hints').run();
    db.prepare('DELETE FROM finds').run();
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
              g.no_clue_points AS noCluePoints, g.one_clue_points AS oneCluePoints,
              g.two_clue_points AS twoCluePoints, g.rate_limit_per_min AS rateLimitPerMin,
              g.triple_points_mins AS triplePointsMins,
              g.completion_player_limit AS completionPlayerLimit,
              p.name AS winnerName
       FROM game_settings g LEFT JOIN players p ON p.id = g.winner_player_id
       WHERE g.id = 1`
    )
    .get();
  res.json(row || {
    startTime: null,
    endTime: null,
    completedAt: null,
    winnerName: null,
    noCluePoints: 3,
    oneCluePoints: 2,
    twoCluePoints: 1,
    rateLimitPerMin: 1000,
    triplePointsMins: 30,
    completionPlayerLimit: 0,
  });
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

  let noCluePoints = req.body?.noCluePoints;
  if (noCluePoints !== undefined) {
    noCluePoints = Number(noCluePoints);
    if (!Number.isInteger(noCluePoints) || noCluePoints < 0 || noCluePoints > 100) {
      return res.status(400).json({ error: 'No-clue value must be a whole number between 0 and 100.' });
    }
  } else {
    noCluePoints = db.prepare('SELECT no_clue_points AS v FROM game_settings WHERE id = 1').get().v;
  }

  let oneCluePoints = req.body?.oneCluePoints;
  if (oneCluePoints !== undefined) {
    oneCluePoints = Number(oneCluePoints);
    if (!Number.isInteger(oneCluePoints) || oneCluePoints < 0 || oneCluePoints > 100) {
      return res.status(400).json({ error: 'One-clue value must be a whole number between 0 and 100.' });
    }
  } else {
    oneCluePoints = db.prepare('SELECT one_clue_points AS v FROM game_settings WHERE id = 1').get().v;
  }

  let twoCluePoints = req.body?.twoCluePoints;
  if (twoCluePoints !== undefined) {
    twoCluePoints = Number(twoCluePoints);
    if (!Number.isInteger(twoCluePoints) || twoCluePoints < 0 || twoCluePoints > 100) {
      return res.status(400).json({ error: 'Two-clue value must be a whole number between 0 and 100.' });
    }
  } else {
    twoCluePoints = db.prepare('SELECT two_clue_points AS v FROM game_settings WHERE id = 1').get().v;
  }

  let triplePointsMins = req.body?.triplePointsMins;
  if (triplePointsMins !== undefined) {
    triplePointsMins = Number(triplePointsMins);
    if (!Number.isInteger(triplePointsMins) || triplePointsMins < 0 || triplePointsMins > 10080) {
      return res.status(400).json({ error: 'Triple points window must be a whole number between 0 and 10080 minutes.' });
    }
  } else {
    triplePointsMins = db.prepare('SELECT triple_points_mins AS v FROM game_settings WHERE id = 1').get()?.v ?? 30;
  }

  let completionPlayerLimit = req.body?.completionPlayerLimit;
  if (completionPlayerLimit !== undefined) {
    completionPlayerLimit = Number(completionPlayerLimit);
    if (!Number.isInteger(completionPlayerLimit) || completionPlayerLimit < 0 || completionPlayerLimit > 1000) {
      return res.status(400).json({ error: 'Completion player limit must be a whole number between 0 and 1000.' });
    }
  } else {
    completionPlayerLimit = db.prepare('SELECT completion_player_limit AS v FROM game_settings WHERE id = 1').get()?.v ?? 0;
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

  db.prepare(
    'UPDATE game_settings SET start_time = ?, end_time = ?, no_clue_points = ?, one_clue_points = ?, two_clue_points = ?, rate_limit_per_min = ?, triple_points_mins = ?, completion_player_limit = ?, completed_at = CASE WHEN ? = 0 THEN NULL ELSE completed_at END, winner_player_id = CASE WHEN ? = 0 THEN NULL ELSE winner_player_id END WHERE id = 1'
  ).run(startTime, endTime, noCluePoints, oneCluePoints, twoCluePoints, rateLimitPerMin, triplePointsMins, completionPlayerLimit, completionPlayerLimit, completionPlayerLimit);
  res.json({ startTime, endTime, noCluePoints, oneCluePoints, twoCluePoints, rateLimitPerMin, triplePointsMins, completionPlayerLimit });
});

