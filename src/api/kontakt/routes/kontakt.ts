/**
 * Publiczna trasa formularza kontaktowego.
 *
 * `auth: false` — endpoint jest wołany z publicznej, statycznej strony bez
 * tokena. Wyłącza to uwierzytelnianie i sprawdzanie uprawnień roli Public,
 * więc nie trzeba nic konfigurować w panelu. Przyjmuje wyłącznie POST i jest
 * obsłużony przez dedykowany kontroler (walidacja + wysyłka przez Resend).
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
