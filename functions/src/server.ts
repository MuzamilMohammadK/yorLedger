import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app.js';
import { getDatabase } from './db/index.js';

const PORT = process.env.PORT || 5000;

async function bootstrap() {
  await getDatabase(); // Initialize DB connection
  const app = createApp();

  app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`🚀 YorBalance Ledger API running on http://localhost:${PORT}`);
    console.log(`   Health Check: http://localhost:${PORT}/health`);
    console.log(`   Auth API: http://localhost:${PORT}/api/v1/auth`);
    console.log(`   Admin API: http://localhost:${PORT}/api/v1/admin`);
    console.log(`===============================================`);
  });
}

bootstrap().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

