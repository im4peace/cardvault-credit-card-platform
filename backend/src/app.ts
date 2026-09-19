import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config/index.js';
import { errorHandler } from './api/middleware/index.js';
import { authRouter } from './api/routes/auth.js';
import { customerRouter } from './api/routes/customer.js';
import { officerRouter } from './api/routes/officer.js';

export function createApp(options: { trustProxy?: number } = {}): express.Express {
  const app = express();
  app.set('trust proxy', options.trustProxy ?? config.trustProxy);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '64kb' }));
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/auth', authRouter);
  app.use('/officer', officerRouter);
  app.use('/', customerRouter);
  app.use(errorHandler);
  return app;
}
