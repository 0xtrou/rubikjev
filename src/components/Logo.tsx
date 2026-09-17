export default function Logo({ className }: { className?: string }) {
  const colors = [
    "#f4f4f5", "#facc15", "#22c55e",
    "#3b82f6", "#ef4444", "#f4f4f5",
    "#f97316", "#22c55e", "#facc15",
  ];
  const pos = [9, 25, 41];
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1d1d2b" />
          <stop offset="100%" stopColor="#0c0c14" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#logo-bg)" stroke="#2e2e42" strokeWidth="1.5" />
      {colors.map((c, i) => (
        <rect
          key={i}
          x={pos[i % 3]}
          y={pos[Math.floor(i / 3)]}
          width="14"
          height="14"
          rx="4"
          fill={c}
        />
      ))}
    </svg>
  );
}
