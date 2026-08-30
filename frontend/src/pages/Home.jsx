import { useEffect, useState } from 'react';
import { usePlayer } from '../context/PlayerContext.jsx';
import { getTagTotal, getHint, getGameSettings } from '../api.js';
import { getLeaderboard, getAchievements, getRoomsProgress } from '../api.js';
import ProgressBar from '../components/ProgressBar.jsx';
import Countdown from '../components/Countdown.jsx';

export default function Home() {
  const { player, loading } = usePlayer();
  const [error, setError] = useState('');
  const [totalTags, setTotalTags] = useState(0);
  const [found, setFound] = useState(0);
  const [hint, setHint] = useState(null);
  const [hintBusy, setHintBusy] = useState(false);
  const [achievements, setAchievements] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [gameSettings, setGameSettings] = useState({ startTime: null, endTime: null, completedAt: null, winnerName: null });

  useEffect(() => {
    getTagTotal().then((d) => setTotalTags(d.total)).catch(() => {});
  }, []);

  useEffect(() => {
    getGameSettings().then(setGameSettings).catch(() => {});
  }, []);

  useEffect(() => {
    if (!player) return;
    let cancelled = false;

    const loadPlayerData = () => {
      getLeaderboard()
        .then((d) => {
          if (cancelled) return;
          const me = d.players.find((p) => p.playerId === player.id);
          setFound(me ? me.tagsFound : 0);
        })
        .catch(() => {});
      getAchievements()
        .then((d) => {
          if (cancelled) return;
          setAchievements(d.achievements || []);
        })
        .catch(() => {});
      getRoomsProgress()
        .then((d) => {
          if (cancelled) return;
          setRooms(d.rooms || []);
        })
        .catch(() => {});
    };

    loadPlayerData();

    const source = new EventSource('/api/leaderboard/stream');
    source.onmessage = loadPlayerData;
    source.onerror = () => {};

    return () => {
      cancelled = true;
      source.close();
    };
  }, [player]);

  if (loading) return <p className="center-note">Loading...</p>;
  if (!player) return null;

  return (
    <div className="card hero-card">
      <div className="hero-icon bounce">🎉</div>
      <h1 className="hero-title">Hi {player.name}!</h1>
      <p>Go find those hidden tags and scan them with your phone.</p>
      <Countdown
        startTime={gameSettings.startTime}
        endTime={gameSettings.endTime}
        completedAt={gameSettings.completedAt}
        winnerName={gameSettings.winnerName}
      />
      <ProgressBar found={found} total={totalTags} />

      <div className="stat-row">
        <div className="stat-chip">
          <span className="stat-value">{found}</span>
          <span className="stat-label">Found</span>
        </div>
        <div className="stat-chip">
          <span className="stat-value">{Math.max(totalTags - found, 0)}</span>
          <span className="stat-label">Left</span>
        </div>
      </div>

      {rooms.some((room) => room.found > 0) && (
        <section className="room-progress-section">
          <h2>Room progress</h2>
          {rooms
            .filter((room) => room.found > 0)
            .map((room) => {
              const isComplete = room.total > 0 && room.found >= room.total;
              return (
                <div key={room.id} className="room-progress-item">
                  <span className="room-progress-name" title={room.name}>
                    {isComplete ? '✅' : '🏠'} {room.name}
                  </span>
                  <span className="room-progress-track">
                    <span
                      className="room-progress-fill"
                      style={{ width: `${room.progress}%` }}
                    />
                  </span>
                  <span className="room-progress-count">
                    {room.found} / {room.total}
                  </span>
                </div>
              );
            })}
        </section>
      )}

      <section className="active-achievements">
        <h2>Achievements in progress</h2>
        {achievements.filter((achievement) => !achievement.winnerName && achievement.progress > 0).map((achievement) => (
          <div key={achievement.key} className="active-achievement">
            <span className="active-achievement-name">{achievement.icon} {achievement.label}</span>
            <span className="achievement-progress-track">
              <span className="achievement-progress-fill" style={{ width: `${achievement.progress}%` }} />
            </span>
          </div>
        ))}
      </section>

      <button
        onClick={async () => {
          setHintBusy(true);
          setError('');
          try {
            const data = await getHint();
            setHint(data.hint || "No clues left — you'll have to explore!");
          } catch (err) {
            setError(err.message);
          } finally {
            setHintBusy(false);
          }
        }}
        disabled={hintBusy}
      >
        {hintBusy ? 'Thinking...' : 'Get a hint 💡'}
      </button>
      {hint && <p className="hint-box">🔍 {hint}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
