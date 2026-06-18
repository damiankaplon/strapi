import type { Core } from '@strapi/strapi';

// Origin(y) dopuszczone do API. Lista z env CORS_ORIGINS (po przecinku),
// np. "https://szostak.net.pl,http://localhost:4321". Domyślnie '*' — formularz
// kontaktowy działa wtedy z dowolnej domeny; w produkcji warto zawęzić.
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
  : ['*'];

const config: Core.Config.Middlewares = [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  {
    name: 'strapi::cors',
    config: {
      origin: corsOrigins,
    },
  },
  'strapi::poweredBy',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];

export default config;
