export default function FinalCTA() {
  return (
    <section className="relative overflow-hidden border-t border-white/5 bg-wo-black py-24 text-center">
      <div className="absolute left-1/2 top-0 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-radial-fade blur-3xl" />
      <div className="relative mx-auto max-w-[640px] px-6">
        <p className="mb-4 text-[11px] font-semibold tracking-[0.25em] text-wo-green">
          READY TO BUILD?
        </p>
        <h2 className="text-[32px] font-bold leading-tight text-white sm:text-[38px]">
          Launch your ideas on Web Oracle Host.
        </h2>
        <p className="mt-4 text-[15px] text-wo-muted">
          Join thousands of developers and businesses building without limits.
        </p>
        <a
          href="/signup"
          className="mt-8 inline-flex items-center gap-2 rounded-lg bg-wo-green px-7 py-3.5 text-[15px] font-semibold text-wo-black transition hover:bg-wo-green/90"
        >
          Get Started Free <span aria-hidden>→</span>
        </a>
        <p className="mt-3 text-[12px] text-wo-muted">No credit card required.</p>
      </div>
    </section>
  );
}
