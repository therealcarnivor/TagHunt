import { Router } from 'express';
import { computeAchievements, progressForPlayer } from '../achievements.js';

export const achievementsRouter = Router();

achievementsRouter.get('/', (_req, res) => {
  const achievements = computeAchievements();
  const playerId = typeof _req.query.playerId === 'string' ? _req.query.playerId : null;
  res.json({ achievements: playerId ? progressForPlayer(playerId) : achievements });
});
