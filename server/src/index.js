import mongoose from 'mongoose';
import { config } from './config.js';
import { createApp } from './app.js';

mongoose
  .connect(config.mongoUri)
  .then(() => createApp().listen(config.port, () => console.log(`Server listening on :${config.port}`)))
  .catch((e) => {
    console.error('MongoDB connection failed:', e.message);
    process.exit(1);
  });
