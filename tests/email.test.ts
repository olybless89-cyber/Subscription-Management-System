import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendEmail, subjectForEvent } from '@/lib/notifications/email';

describe('sendEmail', () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.EMAIL_FROM;

  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.EMAIL_FROM = 'noreply@digitalweboracleict.com';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
    if (originalFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = originalFrom;
  });

  it('sends successfully and posts the right shape to the Resend API', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://api.resend.com/emails');
      expect(init.headers).toMatchObject({ Authorization: 'Bearer re_test_key' });
      const body = JSON.parse(init.body as string);
      expect(body).toEqual({
        from: 'noreply@digitalweboracleict.com',
        to: 'customer@example.com',
        subject: 'Test subject',
        text: 'Test body',
      });
      return new Response(JSON.stringify({ id: 'email_123' }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendEmail({ to: 'customer@example.com', subject: 'Test subject', text: 'Test body' });

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns success: false (never throws) when Resend responds with an error status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('invalid recipient', { status: 422 }))
    );

    const result = await sendEmail({ to: 'bad', subject: 'x', text: 'y' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/422/);
  });

  it('returns success: false (never throws) on a network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNRESET');
      })
    );

    const result = await sendEmail({ to: 'customer@example.com', subject: 'x', text: 'y' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ECONNRESET/);
  });

  it('returns success: false without attempting a network call when unconfigured', async () => {
    delete process.env.RESEND_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendEmail({ to: 'customer@example.com', subject: 'x', text: 'y' });

    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('subjectForEvent', () => {
  it('returns a specific subject for each known event', () => {
    expect(subjectForEvent('SUSPENDED')).toMatch(/suspended/i);
    expect(subjectForEvent('RESTORED')).toMatch(/restored/i);
    expect(subjectForEvent('PAYMENT_RECEIVED')).toMatch(/payment/i);
  });

  it('falls back to a generic subject for an unknown event rather than an empty string', () => {
    expect(subjectForEvent('SOME_FUTURE_EVENT')).toBe('Web Oracle Host notification');
  });
});
