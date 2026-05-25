import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { CONFIG } from './config.js';
import routes from './routes.js';

const app = express();

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json({ limit: '5mb' }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

app.use('/api', routes);

const server = app.listen(CONFIG.PORT, () => {
  console.log(`Contour backend running on http://localhost:${CONFIG.PORT}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  console.log('SIGINT received, closing server...');
  server.close(() => process.exit(0));
});
