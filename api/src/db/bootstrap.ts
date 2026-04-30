import fs from 'node:fs';
import path from 'node:path';
import { getPool } from './pool';

export async function runMigrations(): Promise<void> {
  const pool = await getPool();
  const dir = path.join(__dirname, 'migrations');
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of files) {
    const sqlText = fs.readFileSync(path.join(dir, f), 'utf8');
    const batches = sqlText.split(/^\s*GO\s*$/im);
    for (const b of batches) {
      const trimmed = b.trim();
      if (trimmed) await pool.request().batch(trimmed);
    }
  }
}
