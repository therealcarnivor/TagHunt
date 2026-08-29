import { useEffect, useState } from 'react';

function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

// Shows a live countdown to the hunt's start or end time, ticking every second.
export default function Countdown({ startTime, endTime, completedAt, winnerName }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (completedAt) {
    return (
      <p className="hint-box countdown">
        🏆 Hunt complete! {winnerName ? `${winnerName} found every tag first.` : ''}
      </p>
    );
  }

  if (!startTime && !endTime) return null;

  const start = startTime ? new Date(startTime).getTime() : null;
  const end = endTime ? new Date(endTime).getTime() : null;

  if (start && now < start) {
    return (
      <p className="hint-box countdown">⏳ The hunt starts in {formatRemaining(start - now)}</p>
    );
  }

  if (end) {
    if (now >= end) {
      return <p className="hint-box countdown">🏁 The hunt has ended!</p>;
    }
    return (
      <p className="hint-box countdown">⏰ Time remaining: {formatRemaining(end - now)}</p>
    );
  }

  return null;
}
