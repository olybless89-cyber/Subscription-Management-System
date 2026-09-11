import { describe, it, expect, afterEach } from 'vitest';
import { buildRenewalUrl } from '@/lib/customers/renewal-link';

describe('buildRenewalUrl', () => {
  const originalAppUrl = process.env.APP_URL;
  afterEach(() => {
    if (originalAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = originalAppUrl;
  });

  it('builds an absolute URL from APP_URL, keyed by customerCode', () => {
    process.env.APP_URL = 'https://subscription-management-system-production-22e9.up.railway.app';

    expect(buildRenewalUrl('WOH-000042')).toBe(
      'https://subscription-management-system-production-22e9.up.railway.app/renew/WOH-000042'
    );
  });

  it('strips a trailing slash on APP_URL rather than producing a double slash', () => {
    process.env.APP_URL = 'https://example.com/';

    expect(buildRenewalUrl('WOH-000001')).toBe('https://example.com/renew/WOH-000001');
  });

  it('falls back to a relative path when APP_URL is not configured, rather than throwing', () => {
    delete process.env.APP_URL;

    expect(buildRenewalUrl('WOH-000001')).toBe('/renew/WOH-000001');
  });

  it('URL-encodes the customer code', () => {
    process.env.APP_URL = 'https://example.com';

    expect(buildRenewalUrl('WOH 000001')).toBe('https://example.com/renew/WOH%20000001');
  });
});
