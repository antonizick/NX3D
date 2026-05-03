import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key} — copy .env.example to .env and fill it in`);
  return v;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

// Lazy getter so dotenv() runs first
function makeConfig() {
  return {
    nodeEnv:       optional('NODE_ENV', 'development'),
    port:          parseInt(optional('PORT', '3001'), 10),
    host:          optional('HOST', '127.0.0.1'),
    jwtSecret:     required('JWT_SECRET'),
    cookieSecret:  required('COOKIE_SECRET'),
    totpIssuer:    optional('TOTP_ISSUER', 'CustomWolf'),
    adminOrigin:   optional('ADMIN_ORIGIN', 'http://localhost:5173'),
    gameOrigin:    optional('GAME_ORIGIN', 'http://localhost:5174'),
    tenantsRoot:   path.resolve(__dirname, optional('TENANTS_ROOT', '../../../tenants')),
    defaultsRoot:  path.resolve(__dirname, optional('TENANTS_ROOT', '../../../tenants'), '_defaults'),
  } as const;
}

// Exported as a getter to ensure dotenv has run first
let _config: ReturnType<typeof makeConfig> | undefined;
export const config = new Proxy({} as ReturnType<typeof makeConfig>, {
  get(_target, prop) {
    if (!_config) _config = makeConfig();
    return _config[prop as keyof ReturnType<typeof makeConfig>];
  },
});
