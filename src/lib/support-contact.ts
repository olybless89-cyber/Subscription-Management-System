/**
 * Support contact info shown on the public suspended/renewal pages —
 * configured once via Railway env vars (SUPPORT_EMAIL / SUPPORT_WHATSAPP)
 * rather than a new admin settings screen, the same pattern this app
 * already uses for APP_URL, RAILWAY_API_TOKEN, WHATSAPP_ACCESS_TOKEN,
 * etc. Both are optional and independent — a customer sees only the
 * channels that are actually configured, never a broken/empty link.
 *
 * SUPPORT_WHATSAPP accepts any human-typed format ("+234 801 234
 * 5678", "234-801-234-5678", ...) — digits are extracted and built
 * into a wa.me link, which requires digits-only, full international
 * format with no leading "+" or "00".
 */
export interface SupportContact {
  email: string | null;
  whatsappUrl: string | null;
}

export function getSupportContact(): SupportContact {
  const email = process.env.SUPPORT_EMAIL?.trim() || null;

  const rawWhatsapp = process.env.SUPPORT_WHATSAPP?.trim() ?? '';
  const digits = rawWhatsapp.replace(/[^0-9]/g, '');

  return {
    email,
    whatsappUrl: digits ? `https://wa.me/${digits}` : null,
  };
}
