import { Router } from 'express';
import { db } from '../db.js';
import { AVATAR_OPTIONS, isValidAvatar } from '../avatars.js';
import { requireAuth } from '../auth.js';

export const playersRouter = Router();

const MAX_NAME_LENGTH = 30;

function sanitizeName(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().slice(0, MAX_NAME_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
}

function takenAvatars(excludePlayerId) {
  return db
    .prepare('SELECT avatar FROM players WHERE avatar IS NOT NULL AND id != ?')
    .all(excludePlayerId || '')
    .map((r) => r.avatar);
}

// Lists all avatar options plus which ones are already claimed by other
// players, so the client can grey out unavailable choices.
playersRouter.get('/avatars', (req, res) => {
  res.json({ avatars: AVATAR_OPTIONS, taken: takenAvatars(req.player?.id) });
});

// Lets the signed-in player change their own display name and/or avatar.
playersRouter.patch('/me', requireAuth, (req, res) => {
  const playerId = req.player.id;
  const existingPlayer = db.prepare('SELECT id, name, avatar FROM players WHERE id = ?').get(playerId);
  if (!existingPlayer) return res.status(404).json({ error: 'Player not found.' });

  let name = existingPlayer.name;
  if (req.body?.name !== undefined) {
    name = sanitizeName(req.body.name);
    if (!name) return res.status(400).json({ error: 'A valid name is required.' });
  }

  let avatar = existingPlayer.avatar;
  if (req.body?.avatar !== undefined) {
    if (!isValidAvatar(req.body.avatar)) {
      return res.status(400).json({ error: 'Not a valid avatar choice.' });
    }
    if (req.body.avatar !== existingPlayer.avatar && takenAvatars(playerId).includes(req.body.avatar)) {
      return res.status(409).json({ error: 'Someone already picked that avatar. Choose another!' });
    }
    avatar = req.body.avatar;
  }

  if (db.prepare('SELECT 1 FROM players WHERE name = ? COLLATE NOCASE AND id != ?').get(name, playerId)) {
    return res.status(409).json({ error: `"${name}" is already taken. Try adding a last initial or nickname.` });
  }

  try {
    db.prepare('UPDATE players SET name = ?, avatar = ? WHERE id = ?').run(name, avatar, playerId);
  } catch (err) {
    if (err.code?.startsWith('SQLITE_CONSTRAINT')) {
      return res.status(409).json({ error: 'That name or avatar is already taken.' });
    }
    throw err;
  }

  res.json({ id: playerId, name, avatar, username: req.player.username, isAdmin: req.player.isAdmin });
});
