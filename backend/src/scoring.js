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
  const settings = db
    .prepare(
      'SELECT no_clue_points AS noCluePoints, one_clue_points AS oneCluePoints, two_clue_points AS twoCluePoints FROM game_settings WHERE id = 1'
    )
    .get() ?? { noCluePoints: 3, oneCluePoints: 2, twoCluePoints: 1 };
  const cluePoints = {
    0: settings.noCluePoints ?? 3,
    1: settings.oneCluePoints ?? 2,
    2: settings.twoCluePoints ?? 1,
  };

  const finds = db
    .prepare(
            `SELECT f.player_id AS playerId, f.tag_id AS tagId, f.clues_used AS cluesUsed,
              CAST(strftime('%s', f.found_at) AS INTEGER) * 1000 AS foundMs
       FROM finds f JOIN tags t ON t.id = f.tag_id
       WHERE t.is_enabled = 1
       ORDER BY foundMs ASC, f.rowid ASC`
    )
    .all();
  if (finds.length === 0) return [];

  const endMs = endTime ? new Date(endTime).getTime() : null;
  const completedMs = completedAt ? new Date(completedAt).getTime() : null;
  const gameOver = Boolean(completedMs) || (endMs !== null && Date.now() > endMs);
  const tripleStartMs = endMs !== null ? endMs - THIRTY_MIN_MS : null;
  const lastIndex = gameOver ? finds.length - 1 : -1;

  return finds.map((f, i) => {
    let points = cluePoints[Math.min(2, f.cluesUsed || 0)] ?? cluePoints[2];
    if (tripleStartMs !== null && f.foundMs >= tripleStartMs && (endMs === null || f.foundMs <= endMs)) {
      points = Math.max(3, points * 3);
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
