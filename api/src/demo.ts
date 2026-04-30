/**
 * Demo server — local-only, no Azure, no Entra.
 *
 * Runs the same /api/sync, /api/blob, /api/investigations endpoints as the
 * production server but uses better-sqlite3 on disk and bypasses auth so the
 * mobile app can be demoed end-to-end with `npm run demo` from the root.
 */
import express from 'express';
import cors from 'cors';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
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

const DB_PATH = process.env.DEMO_DB_PATH ?? path.join(__dirname, '..', 'demo.db');
const PORT = Number(process.env.PORT ?? 3000);

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS shipments (
  equipment_id TEXT PRIMARY KEY NOT NULL,
  description  TEXT NOT NULL,
  stand_number TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('Arrived','Unpacked','Delivered','Missing')),
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ship_updated ON shipments(updated_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id                 TEXT PRIMARY KEY NOT NULL,
  equipment_id       TEXT NOT NULL,
  worker_id          TEXT NOT NULL,
  action             TEXT NOT NULL,
  notes              TEXT,
  image_blob_url     TEXT,
  signature_blob_url TEXT,
  timestamp          TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_updated ON audit_logs(updated_at);

CREATE TABLE IF NOT EXISTS investigations (
  id                  TEXT PRIMARY KEY NOT NULL,
  item_id             TEXT NOT NULL,
  issue_description   TEXT NOT NULL,
  management_response TEXT,
  resolution_status   TEXT NOT NULL CHECK (resolution_status IN ('Open','PendingResponse','Responded','Resolved')),
  opened_at           TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inv_updated ON investigations(updated_at);
`);

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use('/demo-blobs', express.static(path.join(__dirname, '..', 'demo-blobs')));

// --- Schemas (same shape as prod) ---
const shipmentSchema = z.object({
  equipment_id: z.string(),
  description: z.string(),
  stand_number: z.string(),
  status: z.enum(['Arrived', 'Unpacked', 'Delivered', 'Missing']),
  updated_at: z.string(),
});
const auditSchema = z.object({
  id: z.string(),
  equipment_id: z.string(),
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
  id: z.string(),
  item_id: z.string(),
  issue_description: z.string(),
  management_response: z.string().nullable(),
  resolution_status: z.enum(['Open', 'PendingResponse', 'Responded', 'Resolved']),
  opened_at: z.string(),
  updated_at: z.string(),
});
const batchSchema = z.object({
  ops: z.array(
    z.union([
      z.object({ kind: z.literal('upsert_shipment'), row: shipmentSchema }),
      z.object({ kind: z.literal('insert_audit'), row: auditSchema }),
      z.object({ kind: z.literal('upsert_investigation'), row: investigationSchema }),
    ])
  ).max(200),
});

// --- Routes ---
app.get('/health', (_req, res) => res.json({ ok: true, mode: 'demo' }));

app.post('/api/sync/batch', (req, res) => {
  const parsed = batchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body: SyncBatchRequest = parsed.data;
  const results: SyncBatchResultItem[] = [];
  for (let i = 0; i < body.ops.length; i++) {
    try {
      const r = applyOp(body.ops[i]);
      results.push({ op_index: i, status: r.status, server_row: r.serverRow });
      if (r.status === 'ok') logEvent(body.ops[i]);
    } catch (e: any) {
      results.push({ op_index: i, status: 'conflict', error: e?.message });
    }
  }
  const response: SyncBatchResponse = { results, cursor: new Date().toISOString() };
  res.json(response);
});

app.get('/api/sync/changes', (req, res) => {
  const since = String(req.query.since ?? '1970-01-01T00:00:00Z');
  const shipments = db.prepare(
    `SELECT equipment_id, description, stand_number, status, updated_at
       FROM shipments WHERE updated_at > ? ORDER BY updated_at`
  ).all(since) as Shipment[];
  const audit_logs = db.prepare(
    `SELECT id, equipment_id, worker_id, action, notes, NULL AS image_path,
            image_blob_url, signature_blob_url, timestamp, updated_at
       FROM audit_logs WHERE updated_at > ? ORDER BY updated_at`
  ).all(since) as AuditLog[];
  const investigations = db.prepare(
    `SELECT id, item_id, issue_description, management_response, resolution_status,
            opened_at, updated_at
       FROM investigations WHERE updated_at > ? ORDER BY updated_at`
  ).all(since) as Investigation[];
  const response: SyncChangesResponse = {
    shipments,
    audit_logs,
    investigations,
    cursor: new Date().toISOString(),
  };
  res.json(response);
});

app.post('/api/blob/sas', (req, res) => {
  // Demo: return a fake SAS pointing at our local upload endpoint.
  const filename = String(req.body?.filename ?? 'unnamed');
  const blobUrl = `http://localhost:${PORT}/demo-blobs/${filename}`;
  res.json({
    upload_url: `http://localhost:${PORT}/api/blob/upload/${encodeURIComponent(filename)}`,
    blob_url: blobUrl,
    expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
  });
});

app.put('/api/blob/upload/:filename(*)', express.raw({ type: '*/*', limit: '20mb' }), (req, res) => {
  const dir = path.join(__dirname, '..', 'demo-blobs');
  fs.mkdirSync(dir, { recursive: true });
  const safe = req.params.filename.replace(/[^a-zA-Z0-9._/-]/g, '_');
  const full = path.join(dir, safe);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, req.body);
  res.status(201).end();
});

app.post('/api/investigations/:id/response', (req, res) => {
  const schema = z.object({ management_response: z.string().min(1).max(4000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const now = new Date().toISOString();
  const result = db.prepare(
    `UPDATE investigations
        SET management_response = ?, resolution_status = 'Responded', updated_at = ?
      WHERE id = ?`
  ).run(parsed.data.management_response, now, req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'investigation not found' });
    return;
  }
  console.log(`[realtime] investigation ${req.params.id} updated_at=${now}`);
  res.json({ ok: true, updated_at: now });
});

// Demo helper: list everything in the DB at a glance.
app.get('/api/demo/state', (_req, res) => {
  res.json({
    shipments: db.prepare(`SELECT * FROM shipments ORDER BY stand_number, description`).all(),
    audit_logs: db.prepare(`SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 50`).all(),
    investigations: db.prepare(`SELECT * FROM investigations ORDER BY opened_at DESC`).all(),
  });
});

// --- Apply / LWW ---
interface ApplyResult {
  status: 'ok' | 'conflict';
  serverRow?: Shipment | AuditLog | Investigation;
}

function applyOp(op: SyncOp): ApplyResult {
  if (op.kind === 'upsert_shipment') return upsertShipment(op.row);
  if (op.kind === 'upsert_investigation') return upsertInvestigation(op.row);
  return insertAudit(op.row);
}

function upsertShipment(row: Shipment): ApplyResult {
  const current = db.prepare(
    `SELECT equipment_id, description, stand_number, status, updated_at
       FROM shipments WHERE equipment_id = ?`
  ).get(row.equipment_id) as Shipment | undefined;
  if (current && current.updated_at >= row.updated_at) {
    return { status: 'conflict', serverRow: current };
  }
  db.prepare(
    `INSERT INTO shipments (equipment_id, description, stand_number, status, updated_at)
     VALUES (@equipment_id, @description, @stand_number, @status, @updated_at)
     ON CONFLICT(equipment_id) DO UPDATE SET
       description = excluded.description,
       stand_number = excluded.stand_number,
       status = excluded.status,
       updated_at = excluded.updated_at`
  ).run(row);
  return { status: 'ok', serverRow: row };
}

function insertAudit(row: AuditLog): ApplyResult {
  db.prepare(
    `INSERT OR IGNORE INTO audit_logs
       (id, equipment_id, worker_id, action, notes, image_blob_url,
        signature_blob_url, timestamp, updated_at)
     VALUES (@id, @equipment_id, @worker_id, @action, @notes, @image_blob_url,
             @signature_blob_url, @timestamp, @updated_at)`
  ).run({
    id: row.id,
    equipment_id: row.equipment_id,
    worker_id: row.worker_id,
    action: row.action,
    notes: row.notes,
    image_blob_url: row.image_blob_url,
    signature_blob_url: row.signature_blob_url,
    timestamp: row.timestamp,
    updated_at: row.updated_at,
  });
  return { status: 'ok', serverRow: row };
}

function upsertInvestigation(row: Investigation): ApplyResult {
  const current = db.prepare(
    `SELECT id, item_id, issue_description, management_response, resolution_status,
            opened_at, updated_at FROM investigations WHERE id = ?`
  ).get(row.id) as Investigation | undefined;
  if (current && current.updated_at >= row.updated_at) {
    return { status: 'conflict', serverRow: current };
  }
  db.prepare(
    `INSERT INTO investigations (id, item_id, issue_description, management_response,
        resolution_status, opened_at, updated_at)
     VALUES (@id, @item_id, @issue_description, @management_response,
             @resolution_status, @opened_at, @updated_at)
     ON CONFLICT(id) DO UPDATE SET
       issue_description = excluded.issue_description,
       management_response = excluded.management_response,
       resolution_status = excluded.resolution_status,
       updated_at = excluded.updated_at`
  ).run(row);
  return { status: 'ok', serverRow: row };
}

function logEvent(op: SyncOp): void {
  const summary =
    op.kind === 'upsert_shipment'
      ? `${op.kind} ${op.row.equipment_id} -> ${op.row.status}`
      : op.kind === 'insert_audit'
      ? `${op.kind} ${op.row.action} on ${op.row.equipment_id}`
      : `${op.kind} ${op.row.id} -> ${op.row.resolution_status}`;
  console.log(`[realtime] ${summary}`);
}

app.listen(PORT, () => {
  console.log(`\n  FastFreight Update — DEMO API`);
  console.log(`  Listening on http://localhost:${PORT}`);
  console.log(`  SQLite DB:   ${DB_PATH}`);
  console.log(`  State view:  http://localhost:${PORT}/api/demo/state`);
  console.log(`  Tip: from another terminal, run \`npm run demo:seed -w @ffu/api\` to load sample data.\n`);
});
