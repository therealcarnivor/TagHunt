import { Router } from 'express';
import { db } from '../db.js';

export const gameRouter = Router();

// Public endpoint so the home page can render a start/end countdown and any
// "hunt complete" banner once someone has found every tag.
gameRouter.get('/', (_req, res) => {
  const row = db
    .prepare(
      `SELECT g.start_time AS startTime, g.end_time AS endTime, g.completed_at AS completedAt,
              p.name AS winnerName
       FROM game_settings g LEFT JOIN players p ON p.id = g.winner_player_id
       WHERE g.id = 1`
    )
    .get();
  res.json(row || { startTime: null, endTime: null, completedAt: null, winnerName: null });
});
