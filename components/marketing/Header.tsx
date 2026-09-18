import Link from 'next/link';

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-wo-black/80 backdrop-blur">
      <div className="mx-auto flex h-20 max-w-[1400px] items-center justify-between px-6 lg:px-10">
        <Link href="/" className="flex items-center gap-3" aria-label="Subscription Manager home">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-wo-green to-wo-greenDark font-black text-wo-black">
            S
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-[15px] font-bold tracking-tight text-white">Subscription Manager</span>
          </span>
        </Link>

        <div className="flex items-center gap-5">
          <Link
            href="/client/login"
            className="hidden text-[14px] font-medium text-white/80 hover:text-white sm:inline"
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center gap-1.5 rounded-lg bg-wo-green px-5 py-2.5 text-[14px] font-semibold text-wo-black transition hover:bg-wo-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wo-green/60"
          >
            Get Started <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
