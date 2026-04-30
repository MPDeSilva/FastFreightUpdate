import { Router } from 'express';
import { z } from 'zod';
import {
  AuditLog,
  Investigation,
  Shipment,
  SyncBatchRequest,
  SyncBatchResponse,
  SyncBatchResultItem,
  SyncChangesResponse,
  SyncOp,
} from '@ffu/shared';
import { getPool, sql } from '../db/pool';
import { requireAuth } from '../auth/entra';
import { publish } from '../realtime/signalr';

export const syncRouter = Router();

const shipmentSchema = z.object({
  equipment_id: z.string().uuid(),
  description: z.string(),
  stand_number: z.string(),
  status: z.enum(['Arrived', 'Unpacked', 'Delivered', 'Missing']),
  updated_at: z.string(),
});
const auditSchema = z.object({
  id: z.string().uuid(),
  equipment_id: z.string().uuid(),
  worker_id: z.string(),
  action: z.string(),
  notes: z.string().nullable(),
  image_path: z.string().nullable(),
  image_blob_url: z.string().nullable(),
  signature_blob_url: z.string().nullable(),
  timestamp: z.string(),
  updated_at: z.string(),
});
const investigationSchema = z.object({
  id: z.string().uuid(),
  item_id: z.string().uuid(),
  issue_description: z.string(),
  management_response: z.string().nullable(),
  resolution_status: z.enum(['Open', 'PendingResponse', 'Responded', 'Resolved']),
  opened_at: z.string(),
  updated_at: z.string(),
});
const opSchema = z.union([
  z.object({ kind: z.literal('upsert_shipment'), row: shipmentSchema }),
  z.object({ kind: z.literal('insert_audit'), row: auditSchema }),
  z.object({ kind: z.literal('upsert_investigation'), row: investigationSchema }),
]);
const batchSchema = z.object({ ops: z.array(opSchema).max(200) });

syncRouter.post('/batch', requireAuth, async (req, res) => {
  const parsed = batchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body: SyncBatchRequest = parsed.data;
  const pool = await getPool();
  const results: SyncBatchResultItem[] = [];

  for (let i = 0; i < body.ops.length; i++) {
    const op = body.ops[i];
    try {
      const r = await applyOp(pool, op);
      results.push({ op_index: i, status: r.status, server_row: r.serverRow });
      if (r.status === 'ok') await publishForOp(op);
    } catch (e: any) {
      results.push({ op_index: i, status: 'conflict', error: e?.message });
    }
  }

  const cursor = new Date().toISOString();
  const response: SyncBatchResponse = { results, cursor };
  res.json(response);
});

syncRouter.get('/changes', requireAuth, async (req, res) => {
  const since = String(req.query.since ?? '1970-01-01T00:00:00Z');
  const pool = await getPool();
  const ships = await pool
    .request()
    .input('since', sql.DateTime2, new Date(since))
    .query<Shipment>(
      `SELECT CAST(equipment_id AS NVARCHAR(36)) AS equipment_id, description, stand_number, status,
              CONVERT(NVARCHAR(33), updated_at, 127) AS updated_at
         FROM shipments WHERE updated_at > @since ORDER BY updated_at`
    );
  const audits = await pool
    .request()
    .input('since', sql.DateTime2, new Date(since))
    .query<AuditLog>(
      `SELECT CAST(id AS NVARCHAR(36)) AS id, CAST(equipment_id AS NVARCHAR(36)) AS equipment_id,
              worker_id, action, notes, NULL AS image_path, image_blob_url, signature_blob_url,
              CONVERT(NVARCHAR(33), [timestamp], 127) AS [timestamp],
              CONVERT(NVARCHAR(33), updated_at, 127) AS updated_at
         FROM audit_logs WHERE updated_at > @since ORDER BY updated_at`
    );
  const inv = await pool
    .request()
    .input('since', sql.DateTime2, new Date(since))
    .query<Investigation>(
      `SELECT CAST(id AS NVARCHAR(36)) AS id, CAST(item_id AS NVARCHAR(36)) AS item_id,
              issue_description, management_response, resolution_status,
              CONVERT(NVARCHAR(33), opened_at, 127) AS opened_at,
              CONVERT(NVARCHAR(33), updated_at, 127) AS updated_at
         FROM investigations WHERE updated_at > @since ORDER BY updated_at`
    );

  const response: SyncChangesResponse = {
    shipments: ships.recordset,
    audit_logs: audits.recordset,
    investigations: inv.recordset,
    cursor: new Date().toISOString(),
  };
  res.json(response);
});

interface ApplyResult {
  status: 'ok' | 'conflict';
  serverRow?: Shipment | AuditLog | Investigation;
}

async function applyOp(
  pool: sql.ConnectionPool,
  op: SyncOp
): Promise<ApplyResult> {
  if (op.kind === 'upsert_shipment') return upsertShipment(pool, op.row);
  if (op.kind === 'upsert_investigation') return upsertInvestigation(pool, op.row);
  return insertAudit(pool, op.row);
}

async function upsertShipment(pool: sql.ConnectionPool, row: Shipment): Promise<ApplyResult> {
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const existing = await new sql.Request(tx)
      .input('id', sql.UniqueIdentifier, row.equipment_id)
      .query<Shipment>(
        `SELECT CAST(equipment_id AS NVARCHAR(36)) AS equipment_id, description, stand_number, status,
                CONVERT(NVARCHAR(33), updated_at, 127) AS updated_at
           FROM shipments WHERE equipment_id = @id`
      );
    const current = existing.recordset[0];
    if (current && current.updated_at >= row.updated_at) {
      await tx.commit();
      return { status: 'conflict', serverRow: current };
    }
    await new sql.Request(tx)
      .input('id', sql.UniqueIdentifier, row.equipment_id)
      .input('description', sql.NVarChar(500), row.description)
      .input('stand', sql.NVarChar(50), row.stand_number)
      .input('status', sql.NVarChar(20), row.status)
      .input('updated_at', sql.DateTime2, new Date(row.updated_at))
      .query(
        `MERGE shipments AS T
         USING (SELECT @id AS equipment_id) AS S
         ON T.equipment_id = S.equipment_id
         WHEN MATCHED THEN UPDATE SET description=@description, stand_number=@stand, status=@status, updated_at=@updated_at
         WHEN NOT MATCHED THEN INSERT (equipment_id, description, stand_number, status, updated_at)
              VALUES (@id, @description, @stand, @status, @updated_at);`
      );
    await tx.commit();
    return { status: 'ok', serverRow: row };
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

async function insertAudit(pool: sql.ConnectionPool, row: AuditLog): Promise<ApplyResult> {
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, row.id)
    .input('eq', sql.UniqueIdentifier, row.equipment_id)
    .input('worker', sql.NVarChar(64), row.worker_id)
    .input('action', sql.NVarChar(100), row.action)
    .input('notes', sql.NVarChar(sql.MAX), row.notes)
    .input('image', sql.NVarChar(1000), row.image_blob_url)
    .input('signature', sql.NVarChar(1000), row.signature_blob_url)
    .input('ts', sql.DateTime2, new Date(row.timestamp))
    .input('updated_at', sql.DateTime2, new Date(row.updated_at))
    .query(
      `IF NOT EXISTS (SELECT 1 FROM audit_logs WHERE id = @id)
         INSERT INTO audit_logs (id, equipment_id, worker_id, action, notes, image_blob_url,
                                 signature_blob_url, [timestamp], updated_at)
         VALUES (@id, @eq, @worker, @action, @notes, @image, @signature, @ts, @updated_at);`
    );
  return { status: 'ok', serverRow: row };
}

async function upsertInvestigation(
  pool: sql.ConnectionPool,
  row: Investigation
): Promise<ApplyResult> {
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const existing = await new sql.Request(tx)
      .input('id', sql.UniqueIdentifier, row.id)
      .query<Investigation>(
        `SELECT CAST(id AS NVARCHAR(36)) AS id, CAST(item_id AS NVARCHAR(36)) AS item_id,
                issue_description, management_response, resolution_status,
                CONVERT(NVARCHAR(33), opened_at, 127) AS opened_at,
                CONVERT(NVARCHAR(33), updated_at, 127) AS updated_at
           FROM investigations WHERE id = @id`
      );
    const current = existing.recordset[0];
    if (current && current.updated_at >= row.updated_at) {
      await tx.commit();
      return { status: 'conflict', serverRow: current };
    }
    await new sql.Request(tx)
      .input('id', sql.UniqueIdentifier, row.id)
      .input('item', sql.UniqueIdentifier, row.item_id)
      .input('issue', sql.NVarChar(sql.MAX), row.issue_description)
      .input('response', sql.NVarChar(sql.MAX), row.management_response)
      .input('status', sql.NVarChar(20), row.resolution_status)
      .input('opened_at', sql.DateTime2, new Date(row.opened_at))
      .input('updated_at', sql.DateTime2, new Date(row.updated_at))
      .query(
        `MERGE investigations AS T
         USING (SELECT @id AS id) AS S
         ON T.id = S.id
         WHEN MATCHED THEN UPDATE SET item_id=@item, issue_description=@issue,
              management_response=@response, resolution_status=@status,
              opened_at=@opened_at, updated_at=@updated_at
         WHEN NOT MATCHED THEN INSERT (id, item_id, issue_description, management_response,
              resolution_status, opened_at, updated_at)
              VALUES (@id, @item, @issue, @response, @status, @opened_at, @updated_at);`
      );
    await tx.commit();
    return { status: 'ok', serverRow: row };
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

async function publishForOp(op: SyncOp): Promise<void> {
  if (op.kind === 'upsert_shipment') {
    await publish({ entity: 'shipment', id: op.row.equipment_id, updated_at: op.row.updated_at });
  } else if (op.kind === 'insert_audit') {
    await publish({ entity: 'audit_log', id: op.row.id, updated_at: op.row.updated_at });
  } else {
    await publish({ entity: 'investigation', id: op.row.id, updated_at: op.row.updated_at });
  }
}
