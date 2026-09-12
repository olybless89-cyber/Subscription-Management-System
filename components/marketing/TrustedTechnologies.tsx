const TECHS = ['Next.js', 'Laravel', 'Docker', 'AWS', 'Vercel', 'Cloudflare'];

export default function TrustedTechnologies() {
  return (
    <section className="border-t border-white/5 bg-wo-black py-16">
      <div className="mx-auto max-w-[1400px] px-6 text-center lg:px-10">
        <p className="mb-8 text-[11px] font-semibold tracking-[0.25em] text-white/40">
          TRUSTED BY INNOVATORS WORLDWIDE
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 opacity-50">
          {TECHS.map((name) => (
            <span key={name} className="text-[15px] font-semibold tracking-tight text-white">
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
