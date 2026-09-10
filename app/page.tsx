export default function HomePage() {
  return (
    <main style={{ padding: '3rem', maxWidth: 640 }}>
      <h1>Web Oracle Host</h1>
      <p>
        This deployment is live. The billing/suspension engine, payment webhooks, auth, and cron
        endpoints are running under <code>/api</code> — the admin and customer dashboards haven&apos;t
        been built yet.
      </p>
      <p>
        See <code>/api/health</code> for a status check once that route is added, and the
        project README for what&apos;s implemented so far.
      </p>
    </main>
  );
}
