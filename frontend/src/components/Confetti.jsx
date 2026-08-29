import { useEffect, useState } from 'react';

const COLORS = ['#ff6b6b', '#4ecdc4', '#ffd93d', '#6bcB77', '#a78bfa'];
const PIECE_COUNT = 40;

function makePieces() {
  return Array.from({ length: PIECE_COUNT }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    color: COLORS[i % COLORS.length],
    delay: Math.random() * 0.4,
    duration: 1.8 + Math.random() * 1.2,
    rotate: Math.random() * 360,
  }));
}

// Brief celebratory burst of falling confetti; unmounts itself after the animation.
export default function Confetti() {
  const [pieces, setPieces] = useState(() => makePieces());

  useEffect(() => {
    const timer = setTimeout(() => setPieces([]), 3000);
    return () => clearTimeout(timer);
  }, []);

  if (pieces.length === 0) return null;

  return (
    <div className="confetti-layer" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}
