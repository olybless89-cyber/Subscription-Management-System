import { Cloud, Box, Database, ShieldCheck, Globe, Code2 } from 'lucide-react';

const FEATURES = [
  { title: 'Cloud Hosting', desc: 'Fast, reliable and globally distributed.', icon: Cloud },
  { title: 'One-Click Deploy', desc: 'Get your apps running in minutes.', icon: Box },
  { title: 'Managed Databases', desc: 'PostgreSQL, MySQL and more.', icon: Database },
  {
    title: 'Security First',
    desc: 'SSL, DDoS protection and automated backups.',
    icon: ShieldCheck,
  },
  { title: 'Global Network', desc: 'Closer to your users worldwide.', icon: Globe },
  { title: 'Developer Friendly', desc: 'Powerful APIs, CLI and integrations.', icon: Code2 },
];

export default function Features() {
  return (
    <section className="bg-wo-light py-20 text-wo-text">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="mb-3 text-[11px] font-semibold tracking-[0.2em] text-wo-greenDark">
              BUILT FOR MODERN BUILDERS
            </p>
            <h2 className="max-w-[520px] text-[32px] font-bold leading-tight text-wo-text">
              Everything you need to launch and grow.
            </h2>
            <p className="mt-3 max-w-[480px] text-[14px] text-wo-text/60">
              From websites to complex applications, Web Oracle Host gives you the tools,
              infrastructure and support to build without limits.
            </p>
          </div>
          <a href="#" className="text-[13px] font-semibold text-wo-greenDark hover:underline">
            Explore all features →
          </a>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ title, desc, icon: Icon }) => (
            <div
              key={title}
              className="rounded-xl border border-black/5 bg-white p-6 shadow-sm transition hover:shadow-md"
            >
              <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-wo-greenDark/10 text-wo-greenDark">
                <Icon size={18} />
              </span>
              <h3 className="text-[15px] font-semibold text-wo-text">{title}</h3>
              <p className="mt-1 text-[13px] text-wo-text/60">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
