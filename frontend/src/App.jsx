import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import NavBar from './components/NavBar.jsx';
import Home from './pages/Home.jsx';
import Scan from './pages/Scan.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import Admin from './pages/Admin.jsx';
import AdminPlayers from './pages/AdminPlayers.jsx';
import AdminTags from './pages/AdminTags.jsx';
import AdminRooms from './pages/AdminRooms.jsx';
import Profile from './pages/Profile.jsx';
import Help from './pages/Help.jsx';
import Login from './pages/Login.jsx';
import { usePlayer } from './context/PlayerContext.jsx';

function RequireAuth({ children, adminOnly = false }) {
  const { player, loading } = usePlayer();
  const location = useLocation();
  if (loading) return <p className="center-note">Loading...</p>;
  if (!player) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (adminOnly && !player.isAdmin) return <p className="center-note">You don't have access to this page.</p>;
  return children;
}

export default function App() {
  const location = useLocation();
  // The scan page is meant to be a quick in-and-out flow, ending with the
  // player closing the tab, so it skips the normal site chrome.
  const isScanPage = location.pathname.startsWith('/t/');
  // Admin gets a wider container on large screens (CSS media query below
  // decides the actual width, so it adapts automatically per device).
  const isAdminPage = location.pathname.startsWith('/admin');

  return (
    <>
      {!isScanPage && <NavBar />}
      <main className={`container${isAdminPage ? ' container-admin' : ''}`}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/help" element={<Help />} />
          <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
          <Route path="/t/:tagId" element={<RequireAuth><Scan /></RequireAuth>} />
          <Route path="/leaderboard" element={<RequireAuth><Leaderboard /></RequireAuth>} />
          <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth adminOnly><Admin /></RequireAuth>} />
          <Route path="/admin/players" element={<RequireAuth adminOnly><AdminPlayers /></RequireAuth>} />
          <Route path="/admin/tags" element={<RequireAuth adminOnly><AdminTags /></RequireAuth>} />
          <Route path="/admin/rooms" element={<RequireAuth adminOnly><AdminRooms /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
