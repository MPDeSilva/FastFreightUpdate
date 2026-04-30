IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'workers')
BEGIN
  CREATE TABLE workers (
    id          UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    entra_oid   NVARCHAR(64) NOT NULL UNIQUE,
    name        NVARCHAR(200) NOT NULL,
    created_at  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'shipments')
BEGIN
  CREATE TABLE shipments (
    equipment_id  UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    description   NVARCHAR(500) NOT NULL,
    stand_number  NVARCHAR(50) NOT NULL,
    status        NVARCHAR(20) NOT NULL CHECK (status IN ('Arrived','Unpacked','Delivered','Missing')),
    updated_at    DATETIME2 NOT NULL
  );
  CREATE INDEX IX_shipments_updated_at ON shipments(updated_at);
  CREATE INDEX IX_shipments_status ON shipments(status);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'audit_logs')
BEGIN
  CREATE TABLE audit_logs (
    id                  UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    equipment_id        UNIQUEIDENTIFIER NOT NULL,
    worker_id           NVARCHAR(64) NOT NULL,
    action              NVARCHAR(100) NOT NULL,
    notes               NVARCHAR(MAX) NULL,
    image_blob_url      NVARCHAR(1000) NULL,
    signature_blob_url  NVARCHAR(1000) NULL,
    [timestamp]         DATETIME2 NOT NULL,
    updated_at          DATETIME2 NOT NULL
  );
  CREATE INDEX IX_audit_updated_at ON audit_logs(updated_at);
  CREATE INDEX IX_audit_equipment  ON audit_logs(equipment_id);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'investigations')
BEGIN
  CREATE TABLE investigations (
    id                   UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    item_id              UNIQUEIDENTIFIER NOT NULL,
    issue_description    NVARCHAR(MAX) NOT NULL,
    management_response  NVARCHAR(MAX) NULL,
    resolution_status    NVARCHAR(20) NOT NULL CHECK (resolution_status IN ('Open','PendingResponse','Responded','Resolved')),
    opened_at            DATETIME2 NOT NULL,
    updated_at           DATETIME2 NOT NULL
  );
  CREATE INDEX IX_investigations_updated_at ON investigations(updated_at);
  CREATE INDEX IX_investigations_status ON investigations(resolution_status);
END;
GO
