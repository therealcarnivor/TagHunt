import { useEffect, useState } from 'react';
import { adminRequest } from '../api.js';

const KEY_STORAGE = 'taghunt.adminKey';

// datetime-local inputs need "YYYY-MM-DDTHH:mm" in the browser's local time.
function isoToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function Admin() {
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem(KEY_STORAGE) || '');
  const [keyInput, setKeyInput] = useState('');
  const [tags, setTags] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [players, setPlayers] = useState([]);
  const [newTagName, setNewTagName] = useState('');
  const [newRoomId, setNewRoomId] = useState('');
  const [newDetailClue, setNewDetailClue] = useState('');
  const [newIsGold, setNewIsGold] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [completedAt, setCompletedAt] = useState(null);
  const [winnerName, setWinnerName] = useState(null);
  const [rateLimitPerMin, setRateLimitPerMin] = useState(1000);
  const [timingSaved, setTimingSaved] = useState(false);
  const [timingBusy, setTimingBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);

  const authed = Boolean(adminKey);

  const refresh = (key) => {
    setError('');
    Promise.all([
      adminRequest('/tags', key),
      adminRequest('/rooms', key),
      adminRequest('/players', key),
      adminRequest('/settings', key),
    ])
      .then(([t, r, p, s]) => {
        setTags(t.tags);
        setRooms(r.rooms);
        setPlayers(p.players);
        setStartTime(isoToLocalInput(s.startTime));
        setEndTime(isoToLocalInput(s.endTime));
        setCompletedAt(s.completedAt);
        setWinnerName(s.winnerName);
        setRateLimitPerMin(s.rateLimitPerMin ?? 1000);
      })
      .catch((err) => {
        setError(err.message);
        setAdminKey('');
        sessionStorage.removeItem(KEY_STORAGE);
      });
  };

  useEffect(() => {
    if (authed) refresh(adminKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  if (!authed) {
    return (
      <div className="card join-card">
        <h1>Admin</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!keyInput.trim()) return;
            sessionStorage.setItem(KEY_STORAGE, keyInput.trim());
            setAdminKey(keyInput.trim());
          }}
        >
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="Admin key"
            autoFocus
          />
          <button type="submit">Enter</button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  const origin = window.location.origin;

  return (
    <div className="card admin-card">
      <h1>Admin</h1>
      {error && <p className="error">{error}</p>}

      <section>
        <h2>Party controls</h2>
        <button
          className="danger"
          onClick={async () => {
            if (!window.confirm('Reset the game? This removes all players and their finds (tags stay set up).')) return;
            try {
              await adminRequest('/reset', adminKey, { method: 'POST' });
              refresh(adminKey);
            } catch (err) {
              setError(err.message);
            }
          }}
        >
          Reset game (clear players & finds)
        </button>

        {completedAt && (
          <div className="hint-box" style={{ marginTop: '1rem' }}>
            🏁 Hunt complete! {winnerName ? `${winnerName} found every tag first.` : ''} Scanning is locked.
            <div style={{ marginTop: '0.5rem' }}>
              <button
                onClick={async () => {
                  try {
                    await adminRequest('/unlock', adminKey, { method: 'POST' });
                    refresh(adminKey);
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
        <h2>Game timing</h2>
        <p className="center-note" style={{ textAlign: 'left' }}>
          Optional — set a start/end time to show a countdown on the home page.
          Scans outside this window won't count. Leave blank for no timer.
          Scanning also auto-locks the moment someone finds every tag.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setTimingSaved(false);
            setError('');
            setTimingBusy(true);
            try {
              const body = {
                startTime: startTime ? new Date(startTime).toISOString() : null,
                endTime: endTime ? new Date(endTime).toISOString() : null,
              };
              await adminRequest('/settings', adminKey, { method: 'PUT', body: JSON.stringify(body) });
              setTimingSaved(true);
            } catch (err) {
              setError(err.message);
            } finally {
              setTimingBusy(false);
            }
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
          <button type="submit" disabled={timingBusy}>
            {timingBusy ? 'Saving...' : 'Save timing'}
          </button>
        </form>
        {timingSaved && <p className="hint-box">Saved!</p>}
      </section>

      <section>
        <h2>Server rate limit</h2>
        <p className="center-note" style={{ textAlign: 'left' }}>
          Max requests per minute allowed from a single IP address. Raise this
          if kids on the same cell network get "request failed (429)" errors
          — many phones can share one public IP. Default 1000.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setTimingSaved(false);
            setError('');
            setTimingBusy(true);
            try {
              await adminRequest('/settings', adminKey, {
                method: 'PUT',
                body: JSON.stringify({
                  startTime: startTime ? new Date(startTime).toISOString() : null,
                  endTime: endTime ? new Date(endTime).toISOString() : null,
                  rateLimitPerMin,
                }),
              });
              setTimingSaved(true);
            } catch (err) {
              setError(err.message);
            } finally {
              setTimingBusy(false);
            }
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
          <button type="submit" disabled={timingBusy}>
            {timingBusy ? 'Saving...' : 'Save limit'}
          </button>
        </form>
      </section>

      <section>
        <h2>Rooms</h2>
        <p className="center-note" style={{ textAlign: 'left' }}>
          Add each room in the house once here, then pick it from a dropdown
          when setting up a tag — used for the room clue and the Explorer
          achievement (visiting every room).
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newRoomName.trim()) return;
            try {
              await adminRequest('/rooms', adminKey, {
                method: 'POST',
                body: JSON.stringify({ name: newRoomName.trim() }),
              });
              setNewRoomName('');
              refresh(adminKey);
            } catch (err) {
              setError(err.message);
            }
          }}
        >
          <input
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            placeholder="Room name (e.g. Kitchen)"
            maxLength={50}
          />
          <button type="submit">Add room</button>
        </form>
        <div className="room-chip-list">
          {rooms.map((r) => (
            <span key={r.id} className="room-chip">
              {r.name}
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm(`Delete room "${r.name}"? Tags using it will lose their room clue.`)) return;
                  await adminRequest(`/rooms/${r.id}`, adminKey, { method: 'DELETE' });
                  refresh(adminKey);
                }}
              >
                ×
              </button>
            </span>
          ))}
          {rooms.length === 0 && <span className="center-note">No rooms added yet.</span>}
        </div>
      </section>

      <section>
        <h2>Tags</h2>
        <p className="center-note" style={{ textAlign: 'left' }}>
          You can add tags now and hide the physical tags later. Pick a room
          for the first-stage clue, add a more detailed clue for a repeat hint
          request, and mark it a gold tag for the Treasure Hunter achievement.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newTagName.trim()) return;
            try {
              await adminRequest('/tags', adminKey, {
                method: 'POST',
                body: JSON.stringify({
                  name: newTagName.trim(),
                  roomId: newRoomId || undefined,
                  detailClue: newDetailClue.trim() || undefined,
                  isGold: newIsGold,
                }),
              });
              setNewTagName('');
              setNewRoomId('');
              setNewDetailClue('');
              setNewIsGold(false);
              refresh(adminKey);
            } catch (err) {
              setError(err.message);
            }
          }}
        >
          <input
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="Tag name (e.g. Kitchen Cupboard)"
            maxLength={50}
          />
          <select value={newRoomId} onChange={(e) => setNewRoomId(e.target.value)}>
            <option value="">No room clue</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <input
            value={newDetailClue}
            onChange={(e) => setNewDetailClue(e.target.value)}
            placeholder="Detailed clue (optional, e.g. 'Behind the milk on the top shelf')"
            maxLength={200}
          />
          <label className="gold-toggle">
            <input type="checkbox" checked={newIsGold} onChange={(e) => setNewIsGold(e.target.checked)} />
            ⭐ Gold tag
          </label>
          <button type="submit">Add tag</button>
        </form>

        <div className="tag-grid">
          {tags.map((t) => (
            <TagCard
              key={t.id}
              tag={t}
              rooms={rooms}
              origin={origin}
              adminKey={adminKey}
              onChanged={() => refresh(adminKey)}
              onError={setError}
            />
          ))}
        </div>
      </section>

      <section>
        <h2>Players</h2>
        <p className="center-note" style={{ textAlign: 'left' }}>
          Click a player's name to see their found tags and remove one if it was a mistake.
        </p>
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Joined</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id}>
                <td>
                  <button
                    className="link-button"
                    onClick={() => setSelectedPlayerId(p.id === selectedPlayerId ? null : p.id)}
                  >
                    {p.name}
                  </button>
                </td>
                <td>{p.created_at}</td>
                <td>
                  <button
                    className="danger"
                    onClick={async () => {
                      if (!window.confirm(`Remove player "${p.name}" and all their finds?`)) return;
                      await adminRequest(`/players/${p.id}`, adminKey, { method: 'DELETE' });
                      if (selectedPlayerId === p.id) setSelectedPlayerId(null);
                      refresh(adminKey);
                    }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {selectedPlayerId && (
          <PlayerDetail playerId={selectedPlayerId} adminKey={adminKey} onError={setError} />
        )}
      </section>
    </div>
  );
}

function PlayerDetail({ playerId, adminKey, onError }) {
  const [player, setPlayer] = useState(null);
  const [finds, setFinds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyTagId, setBusyTagId] = useState(null);

  const load = () => {
    setLoading(true);
    adminRequest(`/players/${playerId}/finds`, adminKey)
      .then((d) => {
        setPlayer(d.player);
        setFinds(d.finds);
      })
      .catch((err) => onError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  return (
    <div className="player-detail">
      <h3>{player ? `${player.name}'s tags` : 'Loading...'}</h3>
      {!loading && finds.length === 0 && <p className="center-note">No tags found yet.</p>}
      {finds.length > 0 && (
        <ul className="found-list">
          {finds.map((t) => (
            <li key={t.id} className="found-item">
              <span>🏷️ {t.name}</span>
              <button
                className="danger"
                disabled={busyTagId === t.id}
                onClick={async () => {
                  if (!window.confirm(`Remove "${t.name}" from ${player.name}'s found tags?`)) return;
                  setBusyTagId(t.id);
                  try {
                    await adminRequest(`/players/${playerId}/finds/${t.id}`, adminKey, { method: 'DELETE' });
                    load();
                  } catch (err) {
                    onError(err.message);
                  } finally {
                    setBusyTagId(null);
                  }
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TagCard({ tag, rooms, origin, adminKey, onChanged, onError }) {
  const [roomId, setRoomId] = useState(tag.roomId || '');
  const [detailClue, setDetailClue] = useState(tag.detailClue || '');
  const [isGold, setIsGold] = useState(tag.isGold);
  const [saving, setSaving] = useState(false);
  const dirty =
    roomId !== (tag.roomId || '') || detailClue !== (tag.detailClue || '') || isGold !== tag.isGold;

  const save = async () => {
    setSaving(true);
    try {
      await adminRequest(`/tags/${tag.id}`, adminKey, {
        method: 'PATCH',
        body: JSON.stringify({ roomId: roomId || null, detailClue, isGold }),
      });
      onChanged();
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="tag-card">
      <div className="tag-card-header">
        <span className="tag-card-name">
          {isGold && '⭐ '}
          {tag.name}
        </span>
        <button
          className="danger"
          onClick={async () => {
            if (!window.confirm(`Delete tag "${tag.name}"? This also removes everyone's finds for it.`)) return;
            await adminRequest(`/tags/${tag.id}`, adminKey, { method: 'DELETE' });
            onChanged();
          }}
        >
          Delete
        </button>
      </div>

      <label className="tag-card-field">
        Room
        <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          <option value="">No room clue</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>

      <label className="tag-card-field">
        Detail clue
        <input
          value={detailClue}
          onChange={(e) => setDetailClue(e.target.value)}
          placeholder="No detail clue yet"
          maxLength={200}
        />
      </label>

      <label className="gold-toggle">
        <input type="checkbox" checked={isGold} onChange={(e) => setIsGold(e.target.checked)} />
        ⭐ Gold tag
      </label>

      {dirty && (
        <button onClick={save} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      )}

      <div className="tag-card-url">
        <span className="tag-card-url-label">Write this URL to the NFC tag:</span>
        <span className="mono">{`${origin}/t/${tag.id}`}</span>
      </div>
    </div>
  );
}
