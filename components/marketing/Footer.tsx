const NAV = ['Product', 'Solutions', 'Developers', 'Resources', 'Company'];
const LEGAL = ['Privacy', 'Terms', 'Contact'];

export default function Footer() {
  return (
    <footer className="border-t border-white/5 bg-wo-black py-12">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-8 px-6 lg:flex-row lg:items-center lg:justify-between lg:px-10">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-wo-green to-wo-greenDark text-[11px] font-black text-wo-black">
              W
            </span>
            <span className="text-[13px] font-bold text-white">Web Oracle Host</span>
          </div>
          <p className="mt-1 text-[11px] tracking-wide text-white/40">Cloud Beyond Limits</p>
        </div>

        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-white/60">
          {NAV.map((item) => (
            <a key={item} href="#" className="hover:text-white">
              {item}
            </a>
          ))}
        </nav>

        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-white/40">
          {LEGAL.map((item) => (
            <a key={item} href="#" className="hover:text-white/70">
              {item}
            </a>
          ))}
        </div>
      </div>
      <p className="mx-auto mt-8 max-w-[1400px] px-6 text-[11px] text-white/30 lg:px-10">
        © 2026 Web Oracle Host. All rights reserved.
      </p>
    </footer>
  );
}
