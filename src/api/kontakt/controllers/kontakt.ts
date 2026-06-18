/**
 * Kontakt — odbiera zgłoszenie z formularza wyceny (statyczna strona Astro)
 * i przekazuje je e-mailem przez Resend. Nic nie zapisujemy w bazie — endpoint
 * jest bezstanowym pośrednikiem, którego jedynym zadaniem jest trzymać klucz
 * Resend po stronie serwera (nie może trafić do przeglądarki).
 *
 * Wymagane zmienne środowiskowe:
 *   RESEND_API_KEY      — klucz API z panelu Resend.
 *   CONTACT_FROM_EMAIL  — nadawca, na zweryfikowanej domenie
 *                         (np. "Szostak Projekt <formularz@damiankaplon.site>").
 *   CONTACT_TO_EMAIL    — adres, na który mają trafiać zgłoszenia.
 */

import type { Context } from 'koa';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Sprowadza wartość do oczyszczonego stringa o ograniczonej długości.
function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

// Ucieczka znaków HTML — treść od użytkownika trafia do maila jako HTML.
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

    // Honeypot: ukryte pole „company". Wypełnia je tylko bot — udajemy sukces,
    // żeby nie podpowiadać, że zgłoszenie zostało odrzucone.
    if (clean(body.company, 100)) {
      ctx.body = { ok: true };
      return;
    }

    const name = clean(body.name, 200);
    const email = clean(body.email, 200);
    const phone = clean(body.phone, 60);
    const type = clean(body.type, 200);
    const message = clean(body.message, 5000);

    if (!name || !email) {
      return ctx.badRequest('Imię i e-mail są wymagane.');
    }
    if (!EMAIL_RE.test(email)) {
      return ctx.badRequest('Nieprawidłowy adres e-mail.');
    }

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.CONTACT_FROM_EMAIL;
    const to = process.env.CONTACT_TO_EMAIL;
    if (!apiKey || !from || !to) {
      strapi.log.error(
        'Kontakt: brak konfiguracji Resend (RESEND_API_KEY / CONTACT_FROM_EMAIL / CONTACT_TO_EMAIL).'
      );
      return ctx.internalServerError('Wysyłka nie jest skonfigurowana.');
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
      strapi.log.error(`Kontakt: Resend zwrócił ${res.status}: ${detail}`);
      return ctx.internalServerError('Nie udało się wysłać wiadomości.');
    }

    ctx.body = { ok: true };
  },
};
