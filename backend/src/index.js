import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rateLimit } from 'express-rate-limit';

import { db } from './db.js';
import { attachPlayer } from './auth.js';
import { authRouter } from './routes/auth.js';
import { playersRouter } from './routes/players.js';
import { tagsRouter } from './routes/tags.js';
import { leaderboardRouter } from './routes/leaderboard.js';
import { adminRouter } from './routes/admin.js';
import { gameRouter } from './routes/game.js';
import { achievementsRouter } from './routes/achievements.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Running behind a reverse proxy (nginx/Caddy/Traefik) — trust exactly one
// hop so express-rate-limit reads the real client IP from X-Forwarded-For
// instead of the proxy's own IP. Adjust TRUST_PROXY_HOPS if you add more
// proxies in front (e.g. a CDN in front of the reverse proxy).
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));

app.use(helmet());
app.use(express.json({ limit: '10kb' }));

const READ_HEAVY_PREFIXES = ['/api/leaderboard', '/api/game', '/api/achievements', '/api/tags'];

// Admin-settable via /admin (defaults to 1000/min). Read live from the DB on
// every check so changing it in the admin panel takes effect immediately.
function currentRateLimit() {
  const row = db.prepare('SELECT rate_limit_per_min AS v FROM game_settings WHERE id = 1').get();
  return row?.v && row.v > 0 ? row.v : 1000;
}

// Kept fairly generous since this is a private party app behind carrier-grade
// NAT — many phones can share one public IP, so a strict per-IP limit would
// throttle innocent players (e.g. everyone rejoining after losing local
// storage) rather than actually stopping abuse.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: (req) => currentRateLimit(),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => READ_HEAVY_PREFIXES.some((p) => req.path.startsWith(p)),
});

// Cellular carriers often put many phones behind one shared public IP
// (carrier-grade NAT), so read-only polling endpoints need a much higher
// per-IP ceiling than write endpoints like scanning/admin actions.
const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: (req) => currentRateLimit() * 2,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/leaderboard', readLimiter);
app.use('/api/game', readLimiter);
app.use('/api/achievements', readLimiter);
app.use('/api', apiLimiter);

// Resolves the session token into req.player for every API route.
app.use('/api', attachPlayer);

app.use('/api/auth', authRouter);
app.use('/api/players', playersRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/admin', adminRouter);
app.use('/api/game', gameRouter);
app.use('/api/achievements', achievementsRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const staticDir = path.join(__dirname, '..', 'public');
app.use(express.static(staticDir));

// SPA fallback so client-side routes like /t/:tagId and /leaderboard work on refresh.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(staticDir, 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`TagHunt server listening on port ${port}`);
});
