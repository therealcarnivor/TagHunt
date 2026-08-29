import { useEffect, useState } from 'react';
import { getLeaderboard, getAchievements } from '../api.js';
import { usePlayer } from '../context/PlayerContext.jsx';

// Backup poll in case the live SSE connection drops (proxy timeout, network blip, etc).
const FALLBACK_POLL_MS = 30000;

const MEDALS = ['🥇', '🥈', '🥉'];
const AVATAR_COLORS = ['#ff6b6b', '#4ecdc4', '#ffd93d', '#6bcb77', '#a78bfa', '#ff9f43', '#54a0ff'];

function colorFor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export default function Leaderboard() {
  const { player } = usePlayer();
  const [data, setData] = useState({ totalTags: 0, players: [] });
  const [achievements, setAchievements] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      getLeaderboard()
        .then((d) => {
          if (!cancelled) setData(d);
        })
        .catch((err) => {
          if (!cancelled) setError(err.message);
        });
      getAchievements()
        .then((d) => {
          if (!cancelled) setAchievements(d.achievements);
        })
        .catch(() => {});
    };
    load();

    const interval = setInterval(load, FALLBACK_POLL_MS);

    // Instant refresh whenever the server reports a new tag find.
    const source = new EventSource('/api/leaderboard/stream');
    source.onmessage = load;
    source.onerror = () => {
      // EventSource auto-reconnects; the fallback interval covers us meanwhile.
    };

    return () => {
      cancelled = true;
      clearInterval(interval);
      source.close();
    };
  }, []);

  return (
    <div className="card">
      <h1>Leaderboard 🏆</h1>
      {error && <p className="error">{error}</p>}
      <ul className="leaderboard-list">
        {data.players.map((p, i) => {
          const pct = data.totalTags > 0 ? Math.min(100, Math.round((p.tagsFound / data.totalTags) * 100)) : 0;
          const isMe = p.playerId === player?.id;
          return (
            <li key={p.playerId} className={`leaderboard-row${isMe ? ' me' : ''}${i < 3 ? ' top3' : ''}`}>
              <span className="rank">{MEDALS[i] || `#${i + 1}`}</span>
              <span className="avatar" style={{ backgroundColor: colorFor(p.name) }}>
                {p.avatar || p.name.charAt(0).toUpperCase()}
              </span>
              <span className="row-main">
                <span className="row-name">
                  {p.name}
                  {isMe && <span className="you-badge">you</span>}
                  {p.achievements?.map((a) => (
                    <span key={a.key} className="achievement-badge" title={a.label}>
                      {a.icon}
                    </span>
                  ))}
                </span>
                <span className="mini-progress">
                  <span className="mini-progress-fill" style={{ width: `${pct}%` }} />
                </span>
                <span className="row-sub">{p.tagsFound} / {data.totalTags} tags</span>
              </span>
              <span className="row-score">{p.score}</span>
            </li>
          );
        })}
        {data.players.length === 0 && (
          <li className="center-note">No players yet. Be the first to scan a tag!</li>
        )}
      </ul>

      <h2 className="achievements-title">Achievements 🌟</h2>
      <ul className="achievements-list">
        {achievements.filter((a) => a.winnerName).map((a) => (
          <li key={a.key} className={`achievement-row${a.winnerName ? ' earned' : ''}`}>
            <span className="achievement-icon">{a.icon}</span>
            <span className="achievement-info">
              <span className="achievement-label">{a.label}</span>
              <span className="row-sub">{a.description}</span>
            </span>
            <span className="achievement-winner">{a.winnerName || 'Unclaimed'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
