import { AuditLog } from '@ffu/shared';
import { getDb } from './index';

export async function insertLocalAudit(row: AuditLog): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO audit_logs (id, equipment_id, worker_id, action, notes, image_path,
       image_blob_url, signature_blob_url, timestamp, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      row.id,
      row.equipment_id,
      row.worker_id,
      row.action,
      row.notes,
      row.image_path,
      row.image_blob_url,
      row.signature_blob_url,
      row.timestamp,
      row.updated_at,
    ]
  );
}

export async function listAuditsForItem(equipment_id: string): Promise<AuditLog[]> {
  const db = await getDb();
  return db.getAllAsync<AuditLog>(
    `SELECT id, equipment_id, worker_id, action, notes, image_path, image_blob_url,
            signature_blob_url, timestamp, updated_at
       FROM audit_logs WHERE equipment_id = ? ORDER BY timestamp DESC`,
    [equipment_id]
  );
}

export async function setAuditBlobUrl(id: string, blobUrl: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE audit_logs SET image_blob_url = ? WHERE id = ?`,
    [blobUrl, id]
  );
}

export async function markAuditSynced(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE audit_logs SET sync_status = 'synced' WHERE id = ?`, [id]);
}

export async function applyServerAudit(row: AuditLog): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO audit_logs (id, equipment_id, worker_id, action, notes, image_path,
       image_blob_url, signature_blob_url, timestamp, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced')
     ON CONFLICT(id) DO UPDATE SET
       notes = excluded.notes,
       image_blob_url = excluded.image_blob_url,
       signature_blob_url = excluded.signature_blob_url,
       updated_at = excluded.updated_at,
       sync_status = 'synced'
     WHERE excluded.updated_at > audit_logs.updated_at`,
    [
      row.id,
      row.equipment_id,
      row.worker_id,
      row.action,
      row.notes,
      row.image_path,
      row.image_blob_url,
      row.signature_blob_url,
      row.timestamp,
      row.updated_at,
    ]
  );
}
