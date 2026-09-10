export default function HomePage() {
  return (
    <main style={{ padding: '3rem', maxWidth: 640, fontFamily: 'var(--font-ui)' }}>
      <h1>Web Oracle Host</h1>
      <p>
        This deployment is live. The billing/suspension engine, payment webhooks, auth, and cron
        endpoints are running under <code>/api</code>.
      </p>
      <p>
        <a href="/login" className="btn btn-primary">Admin sign in</a>
      </p>
      <p>
        See <code>/api/health</code> for a status check, and the project README for what&apos;s
        implemented so far.
      </p>
    </main>
  );
}
