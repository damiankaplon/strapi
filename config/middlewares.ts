import type { Core } from '@strapi/strapi';

// Origins allowed to call the API. Read from the CORS_ORIGINS env var
// (comma-separated), e.g. "https://szostak.net.pl,http://localhost:4321".
// Defaults to '*' — the contact form then works from any domain; worth
// narrowing in production.
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
