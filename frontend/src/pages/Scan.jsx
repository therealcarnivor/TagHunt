import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { usePlayer } from '../context/PlayerContext.jsx';
import { scanTag } from '../api.js';
import ProgressBar from '../components/ProgressBar.jsx';
import Confetti from '../components/Confetti.jsx';
import { playChime } from '../sound.js';

export default function Scan() {
  const { tagId } = useParams();
  const { player, loading } = usePlayer();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [closeMessage, setCloseMessage] = useState('');

  useEffect(() => {
    if (!player || result || busy) return;
    setBusy(true);
    setError('');
    scanTag(tagId)
      .then((data) => {
        setResult(data);
        if (!data.alreadyFound) playChime();
      })
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false));
  }, [player, tagId, result, busy]);

  if (loading) return <p className="center-note">Loading...</p>;
  if (!player) return null;

  if (error) {
    return (
      <div className="card">
        <h1>Uh oh 😕</h1>
        <p className="error">{error}</p>
        <Link to="/">Back home</Link>
      </div>
    );
  }

  if (!result) {
    return <p className="center-note">Checking your tag...</p>;
  }

  return (
    <div className="card scan-result">
      {!result.alreadyFound && <Confetti />}
      {result.alreadyFound ? (
        <>
          <h1>Already found! ✅</h1>
          <p>You already scanned "{result.tag.name}". Go find another one!</p>
        </>
      ) : result.gameJustCompleted ? (
        <>
          <h1>🏆 You won the hunt!</h1>
          <p>
            You found "{result.tag.name}" — the last tag! You collected every tag first.
            Scanning is now locked for everyone.
          </p>
        </>
      ) : (
        <>
          <h1>Tag found! 🎉</h1>
          <p>
            You discovered "{result.tag.name}"{result.tag.isGold && ' ⭐'} and scored{' '}
            {result.pointsAwarded} point{result.pointsAwarded === 1 ? '' : 's'}!
            {result.pointsAwarded === 3 && ' (Triple points — final stretch bonus!)'}
          </p>
        </>
      )}
      <ProgressBar found={result.progress.found} total={result.progress.totalTags} />
      <div className="scan-actions">
        <button
          type="button"
          className="done-button"
          onClick={() => {
            // Only works if this tab was opened via script; most NFC/link-opened
            // tabs block this, so we fall back to telling the player to close it.
            window.close();
            setTimeout(() => setCloseMessage("Can't auto-close this tab — swipe it away or tap the tabs button to close it."), 300);
          }}
        >
          Done ✅
        </button>
      </div>
      {closeMessage && <p className="center-note">{closeMessage}</p>}
    </div>
  );
}
