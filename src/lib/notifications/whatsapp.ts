export interface SendWhatsAppInput {
  /** Phone number in international format, e.g. "+2348012345678". */
  to: string;
  /** The single body parameter — this project routes every WhatsApp
   * send through ONE generic utility template with exactly one {{1}}
   * placeholder (see DEFAULT_TEMPLATE_NAME below), so this is always
   * just "the message text" rather than a positional parameter array.
   */
  body: string;
}

export interface SendWhatsAppResult {
  success: boolean;
  error?: string;
}

/**
 * The one WhatsApp template this whole system is built around. Meta
 * requires ALL messages sent outside a 24-hour customer-initiated
 * window to use a pre-approved template — arbitrary free text is
 * rejected by the API. Rather than requiring a separate template (and a
 * separate Meta approval submission) for every message type — payment
 * due, birthday, campaign, etc — every send in this codebase uses this
 * ONE template with a single {{1}} body variable, and the "type of
 * message" is just whatever text gets passed as that variable.
 *
 * You (the business owner) need to create and get this exact template
 * approved in Meta Business Manager before ANY WhatsApp message can
 * send — see the README for the exact submission text. Suggested
 * category: Utility (not Marketing — Marketing templates face stricter
 * review and opt-in requirements).
 */
export const DEFAULT_TEMPLATE_NAME = 'general_notification';
export const DEFAULT_TEMPLATE_LANGUAGE = 'en_US';

const GRAPH_API_VERSION = 'v21.0';

/**
 * sendWhatsAppMessage — thin wrapper over Meta's Graph API, same
 * "no SDK for one fetch call" approach as paystack.ts and email.ts.
 *
 * Deliberately NEVER throws — same contract as sendEmail(). Missing
 * config, an unapproved template, a bad phone number, or a Meta outage
 * all degrade to "message not sent" rather than crashing whatever
 * triggered the send.
 */
export async function sendWhatsAppMessage(input: SendWhatsAppInput): Promise<SendWhatsAppResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    return { success: false, error: 'WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID not configured' };
  }

  const to = input.to.replace(/^\+/, '').replace(/[^0-9]/g, '');
  if (!to) {
    return { success: false, error: 'Invalid phone number' };
  }

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: DEFAULT_TEMPLATE_NAME,
          language: { code: DEFAULT_TEMPLATE_LANGUAGE },
          components: [
            {
              type: 'body',
              parameters: [{ type: 'text', text: input.body }],
            },
          ],
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { success: false, error: `WhatsApp API returned ${res.status}: ${body}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error sending WhatsApp message' };
  }
}
