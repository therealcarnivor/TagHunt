import { Router } from 'express';
import { db } from '../db.js';
import { leaderboardEvents } from '../sse.js';
import { computeFindPoints } from '../scoring.js';
import { computeAchievements } from '../achievements.js';

export const leaderboardRouter = Router();

// Live updates: clients hold this open and refetch /leaderboard whenever a "change" event arrives.
leaderboardRouter.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('\n');

  const send = () => res.write('data: update\n\n');
  leaderboardEvents.on('change', send);

  // Keeps proxies/browsers from timing out an idle connection.
  const heartbeat = setInterval(() => res.write(':heartbeat\n\n'), 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    leaderboardEvents.off('change', send);
  });
});

leaderboardRouter.get('/', (_req, res) => {
  const players = db.prepare('SELECT id AS playerId, name, avatar FROM players').all();
  const finds = db
    .prepare(
      `SELECT f.player_id AS playerId, f.tag_id AS tagId, f.found_at AS foundAt
       FROM finds f JOIN tags t ON t.id = f.tag_id
       WHERE t.is_enabled = 1
       ORDER BY f.found_at ASC`
    )
    .all();
  const pointsByFind = computeFindPoints();
  const pointsMap = new Map(pointsByFind.map((f) => [`${f.playerId}:${f.tagId}`, f.points]));

  const achievementsByPlayer = new Map();
  for (const a of computeAchievements()) {
    if (!a.winnerId) continue;
    if (!achievementsByPlayer.has(a.winnerId)) achievementsByPlayer.set(a.winnerId, []);
    achievementsByPlayer.get(a.winnerId).push({ key: a.key, icon: a.icon, label: a.label });
  }

  const rows = players.map((p) => {
    const playerFinds = finds.filter((f) => f.playerId === p.playerId);
    const score = playerFinds.reduce((sum, f) => sum + (pointsMap.get(`${f.playerId}:${f.tagId}`) ?? 1), 0);
    const lastFoundAt = playerFinds.length ? playerFinds[playerFinds.length - 1].foundAt : null;
    return {
      playerId: p.playerId,
      name: p.name,
      avatar: p.avatar,
      score,
      tagsFound: playerFinds.length,
      lastFoundAt,
      achievements: achievementsByPlayer.get(p.playerId) || [],
    };
  });

  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.tagsFound !== a.tagsFound) return b.tagsFound - a.tagsFound;
    return (a.lastFoundAt || '').localeCompare(b.lastFoundAt || '');
  });

  const totalTags = db.prepare('SELECT COUNT(*) AS n FROM tags WHERE is_enabled = 1').get().n;

  res.json({ totalTags, players: rows });
});
