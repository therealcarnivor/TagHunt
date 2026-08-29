export default function ProgressBar({ found, total }) {
  const pct = total > 0 ? Math.min(100, Math.round((found / total) * 100)) : 0;
  return (
    <div className="progress-wrap">
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-label">
        {found} / {total} tags found
      </div>
    </div>
  );
}
