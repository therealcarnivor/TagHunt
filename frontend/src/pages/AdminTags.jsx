import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminRequest } from '../api.js';

export default function AdminTags() {
  const [tags, setTags] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [error, setError] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [newRoomId, setNewRoomId] = useState('');
  const [newDetailClue, setNewDetailClue] = useState('');
  const [newIsGold, setNewIsGold] = useState(false);

  const refresh = () => {
    setError('');
    Promise.all([adminRequest('/tags'), adminRequest('/rooms')])
      .then(([t, r]) => {
        setTags(t.tags);
        setRooms(r.rooms);
      })
      .catch((err) => setError(err.message));
  };

  useEffect(refresh, []);

  const origin = window.location.origin;
  const enabledCount = tags.filter((t) => t.isEnabled).length;

  return (
    <div className="card admin-card">
      <div className="admin-page-head">
        <h1>Tag admin</h1>
        <Link to="/admin" className="link-button">← Back to admin</Link>
      </div>
      {error && <p className="error">{error}</p>}

      <section>
        <h2>Add a tag</h2>
        <p className="center-note" style={{ textAlign: 'left' }}>
          Pick a room for the first-stage clue, add a detailed clue for a repeat
          hint request, and mark gold tags for the Treasure Hunter achievement.
          Disabled tags keep their URL but don't count towards scoring.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newTagName.trim()) return;
            try {
              await adminRequest('/tags', {
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
              refresh();
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
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <input
            value={newDetailClue}
            onChange={(e) => setNewDetailClue(e.target.value)}
            placeholder="Detailed clue (optional)"
            maxLength={200}
          />
          <label className="gold-toggle">
            <input type="checkbox" checked={newIsGold} onChange={(e) => setNewIsGold(e.target.checked)} />
            ⭐ Gold tag
          </label>
          <button type="submit">Add tag</button>
        </form>
      </section>

      <section>
        <h2>Tags ({enabledCount} active of {tags.length})</h2>
        <div className="tag-grid">
          {tags.map((t) => (
            <TagCard
              key={t.id}
              tag={t}
              rooms={rooms}
              origin={origin}
              onChanged={refresh}
              onError={setError}
            />
          ))}
          {tags.length === 0 && <p className="center-note">No tags yet.</p>}
        </div>
      </section>
    </div>
  );
}

function TagCard({ tag, rooms, origin, onChanged, onError }) {
  const [roomId, setRoomId] = useState(tag.roomId || '');
  const [detailClue, setDetailClue] = useState(tag.detailClue || '');
  const [isGold, setIsGold] = useState(tag.isGold);
  const [saving, setSaving] = useState(false);
  const dirty = roomId !== (tag.roomId || '') || detailClue !== (tag.detailClue || '') || isGold !== tag.isGold;

  const patch = async (body) => {
    setSaving(true);
    try {
      await adminRequest(`/tags/${tag.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      onChanged();
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`tag-card${tag.isEnabled ? '' : ' disabled-card'}`}>
      <div className="tag-card-header">
        <span className="tag-card-name">
          {isGold && '⭐ '}
          {tag.name}
          {!tag.isEnabled && <span className="you-badge muted-badge">disabled</span>}
        </span>
        <button
          className="danger"
          onClick={async () => {
            if (!window.confirm(`Delete tag "${tag.name}"? This also removes everyone's finds for it.`)) return;
            await adminRequest(`/tags/${tag.id}`, { method: 'DELETE' });
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
            <option key={r.id} value={r.id}>{r.name}</option>
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

      <div className="admin-actions">
        {dirty && (
          <button onClick={() => patch({ roomId: roomId || null, detailClue, isGold })} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
        <button onClick={() => patch({ isEnabled: !tag.isEnabled })} disabled={saving}>
          {tag.isEnabled ? 'Disable' : 'Enable'}
        </button>
      </div>

      <div className="tag-card-url">
        <span className="tag-card-url-label">Write this URL to the NFC tag:</span>
        <span className="mono">{`${origin}/t/${tag.id}`}</span>
      </div>
    </div>
  );
}
