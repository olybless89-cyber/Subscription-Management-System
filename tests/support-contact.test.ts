import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getSupportContact } from '@/lib/support-contact';

describe('getSupportContact', () => {
  const originalEmail = process.env.SUPPORT_EMAIL;
  const originalWhatsapp = process.env.SUPPORT_WHATSAPP;

  beforeEach(() => {
    delete process.env.SUPPORT_EMAIL;
    delete process.env.SUPPORT_WHATSAPP;
  });

  afterEach(() => {
    if (originalEmail === undefined) delete process.env.SUPPORT_EMAIL;
    else process.env.SUPPORT_EMAIL = originalEmail;
    if (originalWhatsapp === undefined) delete process.env.SUPPORT_WHATSAPP;
    else process.env.SUPPORT_WHATSAPP = originalWhatsapp;
  });

  it('returns nulls for both channels when neither env var is set', () => {
    expect(getSupportContact()).toEqual({ email: null, whatsappUrl: null });
  });

  it('trims and returns a configured support email', () => {
    process.env.SUPPORT_EMAIL = '  help@example.com  ';
    expect(getSupportContact().email).toBe('help@example.com');
  });

  it('treats an empty/whitespace-only email as unset', () => {
    process.env.SUPPORT_EMAIL = '   ';
    expect(getSupportContact().email).toBeNull();
  });

  it('builds a wa.me link from a plain digit string', () => {
    process.env.SUPPORT_WHATSAPP = '2348012345678';
    expect(getSupportContact().whatsappUrl).toBe('https://wa.me/2348012345678');
  });

  it('strips spaces, +, and dashes from a human-typed number', () => {
    process.env.SUPPORT_WHATSAPP = '+234 801 234 5678';
    expect(getSupportContact().whatsappUrl).toBe('https://wa.me/2348012345678');

    process.env.SUPPORT_WHATSAPP = '234-801-234-5678';
    expect(getSupportContact().whatsappUrl).toBe('https://wa.me/2348012345678');
  });

  it('treats an empty/whitespace-only WhatsApp value as unset', () => {
    process.env.SUPPORT_WHATSAPP = '   ';
    expect(getSupportContact().whatsappUrl).toBeNull();
  });

  it('returns both channels together when both are configured', () => {
    process.env.SUPPORT_EMAIL = 'help@example.com';
    process.env.SUPPORT_WHATSAPP = '2348012345678';
    expect(getSupportContact()).toEqual({
      email: 'help@example.com',
      whatsappUrl: 'https://wa.me/2348012345678',
    });
  });
});
