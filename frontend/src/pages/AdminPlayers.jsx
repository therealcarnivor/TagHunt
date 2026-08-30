import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminRequest } from '../api.js';

export default function AdminPlayers() {
  const [players, setPlayers] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [newUsername, setNewUsername] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    adminRequest('/players')
      .then((d) => setPlayers(d.players))
      .catch((err) => setError(err.message));
  };

  useEffect(refresh, []);

  const act = async (fn, successMessage) => {
    setError('');
    setNotice('');
    try {
      await fn();
      if (successMessage) setNotice(successMessage);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="card admin-card">
      <div className="admin-page-head">
        <h1>Player admin</h1>
        <Link to="/admin" className="link-button">← Back to admin</Link>
      </div>
      {error && <p className="error">{error}</p>}
      {notice && <p className="hint-box">{notice}</p>}

      <section>
        <h2>Create an account</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            await act(async () => {
              await adminRequest('/players', {
                method: 'POST',
                body: JSON.stringify({
                  username: newUsername.trim(),
                  name: newName.trim() || undefined,
                  password: newPassword,
                  isAdmin: newIsAdmin,
                }),
              });
              setNewUsername('');
              setNewName('');
              setNewPassword('');
              setNewIsAdmin(false);
            }, 'Account created.');
            setBusy(false);
          }}
        >
          <input
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder="Username"
            autoCapitalize="none"
            maxLength={30}
          />
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Display name (optional)"
            maxLength={30}
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Password"
            autoComplete="new-password"
          />
          <label className="gold-toggle">
            <input type="checkbox" checked={newIsAdmin} onChange={(e) => setNewIsAdmin(e.target.checked)} />
            Admin
          </label>
          <button type="submit" disabled={busy || !newUsername.trim() || !newPassword}>
            Create
          </button>
        </form>
      </section>

      <section>
        <h2>Accounts ({players.length})</h2>
        <div className="tag-grid">
          {players.map((p) => (
            <div key={p.id} className={`tag-card${p.isActive ? '' : ' disabled-card'}`}>
              <div className="tag-card-header">
                <span className="tag-card-name">
                  {p.avatar || '👤'} {p.name}
                  {p.isAdmin && <span className="you-badge">admin</span>}
                  {!p.isActive && <span className="you-badge muted-badge">disabled</span>}
                </span>
              </div>
              <span className="row-sub">
                @{p.username || '—'} · {p.finds} finds{p.hasPassword ? '' : ' · no password set'}
              </span>

              <div className="admin-actions">
                <button
                  onClick={() =>
                    act(
                      () => adminRequest(`/players/${p.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !p.isActive }) }),
                      p.isActive ? `${p.name} disabled.` : `${p.name} enabled.`
                    )
                  }
                >
                  {p.isActive ? 'Disable' : 'Enable'}
                </button>
                <button
                  onClick={() =>
                    act(
                      () => adminRequest(`/players/${p.id}`, { method: 'PATCH', body: JSON.stringify({ isAdmin: !p.isAdmin }) }),
                      p.isAdmin ? `${p.name} is no longer an admin.` : `${p.name} is now an admin.`
                    )
                  }
                >
                  {p.isAdmin ? 'Remove admin' : 'Make admin'}
                </button>
                <button onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}>Reset password</button>
                <button
                  className="danger"
                  onClick={() => {
                    if (!window.confirm(`Delete "${p.name}" and all their finds? This cannot be undone.`)) return;
                    act(() => adminRequest(`/players/${p.id}`, { method: 'DELETE' }), `${p.name} deleted.`);
                  }}
                >
                  Delete
                </button>
              </div>

              {selectedId === p.id && (
                <ResetPassword
                  playerName={p.name}
                  onCancel={() => setSelectedId(null)}
                  onSubmit={async (password) => {
                    await act(
                      () => adminRequest(`/players/${p.id}/password`, { method: 'POST', body: JSON.stringify({ password }) }),
                      `Password reset for ${p.name}.`
                    );
                    setSelectedId(null);
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ResetPassword({ playerName, onCancel, onSubmit }) {
  const [password, setPassword] = useState('');
  return (
    <form
      className="reset-password-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(password);
      }}
    >
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={`New password for ${playerName}`}
        autoComplete="new-password"
        autoFocus
      />
      <button type="submit" disabled={password.length < 6}>Save</button>
      <button type="button" className="danger" onClick={onCancel}>Cancel</button>
    </form>
  );
}
