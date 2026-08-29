import { Routes, Route, useLocation } from 'react-router-dom';
import NavBar from './components/NavBar.jsx';
import Home from './pages/Home.jsx';
import Scan from './pages/Scan.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import Admin from './pages/Admin.jsx';
import Profile from './pages/Profile.jsx';
import Help from './pages/Help.jsx';

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
          <Route path="/" element={<Home />} />
          <Route path="/t/:tagId" element={<Scan />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/help" element={<Help />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
    </>
  );
}
