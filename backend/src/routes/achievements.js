import { Router } from 'express';
import { computeAchievements, progressForPlayer } from '../achievements.js';

export const achievementsRouter = Router();

achievementsRouter.get('/', (req, res) => {
  const playerId = req.player?.id ?? null;
  res.json({ achievements: playerId ? progressForPlayer(playerId) : computeAchievements() });
});
