import { Boxes, Database, Globe as GlobeIcon, Server as ServerIcon } from 'lucide-react';

/** Decorative, non-functional infrastructure illustration for the hero
 * card — pure inline SVG/CSS (no external image asset) so it never
 * 404s and stays crisp at any size. Approximates the reference image's
 * floating-cubes/server-stack motif without claiming to be a literal
 * screenshot of the customer's own infrastructure. */
function HeroIllustration() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'relative',
        width: 220,
        height: 160,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: 200,
          height: 200,
          borderRadius: '50%',
          border: '1px solid rgba(0, 217, 255, 0.18)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 150,
          height: 150,
          borderRadius: '50%',
          border: '1px solid rgba(0, 229, 160, 0.22)',
        }}
      />
      <div
        style={{
          position: 'relative',
          width: 64,
          height: 64,
          borderRadius: 14,
          background: 'linear-gradient(145deg, rgba(0,229,160,0.35), rgba(0,217,255,0.25))',
          border: '1px solid rgba(0, 229, 160, 0.45)',
          boxShadow: '0 0 24px rgba(0, 229, 160, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ServerIcon size={26} style={{ color: 'var(--w3-text)' }} />
      </div>
      {[
        { top: 6, left: 12, Icon: Boxes },
        { top: 18, right: 4, Icon: GlobeIcon },
        { bottom: 10, left: 0, Icon: Database },
      ].map(({ Icon, ...pos }, idx) => (
        <div
          key={idx}
          style={{
            position: 'absolute',
            width: 34,
            height: 34,
            borderRadius: 9,
            background: 'rgba(4, 20, 34, 0.7)',
            border: '1px solid rgba(0, 217, 255, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            ...pos,
          }}
        >
          <Icon size={16} style={{ color: 'var(--w3-cyan)' }} />
        </div>
      ))}
    </div>
  );
}

export function WelcomeHero({
  customerName,
  systemsOk,
  needsAttentionMessage,
  onViewDetails,
}: {
  customerName: string;
  systemsOk: boolean;
  needsAttentionMessage: string | null;
  onViewDetails: () => void;
}) {
  return (
    <div
      className="w3-panel"
      style={{
        marginBottom: '1.4em',
        background: 'linear-gradient(135deg, rgba(0, 229, 160, 0.1), rgba(0, 217, 255, 0.06)), var(--w3-panel)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1.4em',
        flexWrap: 'wrap',
        minHeight: 180,
      }}
    >
      <div>
        <div style={{ fontSize: '1.7em', fontWeight: 700, marginBottom: '0.25em', letterSpacing: '-0.01em' }}>
          Welcome to <span style={{ color: 'var(--w3-cyan)' }}>{customerName}</span>
        </div>
        <div style={{ color: 'var(--w3-text-soft)', marginBottom: '1.1em' }}>Your hosting, simplified.</div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.8em',
            padding: '0.7em 1.1em',
            borderRadius: 12,
            background: 'rgba(0,0,0,0.2)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <span className="w3-pulse-dot" style={{ background: systemsOk ? 'var(--w3-cyan)' : 'var(--w3-danger)' }} aria-hidden="true" />
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95em' }}>
              {systemsOk ? 'All systems operational' : 'Action needed'}
            </div>
            <div style={{ fontSize: '0.8em', color: 'var(--w3-text-soft)' }}>
              {needsAttentionMessage ?? 'Everything is running normally.'}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.9em' }}>
        <HeroIllustration />
        <button onClick={onViewDetails} className="w3-btn">
          View Details →
        </button>
      </div>
    </div>
  );
}
