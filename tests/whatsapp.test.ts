import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendWhatsAppMessage, DEFAULT_TEMPLATE_NAME, DEFAULT_TEMPLATE_LANGUAGE } from '@/lib/notifications/whatsapp';

describe('sendWhatsAppMessage', () => {
  const originalToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const originalPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  beforeEach(() => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'test_token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1234567890';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalToken === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN;
    else process.env.WHATSAPP_ACCESS_TOKEN = originalToken;
    if (originalPhoneId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhoneId;
  });

  it('sends successfully and posts the right template shape to the Graph API', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://graph.facebook.com/v21.0/1234567890/messages');
      expect(init.headers).toMatchObject({ Authorization: 'Bearer test_token' });
      const body = JSON.parse(init.body as string);
      expect(body.messaging_product).toBe('whatsapp');
      expect(body.to).toBe('2348012345678');
      expect(body.type).toBe('template');
      expect(body.template.name).toBe(DEFAULT_TEMPLATE_NAME);
      expect(body.template.language.code).toBe(DEFAULT_TEMPLATE_LANGUAGE);
      expect(body.template.components[0].parameters[0].text).toBe('Your subscription is due.');
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.abc' }] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendWhatsAppMessage({ to: '+2348012345678', body: 'Your subscription is due.' });

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns success: false (never throws) when Meta responds with an error status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('template not approved', { status: 400 }))
    );

    const result = await sendWhatsAppMessage({ to: '+2348012345678', body: 'test' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/400/);
  });

  it('returns success: false (never throws) on a network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNRESET');
      })
    );

    const result = await sendWhatsAppMessage({ to: '+2348012345678', body: 'test' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ECONNRESET/);
  });

  it('returns success: false without attempting a network call when unconfigured', async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendWhatsAppMessage({ to: '+2348012345678', body: 'test' });

    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an empty/invalid phone number without a network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendWhatsAppMessage({ to: '   ', body: 'test' });

    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
