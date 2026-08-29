import { Router } from 'express';
import { db } from '../db.js';
import { notifyLeaderboardChanged } from '../sse.js';
import { pointsForFind } from '../scoring.js';

export const tagsRouter = Router();

function getPlayer(playerId) {
  if (typeof playerId !== 'string' || !playerId) return null;
  return db.prepare('SELECT id, name FROM players WHERE id = ?').get(playerId);
}

function progressFor(playerId) {
  const totalTags = db.prepare('SELECT COUNT(*) AS n FROM tags').get().n;
  const found = db
    .prepare('SELECT COUNT(*) AS n FROM finds WHERE player_id = ?')
    .get(playerId).n;
  return { totalTags, found };
}

function getGameSettings() {
  return db
    .prepare('SELECT start_time AS startTime, end_time AS endTime, completed_at AS completedAt, winner_player_id AS winnerPlayerId FROM game_settings WHERE id = 1')
    .get();
}

// Rejects scans outside the configured start/end window, or after someone
// has already completed the hunt. Returns a player-facing reason or null.
function scanBlockReason(settings) {
  if (settings.completedAt) {
    const winner = settings.winnerPlayerId
      ? db.prepare('SELECT name FROM players WHERE id = ?').get(settings.winnerPlayerId)
      : null;
    return winner
      ? `The hunt is already complete! ${winner.name} found every tag first.`
      : 'The hunt is already complete!';
  }
  const now = Date.now();
  if (settings.startTime && now < new Date(settings.startTime).getTime()) {
    return "The hunt hasn't started yet — hang tight!";
  }
  if (settings.endTime && now > new Date(settings.endTime).getTime()) {
    return "Time's up! The hunt has ended.";
  }
  return null;
}

// Two-stage clue system: the first hint request for a "target" tag reveals
// its room, a repeat request escalates to the more detailed clue. The same
// target tag is stuck with until found, so clues don't jump around.
function pickHint(playerId) {
  const active = db
    .prepare(
      `SELECT h.tag_id AS tagId, h.stage AS stage, r.name AS roomName, t.detail_clue AS detailClue
       FROM player_hints h
       JOIN tags t ON t.id = h.tag_id
       LEFT JOIN rooms r ON r.id = t.room_id
       WHERE h.player_id = ?
         AND h.tag_id NOT IN (SELECT tag_id FROM finds WHERE player_id = ?)`
    )
    .get(playerId, playerId);

  if (active) {
    if (active.stage === 1 && active.detailClue) {
      db.prepare('INSERT INTO hint_uses (player_id, tag_id, stage) VALUES (?, ?, 2)').run(playerId, active.tagId);
      db.prepare('UPDATE player_hints SET stage = 2 WHERE player_id = ? AND tag_id = ?').run(playerId, active.tagId);
      return active.detailClue;
    }
    return active.detailClue || (active.roomName ? `Check the ${active.roomName}.` : null);
  }

  const candidate = db
    .prepare(
      `SELECT t.id, r.name AS roomName, t.detail_clue AS detailClue
       FROM tags t LEFT JOIN rooms r ON r.id = t.room_id
       WHERE (r.name IS NOT NULL OR (t.detail_clue IS NOT NULL AND TRIM(t.detail_clue) <> ''))
         AND t.id NOT IN (SELECT tag_id FROM finds WHERE player_id = ?)
       ORDER BY RANDOM() LIMIT 1`
    )
    .get(playerId);

  if (!candidate) return null;

  const stage = candidate.roomName ? 1 : 2;
  db.prepare('INSERT INTO player_hints (player_id, tag_id, stage) VALUES (?, ?, ?)').run(playerId, candidate.id, stage);
  db.prepare('INSERT INTO hint_uses (player_id, tag_id, stage) VALUES (?, ?, ?)').run(playerId, candidate.id, stage);
  return candidate.roomName ? `Check the ${candidate.roomName}.` : candidate.detailClue;
}

// Total tag count, used by the client to render an overall progress bar.
tagsRouter.get('/', (_req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS n FROM tags').get().n;
  res.json({ total });
});

// Progress breakdown by room for a player (or all rooms with tag counts).
tagsRouter.get('/rooms-progress', (req, res) => {
  const playerId = typeof req.query.playerId === 'string' ? req.query.playerId : '';
  const rooms = db
    .prepare(
      `SELECT r.id, r.name,
              COUNT(DISTINCT t.id) AS total,
              COUNT(DISTINCT f.tag_id) AS found
       FROM rooms r
       LEFT JOIN tags t ON t.room_id = r.id
       LEFT JOIN finds f ON f.tag_id = t.id AND f.player_id = ?
       GROUP BY r.id, r.name
       ORDER BY r.name COLLATE NOCASE ASC`
    )
    .all(playerId);

  res.json({
    rooms: rooms.map((r) => ({
      id: r.id,
      name: r.name,
      total: r.total,
      found: r.found,
      progress: r.total > 0 ? Math.round((r.found / r.total) * 100) : 0,
    })),
  });
});

// A kid can request a fresh hint any time between finds.
tagsRouter.get('/hint', (req, res) => {
  const player = getPlayer(req.query.playerId);
  if (!player) {
    return res.status(401).json({ error: 'Unknown player. Please enter your name again.' });
  }
  const blockReason = scanBlockReason(getGameSettings());
  if (blockReason) {
    return res.json({ hint: null });
  }
  res.json({ hint: pickHint(player.id) });
});

// List of tags a player has already found, for their profile page.
tagsRouter.get('/found', (req, res) => {
  const player = getPlayer(req.query.playerId);
  if (!player) {
    return res.status(401).json({ error: 'Unknown player. Please enter your name again.' });
  }
  const found = db
    .prepare(
      `SELECT t.id, t.name, f.found_at AS foundAt
       FROM finds f JOIN tags t ON t.id = f.tag_id
       WHERE f.player_id = ?
       ORDER BY f.found_at DESC`
    )
    .all(player.id);
  res.json({ found });
});

// Called when a kid scans a physical tag. Body: { playerId }
tagsRouter.post('/:tagId/scan', (req, res) => {
  const { tagId } = req.params;
  const player = getPlayer(req.body?.playerId);
  if (!player) {
    return res.status(401).json({ error: 'Unknown player. Please enter your name again.' });
  }

  const tag = db.prepare('SELECT id, name, is_gold AS isGold FROM tags WHERE id = ?').get(tagId);
  if (!tag) {
    return res.status(404).json({ error: 'This tag is not part of the hunt.' });
  }

  const settings = getGameSettings();
  const blockReason = scanBlockReason(settings);
  if (blockReason) {
    return res.status(403).json({ error: blockReason });
  }

  const existing = db
    .prepare('SELECT 1 FROM finds WHERE player_id = ? AND tag_id = ?')
    .get(player.id, tagId);

  const alreadyFound = Boolean(existing);
  let gameJustCompleted = false;
  let cluesUsed = 0;
  if (!alreadyFound) {
    const hintState = db
      .prepare('SELECT stage FROM player_hints WHERE player_id = ? AND tag_id = ?')
      .get(player.id, tagId);
    cluesUsed = hintState ? Math.min(2, hintState.stage) : 0;
    db.prepare('INSERT INTO finds (player_id, tag_id, clues_used) VALUES (?, ?, ?)').run(player.id, tagId, cluesUsed);
    db.prepare('DELETE FROM player_hints WHERE player_id = ? AND tag_id = ?').run(player.id, tagId);
    notifyLeaderboardChanged();

    const progress = progressFor(player.id);
    if (progress.totalTags > 0 && progress.found === progress.totalTags) {
      db.prepare('UPDATE game_settings SET completed_at = ?, winner_player_id = ? WHERE id = 1').run(
        new Date().toISOString(),
        player.id
      );
      gameJustCompleted = true;
      notifyLeaderboardChanged();
    }
  }

  res.json({
    tag: { id: tag.id, name: tag.name, isGold: Boolean(tag.isGold) },
    alreadyFound,
    pointsAwarded: alreadyFound ? 0 : pointsForFind(player.id, tagId, { justCompletedHunt: gameJustCompleted }),
    progress: progressFor(player.id),
    hint: gameJustCompleted ? null : pickHint(player.id),
    gameJustCompleted,
  });
});
