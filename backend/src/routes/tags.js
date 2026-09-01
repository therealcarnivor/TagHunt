import { Router } from 'express';
import { db } from '../db.js';
import { notifyLeaderboardChanged } from '../sse.js';
import { pointsForFind } from '../scoring.js';
import { requireAuth } from '../auth.js';

export const tagsRouter = Router();

function progressFor(playerId) {
  const totalTags = db.prepare('SELECT COUNT(*) AS n FROM tags WHERE is_enabled = 1').get().n;
  const found = db
    .prepare('SELECT COUNT(*) AS n FROM finds f JOIN tags t ON t.id = f.tag_id WHERE f.player_id = ? AND t.is_enabled = 1')
    .get(playerId).n;
  return { totalTags, found };
}

function getGameSettings() {
  return db
    .prepare('SELECT start_time AS startTime, end_time AS endTime, completed_at AS completedAt, winner_player_id AS winnerPlayerId, completion_player_limit AS completionPlayerLimit FROM game_settings WHERE id = 1')
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

// Players can hold clues for several tags at once. Each hinted tag starts
// with its room clue and can be escalated to the detailed clue; both stay
// visible until that tag is found.
function activeHints(playerId) {
  return db
    .prepare(
      `SELECT h.tag_id AS tagId, h.stage AS stage, r.id AS roomId, r.name AS roomName,
              t.detail_clue AS detailClue
       FROM player_hints h
       JOIN tags t ON t.id = h.tag_id
       LEFT JOIN rooms r ON r.id = t.room_id
       WHERE h.player_id = ?
         AND t.is_enabled = 1
         AND h.tag_id NOT IN (SELECT tag_id FROM finds WHERE player_id = ?)
       ORDER BY r.name COLLATE NOCASE ASC, h.rowid ASC`
    )
    .all(playerId, playerId)
    .map((h) => ({
      tagId: h.tagId,
      roomId: h.roomId,
      roomName: h.roomName,
      roomClue: h.roomName ? `Check the ${h.roomName}.` : null,
      detailClue: h.stage >= 2 ? h.detailClue : null,
      canRevealMore: h.stage < 2 && Boolean(h.detailClue && h.detailClue.trim()),
    }));
}

// Picks a tag the player hasn't found and isn't already holding a clue for.
function startHint(playerId) {
  const candidate = db
    .prepare(
      `SELECT t.id, r.name AS roomName, t.detail_clue AS detailClue
       FROM tags t LEFT JOIN rooms r ON r.id = t.room_id
       WHERE t.is_enabled = 1
         AND (r.name IS NOT NULL OR (t.detail_clue IS NOT NULL AND TRIM(t.detail_clue) <> ''))
         AND t.id NOT IN (SELECT tag_id FROM finds WHERE player_id = ?)
         AND t.id NOT IN (SELECT tag_id FROM player_hints WHERE player_id = ?)
       ORDER BY RANDOM() LIMIT 1`
    )
    .get(playerId, playerId);

  if (!candidate) return null;

  // Tags with no room fall straight to stage 2 since that's all they have.
  const stage = candidate.roomName ? 1 : 2;
  db.prepare('INSERT INTO player_hints (player_id, tag_id, stage) VALUES (?, ?, ?)').run(playerId, candidate.id, stage);
  db.prepare('INSERT INTO hint_uses (player_id, tag_id, stage) VALUES (?, ?, ?)').run(playerId, candidate.id, stage);
  return candidate.id;
}

// Total tag count, used by the client to render an overall progress bar.
tagsRouter.get('/', (_req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS n FROM tags WHERE is_enabled = 1').get().n;
  res.json({ total });
});

// Progress breakdown by room for the signed-in player.
tagsRouter.get('/rooms-progress', (req, res) => {
  const playerId = req.player?.id ?? '';
  const rooms = db
    .prepare(
      `SELECT r.id, r.name,
              COUNT(DISTINCT t.id) AS total,
              COUNT(DISTINCT f.tag_id) AS found
       FROM rooms r
       LEFT JOIN tags t ON t.room_id = r.id AND t.is_enabled = 1
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

// Every clue the player is currently holding.
tagsRouter.get('/hints', requireAuth, (req, res) => {
  res.json({ hints: activeHints(req.player.id) });
});

// Start a clue for another tag, keeping any clues already held.
tagsRouter.post('/hints', requireAuth, (req, res) => {
  const blockReason = scanBlockReason(getGameSettings());
  if (blockReason) return res.status(403).json({ error: blockReason });

  const startedTagId = startHint(req.player.id);
  res.json({
    hints: activeHints(req.player.id),
    startedTagId,
    message: startedTagId ? null : "No new clues available — you've got a clue for every tag you haven't found yet.",
  });
});

// Escalate one tag's clue from its room to the detailed hiding place.
tagsRouter.post('/hints/:tagId/reveal', requireAuth, (req, res) => {
  const blockReason = scanBlockReason(getGameSettings());
  if (blockReason) return res.status(403).json({ error: blockReason });

  const playerId = req.player.id;
  const { tagId } = req.params;
  const hint = db
    .prepare(
      `SELECT h.stage AS stage, t.detail_clue AS detailClue
       FROM player_hints h JOIN tags t ON t.id = h.tag_id
       WHERE h.player_id = ? AND h.tag_id = ? AND t.is_enabled = 1`
    )
    .get(playerId, tagId);

  if (!hint) return res.status(404).json({ error: "You don't have a clue for that tag." });
  if (!hint.detailClue?.trim()) {
    return res.status(400).json({ error: 'There is no extra detail for this tag.' });
  }

  if (hint.stage < 2) {
    db.prepare('UPDATE player_hints SET stage = 2 WHERE player_id = ? AND tag_id = ?').run(playerId, tagId);
    db.prepare('INSERT INTO hint_uses (player_id, tag_id, stage) VALUES (?, ?, 2)').run(playerId, tagId);
  }

  res.json({ hints: activeHints(playerId) });
});

// List of tags a player has already found, for their profile page.
tagsRouter.get('/found', requireAuth, (req, res) => {
  const found = db
    .prepare(
      `SELECT t.id, t.name, f.found_at AS foundAt
       FROM finds f JOIN tags t ON t.id = f.tag_id
       WHERE f.player_id = ? AND t.is_enabled = 1
       ORDER BY f.found_at DESC`
    )
    .all(req.player.id);
  res.json({ found });
});

// Called when a kid scans a physical tag.
tagsRouter.post('/:tagId/scan', requireAuth, (req, res) => {
  const { tagId } = req.params;
  const player = req.player;

  const tag = db.prepare('SELECT id, name, is_gold AS isGold, is_enabled AS isEnabled FROM tags WHERE id = ?').get(tagId);
  if (!tag) {
    return res.status(404).json({ error: 'This tag is not part of the hunt.' });
  }
  if (!tag.isEnabled) {
    return res.status(403).json({ error: 'This tag is not active in the hunt right now.' });
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
    if (progress.totalTags > 0 && progress.found === progress.totalTags && settings.completionPlayerLimit > 0) {
      const completedPlayers = db
        .prepare(
          `SELECT COUNT(*) AS n FROM (
             SELECT f.player_id
             FROM finds f JOIN tags t ON t.id = f.tag_id
             WHERE t.is_enabled = 1
             GROUP BY f.player_id
             HAVING COUNT(DISTINCT f.tag_id) = ?
           )`
        )
        .get(progress.totalTags).n;
      if (completedPlayers >= settings.completionPlayerLimit) {
        db.prepare('UPDATE game_settings SET completed_at = ?, winner_player_id = ? WHERE id = 1').run(
          new Date().toISOString(),
          player.id
        );
        gameJustCompleted = true;
        notifyLeaderboardChanged();
      }
    }
  }

  res.json({
    tag: { id: tag.id, name: tag.name, isGold: Boolean(tag.isGold) },
    alreadyFound,
    pointsAwarded: alreadyFound ? 0 : pointsForFind(player.id, tagId, { justCompletedHunt: gameJustCompleted }),
    progress: progressFor(player.id),
    gameJustCompleted,
  });
});
