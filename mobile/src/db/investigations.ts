import { Investigation } from '@ffu/shared';
import { getDb } from './index';
import { pickWinner } from './lww';

export async function upsertLocalInvestigation(row: Investigation): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO investigations (id, item_id, issue_description, management_response,
        resolution_status, opened_at, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
     ON CONFLICT(id) DO UPDATE SET
        issue_description = excluded.issue_description,
        management_response = excluded.management_response,
        resolution_status = excluded.resolution_status,
        updated_at = excluded.updated_at,
        sync_status = 'pending'`,
    [
      row.id,
      row.item_id,
      row.issue_description,
      row.management_response,
      row.resolution_status,
      row.opened_at,
      row.updated_at,
    ]
  );
}

export async function getInvestigation(id: string): Promise<Investigation | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<Investigation>(
    `SELECT id, item_id, issue_description, management_response, resolution_status,
            opened_at, updated_at FROM investigations WHERE id = ?`,
    [id]
  );
  return r ?? null;
}

export async function listInvestigations(): Promise<Investigation[]> {
  const db = await getDb();
  return db.getAllAsync<Investigation>(
    `SELECT id, item_id, issue_description, management_response, resolution_status,
            opened_at, updated_at FROM investigations
     ORDER BY CASE resolution_status
       WHEN 'PendingResponse' THEN 0
       WHEN 'Open' THEN 1
       WHEN 'Responded' THEN 2
       WHEN 'Resolved' THEN 3 END, opened_at DESC`
  );
}

export async function applyServerInvestigation(row: Investigation): Promise<void> {
  const db = await getDb();
  const local = await getInvestigation(row.id);
  const winner = pickWinner(local, row, local?.id ?? '', row.id);
  if (winner === local) return;
  await db.runAsync(
    `INSERT INTO investigations (id, item_id, issue_description, management_response,
        resolution_status, opened_at, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'synced')
     ON CONFLICT(id) DO UPDATE SET
        issue_description = excluded.issue_description,
        management_response = excluded.management_response,
        resolution_status = excluded.resolution_status,
        updated_at = excluded.updated_at,
        sync_status = 'synced'`,
    [
      row.id,
      row.item_id,
      row.issue_description,
      row.management_response,
      row.resolution_status,
      row.opened_at,
      row.updated_at,
    ]
  );
}

export async function markInvestigationSynced(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE investigations SET sync_status = 'synced' WHERE id = ?`, [id]);
}
