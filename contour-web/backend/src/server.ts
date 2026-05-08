import cors from 'cors';
import express from 'express';
import { CONFIG } from './config.js';
import routes from './routes.js';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api', routes);

app.listen(CONFIG.PORT, () => {
  console.log(`Contour backend running on http://localhost:${CONFIG.PORT}`);
});
