import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db } from '../db.js';
import { AVATAR_OPTIONS, isValidAvatar, randomAvailableAvatar } from '../avatars.js';

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
  res.json({ avatars: AVATAR_OPTIONS, taken: takenAvatars(req.query.playerId) });
});

// Create a new player identity, or reconnect to an existing one if that name
// is already in use. NFC/deep-link scans on iOS sometimes open in an
// ephemeral browser context that has no localStorage, so re-entering your
// name is the recovery path — this trades strict identity for a low-friction
// "just type your name again" experience, which is fine for a private party.
playersRouter.post('/', (req, res) => {
  const name = sanitizeName(req.body?.name);
  if (!name) {
    return res.status(400).json({ error: 'A valid name is required.' });
  }

  const existing = db
    .prepare('SELECT id, name, avatar FROM players WHERE name = ? COLLATE NOCASE')
    .get(name);
  if (existing) {
    let avatar = existing.avatar;
    if (!avatar) {
      avatar = randomAvailableAvatar(takenAvatars(existing.id));
      db.prepare('UPDATE players SET avatar = ? WHERE id = ?').run(avatar, existing.id);
    }
    return res.status(200).json({ id: existing.id, name: existing.name, avatar });
  }

  const id = nanoid(12);
  const avatar = randomAvailableAvatar(takenAvatars());
  try {
    db.prepare('INSERT INTO players (id, name, avatar) VALUES (?, ?, ?)').run(id, name, avatar);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: `"${name}" is already taken. Try adding a last initial or nickname.` });
    }
    throw err;
  }
  res.status(201).json({ id, name, avatar });
});

// Look up an existing player by token, used to restore session on reload.
playersRouter.get('/:id', (req, res) => {
  const player = db.prepare('SELECT id, name, avatar FROM players WHERE id = ?').get(req.params.id);
  if (!player) return res.status(404).json({ error: 'Player not found.' });
  res.json(player);
});

// Lets a player change their own display name and/or avatar.
playersRouter.patch('/:id', (req, res) => {
  const existingPlayer = db.prepare('SELECT id, name, avatar FROM players WHERE id = ?').get(req.params.id);
  if (!existingPlayer) return res.status(404).json({ error: 'Player not found.' });

  let name = existingPlayer.name;
  if (req.body?.name !== undefined) {
    name = sanitizeName(req.body.name);
    if (!name) {
      return res.status(400).json({ error: 'A valid name is required.' });
    }
  }

  let avatar = existingPlayer.avatar;
  if (req.body?.avatar !== undefined) {
    if (!isValidAvatar(req.body.avatar)) {
      return res.status(400).json({ error: 'Not a valid avatar choice.' });
    }
    if (req.body.avatar !== existingPlayer.avatar && takenAvatars(req.params.id).includes(req.body.avatar)) {
      return res.status(409).json({ error: 'Someone already picked that avatar. Choose another!' });
    }
    avatar = req.body.avatar;
  }

  const clash = db
    .prepare('SELECT 1 FROM players WHERE name = ? COLLATE NOCASE AND id != ?')
    .get(name, req.params.id);
  if (clash) {
    return res.status(409).json({ error: `"${name}" is already taken. Try adding a last initial or nickname.` });
  }

  try {
    db.prepare('UPDATE players SET name = ?, avatar = ? WHERE id = ?').run(name, avatar, req.params.id);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: `"${name}" is already taken. Try adding a last initial or nickname.` });
    }
    throw err;
  }
  res.json({ id: req.params.id, name, avatar });
});
