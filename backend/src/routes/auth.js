import { Router } from 'express';
import { nanoid } from 'nanoid';
import { db } from '../db.js';
import { randomAvailableAvatar } from '../avatars.js';
import { adminCount, createSession, destroySession, hashPassword, requireAuth, verifyPassword } from '../auth.js';

export const authRouter = Router();

const MIN_PASSWORD_LENGTH = 6;

function sanitizeUsername(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase().slice(0, 30);
  return /^[a-z0-9._-]{3,30}$/.test(trimmed) ? trimmed : null;
}

function sanitizeDisplayName(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().slice(0, 30);
  return trimmed.length > 0 ? trimmed : null;
}

function takenAvatars() {
  return db.prepare('SELECT avatar FROM players WHERE avatar IS NOT NULL').all().map((r) => r.avatar);
}

function publicPlayer(row) {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    avatar: row.avatar,
    isAdmin: Boolean(row.is_admin ?? row.isAdmin),
  };
}

authRouter.post('/register', (req, res) => {
  const username = sanitizeUsername(req.body?.username);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const name = sanitizeDisplayName(req.body?.name) || username;

  if (!username) {
    return res.status(400).json({ error: 'Username must be 3-30 characters, using letters, numbers, dots, dashes or underscores.' });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
  }
  if (db.prepare('SELECT 1 FROM players WHERE username = ? COLLATE NOCASE').get(username)) {
    return res.status(409).json({ error: 'That username is already taken.' });
  }
  if (db.prepare('SELECT 1 FROM players WHERE name = ? COLLATE NOCASE').get(name)) {
    return res.status(409).json({ error: `"${name}" is already taken as a display name.` });
  }

  const { hash, salt } = hashPassword(password);
  const id = nanoid(12);
  // Bootstrap: whoever registers first on a fresh install becomes the admin.
  const isAdmin = adminCount() === 0 ? 1 : 0;

  try {
    db.prepare(
      `INSERT INTO players (id, name, username, password_hash, password_salt, avatar, is_admin, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
    ).run(id, name, username, hash, salt, randomAvailableAvatar(takenAvatars()), isAdmin);
  } catch (err) {
    if (err.code?.startsWith('SQLITE_CONSTRAINT')) {
      return res.status(409).json({ error: 'That username or display name is already taken.' });
    }
    throw err;
  }

  const player = db.prepare('SELECT id, name, username, avatar, is_admin FROM players WHERE id = ?').get(id);
  res.status(201).json({ token: createSession(id), player: publicPlayer(player) });
});

authRouter.post('/login', (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  const row = db
    .prepare('SELECT id, name, username, avatar, is_admin, is_active, password_hash, password_salt FROM players WHERE username = ? COLLATE NOCASE')
    .get(username);

  if (!row || !verifyPassword(password, row.password_hash, row.password_salt)) {
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }
  if (!row.is_active) {
    return res.status(403).json({ error: 'This account has been disabled. Ask an admin for help.' });
  }

  res.json({ token: createSession(row.id), player: publicPlayer(row) });
});

authRouter.post('/logout', (req, res) => {
  const header = req.get('authorization');
  destroySession(header?.startsWith('Bearer ') ? header.slice(7) : req.get('x-session-token'));
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ player: req.player });
});

// Lets a signed-in player change their own password.
authRouter.post('/change-password', requireAuth, (req, res) => {
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
  }

  const row = db.prepare('SELECT password_hash, password_salt FROM players WHERE id = ?').get(req.player.id);
  if (!verifyPassword(currentPassword, row.password_hash, row.password_salt)) {
    return res.status(403).json({ error: 'Your current password is incorrect.' });
  }

  const { hash, salt } = hashPassword(newPassword);
  db.prepare('UPDATE players SET password_hash = ?, password_salt = ? WHERE id = ?').run(hash, salt, req.player.id);
  res.json({ ok: true });
});
