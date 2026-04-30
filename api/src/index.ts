import express from 'express';
import cors from 'cors';
import { syncRouter } from './routes/sync';
import { blobRouter } from './routes/blob';
import { investigationsRouter } from './routes/investigations';
import { runMigrations } from './db/bootstrap';

async function main(): Promise<void> {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/sync', syncRouter);
  app.use('/api/blob', blobRouter);
  app.use('/api/investigations', investigationsRouter);

  if (process.env.SQL_SERVER) {
    try {
      await runMigrations();
      console.log('migrations applied');
    } catch (e) {
      console.error('migration error', e);
    }
  } else {
    console.warn('SQL_SERVER not set — skipping migrations (dev mode)');
  }

  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => console.log(`api listening on :${port}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
