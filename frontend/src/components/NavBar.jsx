import { NavLink } from 'react-router-dom';
import { usePlayer } from '../context/PlayerContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';

export default function NavBar() {
  const { player } = usePlayer();
  const { theme, toggleTheme } = useTheme();
  return (
    <nav className="navbar">
      <NavLink to="/" end className="brand">
        🔎 TagHunt
      </NavLink>
      <div className="nav-links">
        <NavLink to="/help" className="nav-pill-button icon-only" aria-label="Help" title="Help">
          ❓
        </NavLink>
        <NavLink to="/leaderboard" className="nav-pill-button icon-only" aria-label="Leaderboard" title="Leaderboard">
          🏆
        </NavLink>
        {player && (
          <NavLink to="/profile" className="nav-pill-button icon-only" aria-label="Your profile" title="Your profile">
            {player.avatar || '👤'}
          </NavLink>
        )}
        <button
          type="button"
          className="nav-pill-button icon-only theme-toggle"
          onClick={toggleTheme}
          aria-label="Toggle dark mode"
          title="Toggle dark mode"
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
    </nav>
  );
}

