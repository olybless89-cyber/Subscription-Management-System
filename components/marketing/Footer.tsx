export default function Footer() {
  return (
    <footer className="border-t border-white/5 bg-wo-black py-10">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-wo-green to-wo-greenDark text-[11px] font-black text-wo-black">
            S
          </span>
          <span className="text-[13px] font-bold text-white">Subscription Manager</span>
        </div>
        <p className="mt-4 text-[11px] text-white/30">
          © 2026 Digital Web Oracle ICT. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
