import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePlayer } from '../context/PlayerContext.jsx';
import Confetti from '../components/Confetti.jsx';

export default function Login() {
  const { signIn, signUp } = usePlayer();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const redirectTo = location.state?.from || '/';
  const isRegister = mode === 'register';

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (isRegister) await signUp(username.trim(), password, name.trim() || undefined);
      else await signIn(username.trim(), password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card join-card hero-card party-card">
      <Confetti />
      <div className="hero-icon bounce">🕵️</div>
      <div className="party-emoji-row" aria-hidden="true">🎉 🎈 🏆 🎈 🎉</div>
      <h1 className="hero-title">{isRegister ? 'Create your account' : 'Welcome back!'}</h1>
      <p>
        {isRegister
          ? 'Pick a username and password so your progress is always yours.'
          : 'Sign in to keep hunting for hidden tags.'}
      </p>

      <form className="auth-form" onSubmit={submit}>
        <label className="auth-field">
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. alex01"
            autoComplete="username"
            autoCapitalize="none"
            maxLength={30}
            autoFocus
          />
        </label>

        {isRegister && (
          <label className="auth-field">
            Display name (optional)
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Shown on the leaderboard"
              maxLength={30}
            />
          </label>
        )}

        <label className="auth-field">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isRegister ? 'At least 6 characters' : 'Your password'}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
          />
        </label>

        <button className="auth-submit" type="submit" disabled={busy || !username.trim() || !password}>
          {busy ? 'Please wait...' : isRegister ? 'Create account 🚀' : 'Sign in 🚀'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      <button
        type="button"
        className="link-button auth-switch"
        onClick={() => {
          setMode(isRegister ? 'login' : 'register');
          setError('');
        }}
      >
        {isRegister ? 'Already have an account? Sign in' : 'New player? Create an account'}
      </button>
    </div>
  );
}
