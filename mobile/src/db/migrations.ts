export const migration001 = `
CREATE TABLE IF NOT EXISTS shipments (
  equipment_id   TEXT PRIMARY KEY NOT NULL,
  description    TEXT NOT NULL,
  stand_number   TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('Arrived','Unpacked','Delivered','Missing')),
  updated_at     TEXT NOT NULL,
  sync_status    TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);
CREATE INDEX IF NOT EXISTS idx_shipments_stand  ON shipments(stand_number);

CREATE TABLE IF NOT EXISTS audit_logs (
  id                 TEXT PRIMARY KEY NOT NULL,
  equipment_id       TEXT NOT NULL,
  worker_id          TEXT NOT NULL,
  action             TEXT NOT NULL,
  notes              TEXT,
  image_path         TEXT,
  image_blob_url     TEXT,
  signature_blob_url TEXT,
  timestamp          TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  sync_status        TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS idx_audit_equipment ON audit_logs(equipment_id);

CREATE TABLE IF NOT EXISTS investigations (
  id                  TEXT PRIMARY KEY NOT NULL,
  item_id             TEXT NOT NULL,
  issue_description   TEXT NOT NULL,
  management_response TEXT,
  resolution_status   TEXT NOT NULL CHECK (resolution_status IN ('Open','PendingResponse','Responded','Resolved')),
  opened_at           TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  sync_status         TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS idx_investigations_status ON investigations(resolution_status);
CREATE INDEX IF NOT EXISTS idx_investigations_item   ON investigations(item_id);

CREATE TABLE IF NOT EXISTS sync_queue (
  id              TEXT PRIMARY KEY NOT NULL,
  entity_type     TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  op              TEXT NOT NULL,
  payload_json    TEXT NOT NULL,
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  next_attempt_at TEXT NOT NULL,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sync_queue_next ON sync_queue(next_attempt_at);

CREATE TABLE IF NOT EXISTS sync_meta (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`;
