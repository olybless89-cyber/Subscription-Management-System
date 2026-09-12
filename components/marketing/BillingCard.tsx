export default function BillingCard() {
  const percent = 68;
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="rounded-xl border border-white/5 bg-[#0a1512] p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-white">Billing &amp; Subscription</h3>
        <a href="#" className="text-[11px] font-medium text-wo-green hover:underline">
          Manage →
        </a>
      </div>

      <div className="flex items-center gap-4">
        <svg width="56" height="56" viewBox="0 0 56 56" className="shrink-0 -rotate-90">
          <circle cx="28" cy="28" r={radius} fill="none" stroke="#16281f" strokeWidth="6" />
          <circle
            cx="28"
            cy="28"
            r={radius}
            fill="none"
            stroke="#2af598"
            strokeWidth="6"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <div>
          <p className="text-[12.5px] font-semibold text-white">Pro Plan</p>
          <p className="text-[13px] font-bold text-wo-green">₦25,000 / month</p>
          <p className="text-[11px] text-wo-muted">Next billing date Jan 1, 2025</p>
        </div>
      </div>

      <button
        type="button"
        className="mt-4 w-full rounded-lg border border-white/10 py-2 text-[12px] font-semibold text-white transition hover:border-white/25"
      >
        View Billing Details
      </button>
    </div>
  );
}
