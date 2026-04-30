import { v4 as uuidv4 } from 'uuid';
import { SyncOp } from '@ffu/shared';
import { getDb } from './index';

export interface QueueRow {
  id: string;
  entity_type: string;
  entity_id: string;
  op: string;
  payload_json: string;
  attempt_count: number;
  last_error: string | null;
  next_attempt_at: string;
  created_at: string;
}

export async function enqueue(op: SyncOp): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  const entityId =
    op.kind === 'insert_audit'
      ? op.row.id
      : op.kind === 'upsert_investigation'
      ? op.row.id
      : op.row.equipment_id;
  await db.runAsync(
    `INSERT INTO sync_queue (id, entity_type, entity_id, op, payload_json,
        attempt_count, last_error, next_attempt_at, created_at)
     VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?)`,
    [uuidv4(), op.kind, entityId, op.kind, JSON.stringify(op), now, now]
  );
}

export async function fetchDue(limit = 25): Promise<QueueRow[]> {
  const db = await getDb();
  const now = new Date().toISOString();
  return db.getAllAsync<QueueRow>(
    `SELECT * FROM sync_queue WHERE next_attempt_at <= ? ORDER BY created_at LIMIT ?`,
    [now, limit]
  );
}

export async function deleteQueueRow(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM sync_queue WHERE id = ?`, [id]);
}

export async function backoff(id: string, error: string): Promise<void> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ attempt_count: number }>(
    `SELECT attempt_count FROM sync_queue WHERE id = ?`,
    [id]
  );
  const attempt = (r?.attempt_count ?? 0) + 1;
  const delayMs = Math.min(5 * 60_000, 1000 * Math.pow(2, attempt));
  const next = new Date(Date.now() + delayMs).toISOString();
  await db.runAsync(
    `UPDATE sync_queue SET attempt_count = ?, last_error = ?, next_attempt_at = ? WHERE id = ?`,
    [attempt, error, next, id]
  );
}

export async function queueDepth(): Promise<number> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM sync_queue`
  );
  return r?.c ?? 0;
}
