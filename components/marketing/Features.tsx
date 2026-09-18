import { CreditCard, Users, Landmark, Mail, FileText, ClipboardList } from 'lucide-react';

const FEATURES = [
  {
    title: 'Automated billing & suspension',
    desc: 'Subscriptions move through trial, due, and grace periods automatically, with safety-checked suspension and restoration against real infrastructure — never a guess.',
    icon: CreditCard,
  },
  {
    title: 'Scoped admin access',
    desc: 'Assign customers to specific admins so each one manages their own book independently, while full oversight stays with you.',
    icon: Users,
  },
  {
    title: 'Multi-provider payments',
    desc: 'Route different customer groups to different payment providers, with every transaction verified server-side before it is ever marked paid.',
    icon: Landmark,
  },
  {
    title: 'Built-in customer communication',
    desc: 'Automated notifications, birthday messages, and custom one-off emails all go out under your own brand.',
    icon: Mail,
  },
  {
    title: 'Invoices & receipts',
    desc: 'Sequential, auto-generated PDF receipts and due invoices — no separate invoicing tool required.',
    icon: FileText,
  },
  {
    title: 'Full activity audit log',
    desc: 'Every suspend, restore, and admin action is recorded — visible to you, however many admins you delegate to.',
    icon: ClipboardList,
  },
];

export default function Features() {
  return (
    <section id="features" className="bg-wo-light py-20 text-wo-text">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="mb-3 text-[11px] font-semibold tracking-[0.2em] text-wo-greenDark">
              EVERYTHING A HOSTING BUSINESS NEEDS
            </p>
            <h2 className="max-w-[520px] text-[32px] font-bold leading-tight text-wo-text">
              One system for every customer&apos;s subscription.
            </h2>
            <p className="mt-3 max-w-[480px] text-[14px] text-wo-text/60">
              Built for providers who are done stitching together spreadsheets, payment
              dashboards, and manual infrastructure logins.
            </p>
          </div>
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
