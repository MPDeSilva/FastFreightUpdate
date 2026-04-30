import { useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system';
import { SyncOp } from '@ffu/shared';
import { api, ApiError } from '../api/client';
import {
  applyServerShipment,
  markShipmentSynced,
} from '../db/shipments';
import {
  applyServerAudit,
  markAuditSynced,
  setAuditBlobUrl,
} from '../db/auditLogs';
import {
  applyServerInvestigation,
  markInvestigationSynced,
} from '../db/investigations';
import {
  backoff,
  deleteQueueRow,
  fetchDue,
  queueDepth,
  QueueRow,
} from '../db/syncQueue';
import { getMeta, setMeta } from '../db/syncMeta';

const POLL_INTERVAL_MS = 30_000;
const CURSOR_KEY = 'sync.cursor';

export interface SyncState {
  online: boolean;
  syncing: boolean;
  queueDepth: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export function useOfflineSync(): SyncState & { syncNow: () => void } {
  const [state, setState] = useState<SyncState>({
    online: false,
    syncing: false,
    queueDepth: 0,
    lastSyncedAt: null,
    lastError: null,
  });
  const running = useRef(false);

  const tick = async () => {
    if (running.current) return;
    running.current = true;
    setState((s) => ({ ...s, syncing: true, lastError: null }));
    try {
      await pushPhase();
      await pullPhase();
      const depth = await queueDepth();
      setState((s) => ({
        ...s,
        syncing: false,
        queueDepth: depth,
        lastSyncedAt: new Date().toISOString(),
      }));
    } catch (e: any) {
      setState((s) => ({
        ...s,
        syncing: false,
        lastError: e?.message ?? String(e),
      }));
    } finally {
      running.current = false;
    }
  };

  useEffect(() => {
    const sub = NetInfo.addEventListener((s) => {
      const online = !!s.isInternetReachable;
      setState((p) => ({ ...p, online }));
      if (online) void tick();
    });
    const id = setInterval(() => void tick(), POLL_INTERVAL_MS);
    void tick();
    return () => {
      sub();
      clearInterval(id);
    };
  }, []);

  return { ...state, syncNow: () => void tick() };
}

async function pushPhase(): Promise<void> {
  const due = await fetchDue();
  if (due.length === 0) return;

  // Upload blobs first (mutates each op's payload to include image_blob_url).
  for (const row of due) {
    const op = JSON.parse(row.payload_json) as SyncOp;
    if (op.kind === 'insert_audit' && op.row.image_path && !op.row.image_blob_url) {
      try {
        const sas = await api.blobSas({
          filename: `audits/${op.row.worker_id}/${op.row.id}.jpg`,
          content_type: 'image/jpeg',
        });
        await api.putBlob(sas.upload_url, op.row.image_path, 'image/jpeg');
        op.row.image_blob_url = sas.blob_url;
        await setAuditBlobUrl(op.row.id, sas.blob_url);
        // persist mutated payload back
        row.payload_json = JSON.stringify(op);
      } catch (e: any) {
        await backoff(row.id, e?.message ?? 'blob upload failed');
        continue;
      }
    }
  }

  const ops: SyncOp[] = due.map((r) => JSON.parse(r.payload_json) as SyncOp);
  let res;
  try {
    res = await api.syncBatch({ ops });
  } catch (e: any) {
    for (const r of due) await backoff(r.id, e?.message ?? 'batch failed');
    throw e;
  }

  for (let i = 0; i < res.results.length; i++) {
    const result = res.results[i];
    const queued = due[i];
    const op = ops[i];
    if (result.status === 'ok') {
      await markRowSynced(op);
      await deleteQueueRow(queued.id);
    } else if (result.status === 'conflict' && result.server_row) {
      // server is authoritative under LWW — apply server version locally
      await applyServerForOp(op, result.server_row);
      await deleteQueueRow(queued.id);
    } else {
      await backoff(queued.id, result.error ?? 'unknown');
    }
  }

  await setMeta(CURSOR_KEY, res.cursor);
}

async function pullPhase(): Promise<void> {
  const cursor = (await getMeta(CURSOR_KEY)) ?? '1970-01-01T00:00:00Z';
  let changes;
  try {
    changes = await api.syncChanges(cursor);
  } catch (e) {
    if (e instanceof ApiError && e.status >= 500) return;
    throw e;
  }
  for (const s of changes.shipments) await applyServerShipment(s);
  for (const a of changes.audit_logs) await applyServerAudit(a);
  for (const i of changes.investigations) await applyServerInvestigation(i);
  await setMeta(CURSOR_KEY, changes.cursor);
}

async function markRowSynced(op: SyncOp): Promise<void> {
  if (op.kind === 'upsert_shipment') await markShipmentSynced(op.row.equipment_id);
  else if (op.kind === 'insert_audit') await markAuditSynced(op.row.id);
  else if (op.kind === 'upsert_investigation') await markInvestigationSynced(op.row.id);
}

async function applyServerForOp(op: SyncOp, serverRow: any): Promise<void> {
  if (op.kind === 'upsert_shipment') await applyServerShipment(serverRow);
  else if (op.kind === 'insert_audit') await applyServerAudit(serverRow);
  else if (op.kind === 'upsert_investigation') await applyServerInvestigation(serverRow);
}

// Avoids unused-import warnings in some bundlers
void FileSystem;
