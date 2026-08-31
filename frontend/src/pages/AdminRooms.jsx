import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminRequest } from '../api.js';

export default function AdminRooms() {
  const [rooms, setRooms] = useState([]);
  const [tags, setTags] = useState([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const refresh = () => {
    setError('');
    Promise.all([adminRequest('/rooms'), adminRequest('/tags')])
      .then(([r, t]) => {
        setRooms(r.rooms);
        setTags(t.tags);
      })
      .catch((err) => setError(err.message));
  };

  useEffect(refresh, []);

  const tagCountFor = (roomId) => tags.filter((t) => t.roomId === roomId).length;

  const query = search.trim().toLowerCase();
  const filteredRooms = query ? rooms.filter((r) => r.name?.toLowerCase().includes(query)) : rooms;

  return (
    <div className="card admin-card">
      <div className="admin-page-head">
        <h1>Room admin</h1>
        <Link to="/admin" className="link-button">← Back to admin</Link>
      </div>
      {error && <p className="error">{error}</p>}

      <section>
        <h2>Add a room</h2>
        <p className="center-note" style={{ textAlign: 'left' }}>
          Rooms are used for the first-stage clue and the Explorer achievement.
          Deleting a room clears it from any tags that used it.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newRoomName.trim()) return;
            try {
              await adminRequest('/rooms', { method: 'POST', body: JSON.stringify({ name: newRoomName.trim() }) });
              setNewRoomName('');
              refresh();
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
      </section>

      <section>
        <h2>Rooms ({filteredRooms.length}{query ? ` of ${rooms.length}` : ''})</h2>
        <input
          className="admin-search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by room name"
        />
        <div className="tag-grid">
          {filteredRooms.map((r) => (
            <div key={r.id} className="tag-card">
              <div className="tag-card-header">
                <span className="tag-card-name">🚪 {r.name}</span>
                <button
                  className="danger"
                  onClick={async () => {
                    if (!window.confirm(`Delete room "${r.name}"? Tags using it will lose their room clue.`)) return;
                    await adminRequest(`/rooms/${r.id}`, { method: 'DELETE' });
                    refresh();
                  }}
                >
                  Delete
                </button>
              </div>
              <span className="row-sub">{tagCountFor(r.id)} tag(s) assigned</span>
            </div>
          ))}
          {filteredRooms.length === 0 && <p className="center-note">{query ? 'No rooms match your search.' : 'No rooms added yet.'}</p>}
        </div>
      </section>
    </div>
  );
}
