import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminRequest } from '../api.js';

// datetime-local inputs need "YYYY-MM-DDTHH:mm" in the browser's local time.
function isoToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function Admin() {
  const [stats, setStats] = useState(null);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [completedAt, setCompletedAt] = useState(null);
  const [winnerName, setWinnerName] = useState(null);
  const [noCluePoints, setNoCluePoints] = useState(3);
  const [oneCluePoints, setOneCluePoints] = useState(2);
  const [twoCluePoints, setTwoCluePoints] = useState(1);
  const [rateLimitPerMin, setRateLimitPerMin] = useState(1000);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = () => {
    setError('');
    Promise.all([adminRequest('/settings'), adminRequest('/stats')])
      .then(([s, st]) => {
        setStartTime(isoToLocalInput(s.startTime));
        setEndTime(isoToLocalInput(s.endTime));
        setCompletedAt(s.completedAt);
        setWinnerName(s.winnerName);
        setNoCluePoints(s.noCluePoints ?? 3);
        setOneCluePoints(s.oneCluePoints ?? 2);
        setTwoCluePoints(s.twoCluePoints ?? 1);
        setRateLimitPerMin(s.rateLimitPerMin ?? 1000);
        setStats(st);
      })
      .catch((err) => setError(err.message));
  };

  useEffect(refresh, []);

  const saveSettings = async (body, message) => {
    setNotice('');
    setError('');
    setBusy(true);
    try {
      await adminRequest('/settings', { method: 'PUT', body: JSON.stringify(body) });
      setNotice(message);
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card admin-card">
      <h1>Tag Hunt Admin</h1>
      {error && <p className="error">{error}</p>}
      {notice && <p className="hint-box">{notice}</p>}

      <section>
        <h2>Overview</h2>
        <div className="stat-grid">
          <StatCard value={stats?.tagsEnabled} label="Active tags" />
          <StatCard value={stats?.tagsDisabled} label="Disabled tags" />
          <StatCard value={stats?.tagsGold} label="Gold tags" />
          <StatCard value={stats?.tagsUnassigned} label="Tags w/o room" />
          <StatCard value={stats?.rooms} label="Rooms" />
          <StatCard value={stats?.playersActive} label="Active players" />
          <StatCard value={stats?.playersDisabled} label="Disabled players" />
          <StatCard value={stats?.admins} label="Admins" />
          <StatCard value={stats?.finds} label="Total finds" />
          <StatCard value={stats?.playersWithFinds} label="Players scoring" />
        </div>
      </section>

      <section>
        <h2>Manage</h2>
        <div className="admin-links">
          <Link to="/admin/players" className="button-link">👥 Player admin</Link>
          <Link to="/admin/tags" className="button-link">🏷️ Tag admin</Link>
          <Link to="/admin/rooms" className="button-link">🚪 Room admin</Link>
        </div>
      </section>



      <section>
        <h2>Game timing</h2>
        <p className="center-note" style={{ textAlign: 'left' }}>
          Optional — set a start/end time to show a countdown on the home page.
          Scans outside this window won't count. Leave blank for no timer.
          Scanning also auto-locks the moment someone finds every tag.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveSettings(
              {
                startTime: startTime ? new Date(startTime).toISOString() : null,
                endTime: endTime ? new Date(endTime).toISOString() : null,
              },
              'Timing saved.'
            );
          }}
        >
          <label className="timing-field">
            Start
            <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </label>
          <label className="timing-field">
            End
            <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </label>
          <button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save timing'}</button>
          <button
            type="button"
            className="danger"
            disabled={busy}
            onClick={() => {
              setStartTime('');
              setEndTime('');
              saveSettings({ startTime: null, endTime: null }, 'Start and end times cleared.');
            }}
          >
            Clear times
          </button>
        </form>
      </section>

      <section>
        <h2>Party controls</h2>
        <button
          className="danger"
          onClick={async () => {
            if (!window.confirm('Reset the hunt? This clears all finds and hint history. Player accounts are kept.')) return;
            setError('');
            try {
              await adminRequest('/reset', { method: 'POST' });
              setNotice('Hunt reset. All finds cleared.');
              refresh();
            } catch (err) {
              setError(err.message);
            }
          }}
        >
          Reset hunt (clear all finds)
        </button>

        {completedAt && (
          <div className="hint-box" style={{ marginTop: '1rem' }}>
            🏁 Hunt complete! {winnerName ? `${winnerName} found every tag first.` : ''} Scanning is locked.
            <div style={{ marginTop: '0.5rem' }}>
              <button
                onClick={async () => {
                  try {
                    await adminRequest('/unlock', { method: 'POST' });
                    refresh();
                  } catch (err) {
                    setError(err.message);
                  }
                }}
              >
                Unlock scanning
              </button>
            </div>
          </div>
        )}
      </section>

      <section>
        <h2>Hint scoring</h2>
        <p className="center-note" style={{ textAlign: 'left' }}>
          Set how many points a tag is worth depending on how many hints were used
          before the scan. Defaults are 3 points with no clues, 2 with one clue,
          and 1 with two clues.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveSettings(
              {
                startTime: startTime ? new Date(startTime).toISOString() : null,
                endTime: endTime ? new Date(endTime).toISOString() : null,
                noCluePoints,
                oneCluePoints,
                twoCluePoints,
              },
              'Hint scoring saved.'
            );
          }}
        >
          <label className="timing-field">
            No clues
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={noCluePoints}
              onChange={(e) => setNoCluePoints(Number(e.target.value))}
            />
          </label>
          <label className="timing-field">
            1 clue
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={oneCluePoints}
              onChange={(e) => setOneCluePoints(Number(e.target.value))}
            />
          </label>
          <label className="timing-field">
            2 clues
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={twoCluePoints}
              onChange={(e) => setTwoCluePoints(Number(e.target.value))}
            />
          </label>
          <button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save scoring'}</button>
        </form>
      </section>

      <section>
        <h2>Server rate limit</h2>
        <p className="center-note" style={{ textAlign: 'left' }}>
          Max requests per minute allowed from a single IP address. Raise this
          if players on the same cell network get "request failed (429)" errors
          — many phones can share one public IP. Default 1000.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveSettings(
              {
                startTime: startTime ? new Date(startTime).toISOString() : null,
                endTime: endTime ? new Date(endTime).toISOString() : null,
                noCluePoints,
                oneCluePoints,
                twoCluePoints,
                rateLimitPerMin,
              },
              'Rate limit saved.'
            );
          }}
        >
          <label className="timing-field">
            Requests/min per IP
            <input
              type="number"
              min={10}
              max={100000}
              step={10}
              value={rateLimitPerMin}
              onChange={(e) => setRateLimitPerMin(Number(e.target.value))}
            />
          </label>
          <button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save limit'}</button>
        </form>
      </section>
    </div>
  );
}

function StatCard({ value, label }) {
  return (
    <div className="stat-chip">
      <span className="stat-value">{value ?? '—'}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
