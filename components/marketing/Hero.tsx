import HeroVisual from './HeroVisual';

import { Clock, Globe2, Zap, ShieldCheck } from 'lucide-react';

const QUICK_STATS = [
  { icon: Clock, value: '99.99%', label: 'Uptime SLA' },
  { icon: Globe2, value: 'Global', label: '12 Regions' },
  { icon: Zap, value: 'Instant', label: 'Deployments' },
  { icon: ShieldCheck, value: 'Secure', label: 'by Design' },
];

const TRUSTED_BY = ['BuildTech', 'NexaLabs', 'OraFi', 'CloudNeon', 'Vertex'];

export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-white/5 bg-wo-black pb-16 pt-14">
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-14 px-6 lg:grid-cols-2 lg:gap-8 lg:px-10">
        <div>
          <p className="mb-5 text-[12px] font-semibold tracking-[0.25em] text-wo-green">
            NEXT GENERATION CLOUD INFRASTRUCTURE
          </p>
          <h1 className="text-balance text-[44px] font-black uppercase leading-[1.05] tracking-tight text-white sm:text-[56px] lg:text-[60px]">
            Your Cloud.
            <br />
            Without The
            <br />
            <span className="text-wo-green">Complexity.</span>
          </h1>
          <p className="mt-6 max-w-[480px] text-[16px] leading-relaxed text-wo-muted">
            Deploy, scale and manage modern applications with a powerful, intuitive and
            intelligent cloud control plane built for the next generation.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href="/signup"
              className="inline-flex items-center gap-2 rounded-lg bg-wo-green px-6 py-3.5 text-[15px] font-semibold text-wo-black transition hover:bg-wo-green/90"
            >
              Deploy Your First App <span aria-hidden>→</span>
            </a>
            <a
              href="#dashboard-preview"
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-6 py-3.5 text-[15px] font-semibold text-white transition hover:border-white/30"
            >
              Explore the Cloud
            </a>
          </div>

          <dl className="mt-10 grid grid-cols-2 gap-y-5 sm:grid-cols-4">
            {QUICK_STATS.map(({ icon: Icon, value, label }) => (
              <div key={label} className="flex items-start gap-2.5">
                <Icon size={16} className="mt-0.5 shrink-0 text-wo-green" strokeWidth={2} />
                <div>
                  <dt className="text-[17px] font-bold leading-none text-white">{value}</dt>
                  <dd className="mt-1 text-[12px] text-wo-muted">{label}</dd>
                </div>
              </div>
            ))}
          </dl>

          <div className="mt-12">
            <p className="mb-4 text-[10px] font-semibold tracking-[0.2em] text-white/40">
              TRUSTED BY INNOVATORS WORLDWIDE
            </p>
            <div className="flex flex-wrap items-center gap-x-7 gap-y-3 opacity-60">
              {TRUSTED_BY.map((name) => (
                <span key={name} className="text-[13px] font-semibold tracking-tight text-white">
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="relative">
          <HeroVisual />
        </div>
      </div>

      <p className="mx-auto mt-6 flex max-w-[1400px] items-center justify-end gap-3 px-6 text-[11px] font-semibold tracking-[0.3em] text-wo-green/70 lg:px-10">
        <span className="h-px w-10 bg-wo-green/40" aria-hidden />
        BUILD BEYOND SERVERS.
      </p>
    </section>
  );
}
