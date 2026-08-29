import { db } from './db.js';

const THIRTY_MIN_MS = 30 * 60 * 1000;

function getGameWindow() {
  return db
    .prepare('SELECT end_time AS endTime, completed_at AS completedAt FROM game_settings WHERE id = 1')
    .get();
}

// Computes the points earned for every recorded find, applying the scoring
// rules: 3 points with no clues, 2 with one clue, 1 with both clues, tripled
// inside the final 30 minutes before the end time, and 10 points for the
// single find that actually closed out the hunt.
export function computeFindPoints() {
  const { endTime, completedAt } = getGameWindow();
  const finds = db
    .prepare(
            `SELECT player_id AS playerId, tag_id AS tagId, clues_used AS cluesUsed,
              CAST(strftime('%s', found_at) AS INTEGER) * 1000 AS foundMs
       FROM finds ORDER BY foundMs ASC, rowid ASC`
    )
    .all();
  if (finds.length === 0) return [];

  const endMs = endTime ? new Date(endTime).getTime() : null;
  const completedMs = completedAt ? new Date(completedAt).getTime() : null;
  const gameOver = Boolean(completedMs) || (endMs !== null && Date.now() > endMs);
  const tripleStartMs = endMs !== null ? endMs - THIRTY_MIN_MS : null;
  const lastIndex = gameOver ? finds.length - 1 : -1;

  return finds.map((f, i) => {
    let points = Math.max(1, 3 - Math.min(2, f.cluesUsed || 0));
    if (tripleStartMs !== null && f.foundMs >= tripleStartMs && (endMs === null || f.foundMs <= endMs)) {
      points = 3;
    }
    if (i === lastIndex) points = 10;
    return { playerId: f.playerId, tagId: f.tagId, points, foundMs: f.foundMs, cluesUsed: f.cluesUsed || 0 };
  });
}

// Points awarded for one specific find, e.g. right after a scan. Falls back
// to a plain 10 if the caller already knows this scan just completed the
// hunt (the general computation can only detect that in hindsight once the
// window is confirmed closed).
export function pointsForFind(playerId, tagId, { justCompletedHunt = false } = {}) {
  if (justCompletedHunt) return 10;
  const all = computeFindPoints();
  const match = all.find((f) => f.playerId === playerId && f.tagId === tagId);
  return match?.points ?? 1;
}

export function totalScoreForPlayer(playerId) {
  return computeFindPoints()
    .filter((f) => f.playerId === playerId)
    .reduce((sum, f) => sum + f.points, 0);
}
