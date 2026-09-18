const POINTS = [18, 26, 22, 34, 30, 42, 38, 50, 44, 58, 52, 46];
const LABELS = ['00:00', '06:00', '12:00', '18:00', '24:00'];

function toPath(points: number[], width: number, height: number) {
  const max = Math.max(...points);
  const step = width / (points.length - 1);
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${height - (p / max) * height}`)
    .join(' ');
}

export default function TrafficOverview() {
  const width = 280;
  const height = 90;
  const linePath = toPath(POINTS, width, height);
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  return (
    <div className="rounded-xl border border-white/5 bg-[#0a1512] p-5 shadow-card">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-white">Traffic Overview</h3>
        <span className="rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-white/60">
          24h
        </span>
      </div>
      <p className="text-[22px] font-bold text-white">1.82 TB</p>
      <p className="mb-3 text-[11px] font-medium text-wo-green">↑ 18% Total Traffic</p>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="trafficFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2af598" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#2af598" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#trafficFill)" />
        <path d={linePath} fill="none" stroke="#2af598" strokeWidth="2" />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-wo-muted">
        {LABELS.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
    </div>
  );
}
