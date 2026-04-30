import { Shipment } from '@ffu/shared';
import { getDb } from './index';
import { pickWinner } from './lww';

export async function upsertLocalShipment(row: Shipment): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO shipments (equipment_id, description, stand_number, status, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, 'pending')
     ON CONFLICT(equipment_id) DO UPDATE SET
       description = excluded.description,
       stand_number = excluded.stand_number,
       status = excluded.status,
       updated_at = excluded.updated_at,
       sync_status = 'pending'`,
    [row.equipment_id, row.description, row.stand_number, row.status, row.updated_at]
  );
}

export async function getShipment(equipment_id: string): Promise<Shipment | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<Shipment>(
    'SELECT equipment_id, description, stand_number, status, updated_at FROM shipments WHERE equipment_id = ?',
    [equipment_id]
  );
  return r ?? null;
}

export async function listShipmentsByStand(): Promise<Shipment[]> {
  const db = await getDb();
  return db.getAllAsync<Shipment>(
    'SELECT equipment_id, description, stand_number, status, updated_at FROM shipments ORDER BY stand_number, description'
  );
}

export async function applyServerShipment(row: Shipment): Promise<void> {
  const db = await getDb();
  const local = await getShipment(row.equipment_id);
  const winner = pickWinner(local, row, local?.equipment_id ?? '', row.equipment_id);
  if (winner === local) return;
  await db.runAsync(
    `INSERT INTO shipments (equipment_id, description, stand_number, status, updated_at, sync_status)
     VALUES (?, ?, ?, ?, ?, 'synced')
     ON CONFLICT(equipment_id) DO UPDATE SET
       description = excluded.description,
       stand_number = excluded.stand_number,
       status = excluded.status,
       updated_at = excluded.updated_at,
       sync_status = 'synced'`,
    [row.equipment_id, row.description, row.stand_number, row.status, row.updated_at]
  );
}

export async function markShipmentSynced(equipment_id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE shipments SET sync_status = 'synced' WHERE equipment_id = ?`,
    [equipment_id]
  );
}
