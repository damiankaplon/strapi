/**
 * Public route for the contact form.
 *
 * `auth: false` — the endpoint is called from the public, static site without a
 * token. This disables authentication and the Public role's permission check,
 * so nothing needs to be configured in the admin panel. It accepts POST only and
 * is handled by a dedicated controller (validation + sending via Resend).
 */
export default {
  routes: [
    {
      method: 'POST',
      path: '/kontakt',
      handler: 'kontakt.send',
      config: {
        auth: false,
      },
    },
  ],
};
