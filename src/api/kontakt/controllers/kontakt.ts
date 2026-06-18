/**
 * Kontakt — receives a quote-request submission (static Astro site) and forwards
 * it by e-mail via Resend. Nothing is persisted in the database — this endpoint
 * is a stateless proxy whose only job is to keep the Resend API key server-side
 * (it must never reach the browser).
 *
 * Required environment variables:
 *   RESEND_API_KEY      — API key from the Resend dashboard.
 *   CONTACT_FROM_EMAIL  — sender on a verified domain
 *                         (e.g. "Szostak Projekt <formularz@szostak.net.pl>").
 *   CONTACT_TO_EMAIL    — address that submissions should be delivered to.
 *
 * Optional anti-spam:
 *   TURNSTILE_SECRET    — Cloudflare Turnstile secret key. When set, every
 *                         submission must carry a valid Turnstile token,
 *                         verified server-side before the e-mail is sent.
 */

import type { Context } from 'koa';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const TURNSTILE_ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Coerces a value into a trimmed string capped at a maximum length.
function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

// Verifies a Cloudflare Turnstile token against the siteverify API. `remoteip`
// is the real client IP (CF-Connecting-IP), since behind a Cloudflare Tunnel
// Strapi otherwise only sees the tunnel's address.
async function verifyTurnstile(
  secret: string,
  token: string,
  remoteip?: string
): Promise<boolean> {
  if (!token) return false;
  const params = new URLSearchParams({ secret, response: token });
  if (remoteip) params.append('remoteip', remoteip);

  try {
    const res = await fetch(TURNSTILE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    strapi.log.error(`Kontakt: Turnstile verification request failed: ${err}`);
    return false;
  }
}

// Escapes HTML — user-provided content is embedded into the e-mail as HTML.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default {
  async send(ctx: Context) {
    const body = (ctx.request.body ?? {}) as Record<string, unknown>;

    // Honeypot: the hidden "company" field. Only bots fill it in — we fake a
    // success response so as not to hint that the submission was rejected.
    if (clean(body.company, 100)) {
      ctx.body = { ok: true };
      return;
    }

    // Turnstile gate: enforced only when a secret is configured, so the endpoint
    // keeps working in setups without Turnstile. A missing/invalid token is
    // rejected before any e-mail is sent.
    const turnstileSecret = process.env.TURNSTILE_SECRET;
    if (turnstileSecret) {
      const token = clean(body['cf-turnstile-response'], 5000);
      const ip = ctx.request.header['cf-connecting-ip'];
      const ok = await verifyTurnstile(
        turnstileSecret,
        token,
        typeof ip === 'string' ? ip : undefined
      );
      if (!ok) {
        return ctx.badRequest('Captcha verification failed.');
      }
    }

    const name = clean(body.name, 200);
    const email = clean(body.email, 200);
    const phone = clean(body.phone, 60);
    const type = clean(body.type, 200);
    const message = clean(body.message, 5000);

    if (!name || !email) {
      return ctx.badRequest('Name and e-mail are required.');
    }
    if (!EMAIL_RE.test(email)) {
      return ctx.badRequest('Invalid e-mail address.');
    }

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.CONTACT_FROM_EMAIL;
    const to = process.env.CONTACT_TO_EMAIL;
    if (!apiKey || !from || !to) {
      strapi.log.error(
        'Kontakt: missing Resend configuration (RESEND_API_KEY / CONTACT_FROM_EMAIL / CONTACT_TO_EMAIL).'
      );
      return ctx.internalServerError('Sending is not configured.');
    }

    const rows: [string, string][] = [
      ['Imię i nazwisko', name],
      ['E-mail', email],
      ['Telefon', phone || '—'],
      ['Rodzaj inwestycji', type || '—'],
    ];
    const html = `
      <h2>Nowe zapytanie o wycenę</h2>
      <table cellpadding="6" style="border-collapse:collapse">
        ${rows
          .map(
            ([k, v]) =>
              `<tr><td style="font-weight:bold;padding-right:12px">${escapeHtml(
                k
              )}</td><td>${escapeHtml(v)}</td></tr>`
          )
          .join('')}
      </table>
      <h3>Opis projektu</h3>
      <p style="white-space:pre-wrap">${escapeHtml(message) || '—'}</p>
    `;

    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        reply_to: email,
        subject: `Zapytanie o wycenę — ${name}`,
        html,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      strapi.log.error(`Kontakt: Resend returned ${res.status}: ${detail}`);
      return ctx.internalServerError('Failed to send the message.');
    }

    ctx.body = { ok: true };
  },
};
