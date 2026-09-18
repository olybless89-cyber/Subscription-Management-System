import { UptimeSeriesPoint } from './types';

const W = 300;
const H = 120;
const PAD_TOP = 6;
const PAD_BOTTOM = 4;
const GRID_LINES = [0, 25, 50, 75, 100];

/** Builds a smooth path through the given points using simple
 * quadratic mid-point smoothing — enough to turn the trailing-24h
 * uptime series into a soft curve without pulling in a charting
 * library for one small area chart. */
function smoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`;

  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    d += ` Q ${p0.x},${p0.y} ${mid.x},${mid.y}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x},${last.y}`;
  return d;
}

/** The "System Activity" area chart: a trailing-24h uptime line built
 * from real status-check buckets (see buildUptimeSeries in
 * src/lib/monitoring/uptime.ts). A bucket with no conclusive checks is
 * left out of the line entirely rather than drawn as a fabricated 0%. */
export function ActivityChart({ series }: { series: UptimeSeriesPoint[] }) {
  const defined = series.map((p, i) => ({ ...p, i })).filter((p) => p.upPercent !== null);

  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const lastIndex = series.length - 1;
  const x = (i: number) => (lastIndex === 0 ? 0 : (i / lastIndex) * W);
  const y = (p: number) => PAD_TOP + plotH - (p / 100) * plotH;

  const hasData = defined.length > 0;
  const linePoints = defined.map((p) => ({ x: x(p.i), y: y(p.upPercent as number) }));
  const linePath = smoothPath(linePoints);
  const areaPath = hasData
    ? `${linePath} L ${linePoints[linePoints.length - 1].x},${H} L ${linePoints[0].x},${H} Z`
    : '';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.2em', marginBottom: '0.6em' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5em', fontSize: '0.78em', color: 'var(--w3-text-soft)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--w3-cyan)', display: 'inline-block' }} aria-hidden="true" />
          Uptime
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5em', fontSize: '0.78em', color: 'var(--w3-text-soft)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--w3-danger)', display: 'inline-block' }} aria-hidden="true" />
          Downtime
        </span>
      </div>

      <div style={{ display: 'flex', gap: '0.6em' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: '0.68em', color: 'var(--w3-text-soft)', paddingBottom: '1.4em' }} aria-hidden="true">
          {[...GRID_LINES].reverse().map((g) => (
            <span key={g}>{g}%</span>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {hasData ? (
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 140, display: 'block' }} role="img" aria-label="Trailing 24-hour uptime chart">
              <defs>
                <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--w3-cyan)" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="var(--w3-cyan)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {GRID_LINES.map((g) => (
                <line key={g} x1={0} x2={W} y1={y(g)} y2={y(g)} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
              ))}
              <path d={areaPath} fill="url(#activityFill)" />
              <path d={linePath} fill="none" stroke="var(--w3-cyan)" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
              {linePoints.map((p, idx) => (
                <circle key={idx} cx={p.x} cy={p.y} r={3} fill="var(--w3-cyan)" stroke="var(--w3-bg)" strokeWidth={1.5}>
                  <title>{`${defined[idx].label}: ${(defined[idx].upPercent as number).toFixed(1)}% uptime`}</title>
                </circle>
              ))}
            </svg>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 140, color: 'var(--w3-text-soft)', fontSize: '0.85em', textAlign: 'center', padding: '0 1em' }}>
              No activity data yet — checks will appear here once monitoring picks up.
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4em' }}>
            {series.map((p, idx) => (
              <span key={idx} style={{ fontSize: '0.72em', color: 'var(--w3-text-soft)' }}>{p.label}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
