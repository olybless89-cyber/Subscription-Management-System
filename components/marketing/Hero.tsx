import HeroVisual from './HeroVisual';

import { ShieldCheck, Activity, Users, FileText } from 'lucide-react';

const QUICK_STATS = [
  { icon: ShieldCheck, value: 'Verified', label: 'Payments' },
  { icon: Activity, value: 'Safety-checked', label: 'Suspension' },
  { icon: Users, value: 'Scoped', label: 'Admin access' },
  { icon: FileText, value: 'Full', label: 'Audit log' },
];

export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-white/5 bg-wo-black pb-16 pt-14">
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-14 px-6 lg:grid-cols-2 lg:gap-8 lg:px-10">
        <div>
          <p className="mb-5 text-[12px] font-semibold tracking-[0.25em] text-wo-green">
            BUILT FOR HOSTING PROVIDERS
          </p>
          <h1 className="text-balance text-[44px] font-black uppercase leading-[1.05] tracking-tight text-white sm:text-[56px] lg:text-[60px]">
            One Dashboard
            <br />
            For Every
            <br />
            <span className="text-wo-green">Subscription.</span>
          </h1>
          <p className="mt-6 max-w-[480px] text-[16px] leading-relaxed text-wo-muted">
            Web Oracle Host tracks every customer&apos;s billing cycle, verifies payments, and
            safely suspends or restores their infrastructure automatically — so you can run a
            hosting business without running billing by hand.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-wo-green px-6 py-3.5 text-[15px] font-semibold text-wo-black transition hover:bg-wo-green/90"
            >
              Get started — create your account <span aria-hidden>→</span>
            </a>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-6 py-3.5 text-[15px] font-semibold text-white transition hover:border-white/30"
            >
              See how it works
            </a>
          </div>

          <dl className="mt-10 grid grid-cols-2 gap-y-5 sm:grid-cols-4">
            {QUICK_STATS.map(({ icon: Icon, value, label }) => (
              <div key={label} className="flex items-start gap-2.5">
                <Icon size={16} className="mt-0.5 shrink-0 text-wo-green" strokeWidth={2} />
                <div>
                  <dt className="text-[15px] font-bold leading-none text-white">{value}</dt>
                  <dd className="mt-1 text-[12px] text-wo-muted">{label}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>

        <HeroVisual />
      </div>
    </section>
  );
}
