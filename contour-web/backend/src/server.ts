import cors from 'cors';
import express from 'express';
import { CONFIG } from './config.js';
import routes from './routes.js';

const app = express();

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json({ limit: '5mb' }));

app.use('/api', routes);

app.listen(CONFIG.PORT, () => {
  console.log(`Contour backend running on http://localhost:${CONFIG.PORT}`);
});
