import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

if (isProd && (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith('change-me'))) {
  throw new Error('JWT_SECRET must be set to a strong value in production');
}

export const config = {
  isProd,
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/support_agent',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()),
  aiTemperature: Number(process.env.AI_TEMPERATURE ?? 0.3),
  aiMaxTokens: Number(process.env.AI_MAX_TOKENS ?? 500),
  openrouterKey: process.env.OPENROUTER_API_KEY || '',
  // Tried in order; the next one is used when a model is rate-limited, down, or returns nothing.
  openrouterModels: (
    process.env.OPENROUTER_MODELS ||
    process.env.OPENROUTER_MODEL ||
    'nvidia/nemotron-3-ultra-550b-a55b:free,nvidia/nemotron-3.5-lightning:free,baidu/ernie-5.5-flash-preview:free'
  )
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean),
};
