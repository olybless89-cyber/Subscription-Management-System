export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-white/5 bg-wo-black pb-16 pt-14">
      <div className="mx-auto max-w-[760px] px-6 lg:px-10">
        <h1 className="text-balance text-[44px] font-black uppercase leading-[1.05] tracking-tight text-white sm:text-[56px]">
          One Dashboard
          <br />
          For Every
          <br />
          <span className="text-wo-green">Subscription.</span>
        </h1>
        <p className="mt-6 max-w-[520px] text-[16px] leading-relaxed text-wo-muted">
          Track every customer&apos;s billing cycle, verify payments, and manage subscriptions
          from one place.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <a
            href="/register"
            className="inline-flex items-center gap-2 rounded-lg bg-wo-green px-6 py-3.5 text-[15px] font-semibold text-wo-black transition hover:bg-wo-green/90"
          >
            Get started — create your account <span aria-hidden>→</span>
          </a>
          <a
            href="/client/login"
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-6 py-3.5 text-[15px] font-semibold text-white transition hover:border-white/30"
          >
            Log in
          </a>
        </div>
      </div>
    </section>
  );
}
