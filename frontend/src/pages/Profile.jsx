import { useEffect, useState } from 'react';
import { usePlayer } from '../context/PlayerContext.jsx';
import { getFoundTags, getAvatarOptions, changePassword } from '../api.js';

export default function Profile() {
  const { player, loading, rename, setAvatar, signOut } = usePlayer();
  const [found, setFound] = useState([]);
  const [fetchError, setFetchError] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [avatarOptions, setAvatarOptions] = useState([]);
  const [takenAvatars, setTakenAvatars] = useState([]);
  const [avatarBusy, setAvatarBusy] = useState(false);

  useEffect(() => {
    if (player) setName(player.name);
  }, [player]);

  useEffect(() => {
    if (!player) return;
    getFoundTags()
      .then((d) => setFound(d.found))
      .catch((err) => setFetchError(err.message));
  }, [player]);

  useEffect(() => {
    if (!player) return;
    getAvatarOptions()
      .then((d) => {
        setAvatarOptions(d.avatars);
        setTakenAvatars(d.taken || []);
      })
      .catch(() => {});
  }, [player]);

  if (loading) return <p className="center-note">Loading...</p>;
  if (!player) return <p className="center-note">Sign in from the home page first!</p>;

  return (
    <div className="card">
      <h1>Your profile 🧑‍🚀</h1>
      <p className="center-note">Signed in as @{player.username}</p>

      <section className="profile-section">
        <h2>Pick your avatar</h2>
        <p className="center-note" style={{ textAlign: 'left' }}>
          Greyed-out avatars are already taken by other players.
        </p>
        <div className="avatar-grid">
          {avatarOptions.map((emoji) => {
            const isMine = emoji === player.avatar;
            const isTaken = !isMine && takenAvatars.includes(emoji);
            return (
              <button
                key={emoji}
                type="button"
                className={`avatar-choice${isMine ? ' selected' : ''}${isTaken ? ' taken' : ''}`}
                disabled={avatarBusy || isTaken}
                title={isTaken ? 'Already taken' : undefined}
                onClick={async () => {
                  if (isMine) return;
                  setAvatarBusy(true);
                  setError('');
                  try {
                    await setAvatar(emoji);
                  } catch (err) {
                    setError(err.message);
                  } finally {
                    setAvatarBusy(false);
                  }
                }}
              >
                {emoji}
              </button>
            );
          })}
        </div>
      </section>

      <section className="profile-section">
        <h2>Change your name</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            setSaved(false);
            if (!name.trim() || name.trim() === player.name) return;
            setBusy(true);
            try {
              await rename(name.trim());
              setSaved(true);
            } catch (err) {
              setError(err.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={30}
          />
          <button type="submit" disabled={busy || !name.trim() || name.trim() === player.name}>
            {busy ? 'Saving...' : 'Save name'}
          </button>
        </form>
        {saved && <p className="hint-box">Saved! You're now known as "{player.name}".</p>}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="profile-section">
        <h2>Tags you've found ({found.length})</h2>
        {fetchError && <p className="error">{fetchError}</p>}
        {found.length === 0 ? (
          <p className="center-note">No tags found yet — go get scanning!</p>
        ) : (
          <ul className="found-list">
            {found.map((t) => {
              const dateObj = t.foundAt ? new Date(t.foundAt.endsWith('Z') || t.foundAt.includes('T') ? t.foundAt : t.foundAt + 'Z') : null;
              return (
                <li key={t.id} className="found-item">
                  <span>🏷️ {t.name}</span>
                  <span className="row-sub">{dateObj && !isNaN(dateObj.getTime()) ? dateObj.toLocaleString() : ''}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ChangePasswordSection />

      <section className="profile-section">
        <h2>Account</h2>
        <button className="danger" onClick={signOut}>Sign out</button>
      </section>
    </div>
  );
}

function ChangePasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  return (
    <section className="profile-section">
      <h2>Change password</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          setMessage('');
          setBusy(true);
          try {
            await changePassword(currentPassword, newPassword);
            setMessage('Password updated.');
            setCurrentPassword('');
            setNewPassword('');
          } catch (err) {
            setError(err.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Current password"
          autoComplete="current-password"
        />
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New password"
          autoComplete="new-password"
        />
        <button type="submit" disabled={busy || !currentPassword || newPassword.length < 6}>
          {busy ? 'Saving...' : 'Update'}
        </button>
      </form>
      {message && <p className="hint-box">{message}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
