import express from 'express'; // imported here so Vercel's Express entrypoint detection finds this file
import mongoose from 'mongoose';
import { config } from './config.js';
import { createApp } from './createApp.js';

// One shared connection promise: reused across requests (and across warm serverless invocations).
let connecting;
const connect = () =>
  (connecting ??= mongoose.connect(config.mongoUri).catch((e) => {
    connecting = undefined; // allow a retry on the next request
    throw e;
  }));

const app = createApp({ app: express(), ensureDb: (_req, _res, next) => connect().then(() => next(), next) });

// On Vercel the platform runs the exported app; elsewhere (Docker, local) we listen ourselves.
if (!process.env.VERCEL) {
  connect()
    .then(() => app.listen(config.port, () => console.log(`Server listening on :${config.port}`)))
    .catch((e) => {
      console.error('MongoDB connection failed:', e.message);
      process.exit(1);
    });
}

export default app;
