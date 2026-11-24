import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chat.js';

export function createApp({ rateLimits = true } = {}) {
  const app = express();
  app.set('trust proxy', 1); // behind nginx / hosting proxy
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '20kb' }));

  const limiter = (windowMs, max, error) =>
    rateLimits
      ? rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, message: { error } })
      : (_req, _res, next) => next();

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/auth', limiter(15 * 60_000, 30, 'Too many auth attempts, try again later'), authRoutes);
  app.use('/chat/send', limiter(60_000, 15, 'Slow down: too many messages'));
  app.use('/chat', chatRoutes);

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}
