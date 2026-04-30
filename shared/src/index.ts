export type UUID = string;
export type ISODateTime = string;

export type ShipmentStatus = 'Arrived' | 'Unpacked' | 'Delivered' | 'Missing';

export type ResolutionStatus =
  | 'Open'
  | 'PendingResponse'
  | 'Responded'
  | 'Resolved';

export type SyncStatus = 'pending' | 'synced' | 'conflict';

export interface Shipment {
  equipment_id: UUID;
  description: string;
  stand_number: string;
  status: ShipmentStatus;
  updated_at: ISODateTime;
}

export interface AuditLog {
  id: UUID;
  equipment_id: UUID;
  worker_id: UUID;
  action: string;
  notes: string | null;
  image_path: string | null;
  image_blob_url: string | null;
  signature_blob_url: string | null;
  timestamp: ISODateTime;
  updated_at: ISODateTime;
}

export interface Investigation {
  id: UUID;
  item_id: UUID;
  issue_description: string;
  management_response: string | null;
  resolution_status: ResolutionStatus;
  opened_at: ISODateTime;
  updated_at: ISODateTime;
}

export type SyncOp =
  | { kind: 'upsert_shipment'; row: Shipment }
  | { kind: 'insert_audit'; row: AuditLog }
  | { kind: 'upsert_investigation'; row: Investigation };

export interface SyncBatchRequest {
  ops: SyncOp[];
}

export interface SyncBatchResultItem {
  op_index: number;
  status: 'ok' | 'conflict';
  server_row?: Shipment | AuditLog | Investigation;
  error?: string;
}

export interface SyncBatchResponse {
  results: SyncBatchResultItem[];
  cursor: ISODateTime;
}

export interface SyncChangesResponse {
  shipments: Shipment[];
  audit_logs: AuditLog[];
  investigations: Investigation[];
  cursor: ISODateTime;
}

export interface BlobSasRequest {
  filename: string;
  content_type: string;
}

export interface BlobSasResponse {
  upload_url: string;
  blob_url: string;
  expires_at: ISODateTime;
}
