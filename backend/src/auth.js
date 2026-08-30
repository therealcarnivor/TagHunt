import crypto from 'node:crypto';
import { db } from './db.js';

const SESSION_TTL_DAYS = 30;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, hash, salt) {
  if (!hash || !salt) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

// Sessions are looked up by SHA-256 of the token so a database leak alone
// can't be replayed as a valid login.
function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createSession(playerId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400000).toISOString();
  db.prepare('INSERT INTO sessions (token_hash, player_id, expires_at) VALUES (?, ?, ?)').run(
    tokenHash(token),
    playerId,
    expiresAt
  );
  return token;
}

export function destroySession(token) {
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
}

export function destroyAllSessionsFor(playerId) {
  db.prepare('DELETE FROM sessions WHERE player_id = ?').run(playerId);
}

export function playerForToken(token) {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT p.id, p.name, p.username, p.avatar, p.is_admin AS isAdmin, p.is_active AS isActive, s.expires_at AS expiresAt
       FROM sessions s JOIN players p ON p.id = s.player_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash(token));
  if (!row) return null;
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
    return null;
  }
  if (!row.isActive) return null;
  return { id: row.id, name: row.name, username: row.username, avatar: row.avatar, isAdmin: Boolean(row.isAdmin) };
}

function tokenFromRequest(req) {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return req.get('x-session-token') || null;
}

export function attachPlayer(req, _res, next) {
  req.player = playerForToken(tokenFromRequest(req));
  next();
}

export function requireAuth(req, res, next) {
  if (!req.player) return res.status(401).json({ error: 'Please sign in to continue.' });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.player) return res.status(401).json({ error: 'Please sign in to continue.' });
  if (!req.player.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
  next();
}

export function adminCount() {
  return db.prepare('SELECT COUNT(*) AS n FROM players WHERE is_admin = 1').get().n;
}
