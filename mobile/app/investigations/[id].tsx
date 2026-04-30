import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Constants from 'expo-constants';
import { v4 as uuidv4 } from 'uuid';
import { AuditLog, Investigation } from '@ffu/shared';
import { SyncStatusBar } from '../../components/SyncStatusBar';
import { useOfflineSync } from '../../src/sync/useOfflineSync';
import {
  getInvestigation,
  upsertLocalInvestigation,
} from '../../src/db/investigations';
import { insertLocalAudit, listAuditsForItem } from '../../src/db/auditLogs';
import { enqueue } from '../../src/db/syncQueue';

const extra = (Constants.expoConfig?.extra ?? {}) as { demoWorkerId?: string };
const WORKER_ID = extra.demoWorkerId ?? 'worker-local';

export default function InvestigationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sync = useOfflineSync();
  const [inv, setInv] = useState<Investigation | null>(null);
  const [audits, setAudits] = useState<AuditLog[]>([]);

  const reload = async () => {
    if (!id) return;
    const i = await getInvestigation(id);
    setInv(i);
    if (i) setAudits(await listAuditsForItem(i.item_id));
  };

  useEffect(() => {
    void reload();
  }, [id, sync.lastSyncedAt]);

  const resolve = async () => {
    if (!inv) return;
    const now = new Date().toISOString();
    const updated: Investigation = {
      ...inv,
      resolution_status: 'Resolved',
      updated_at: now,
    };
    await upsertLocalInvestigation(updated);
    await enqueue({ kind: 'upsert_investigation', row: updated });
    const audit: AuditLog = {
      id: uuidv4(),
      equipment_id: inv.item_id,
      worker_id: WORKER_ID,
      action: 'investigation_resolved',
      notes: `Resolved investigation ${inv.id}`,
      image_path: null,
      image_blob_url: null,
      signature_blob_url: null,
      timestamp: now,
      updated_at: now,
    };
    await insertLocalAudit(audit);
    await enqueue({ kind: 'insert_audit', row: audit });
    sync.syncNow();
    await reload();
  };

  if (!inv) {
    return (
      <View>
        <SyncStatusBar {...sync} />
        <Text style={styles.empty}>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <SyncStatusBar {...sync} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={styles.h1}>{inv.issue_description}</Text>
        <Text style={styles.meta}>
          Status: {inv.resolution_status} · opened{' '}
          {new Date(inv.opened_at).toLocaleString()}
        </Text>

        <View style={styles.card}>
          <Text style={styles.h2}>Management Response</Text>
          {inv.management_response ? (
            <Text style={styles.body}>{inv.management_response}</Text>
          ) : (
            <Text style={styles.pending}>
              Awaiting response from operations…
            </Text>
          )}
        </View>

        <Pressable
          onPress={resolve}
          disabled={inv.resolution_status === 'Resolved'}
          style={[
            styles.resolve,
            inv.resolution_status === 'Resolved' && { opacity: 0.4 },
          ]}
        >
          <Text style={styles.resolveText}>
            {inv.resolution_status === 'Resolved'
              ? 'Resolved'
              : 'Mark as Resolved (item physically found)'}
          </Text>
        </Pressable>

        <Text style={styles.h2}>Item history</Text>
        {audits.length === 0 && <Text style={styles.empty}>No audit logs yet.</Text>}
        {audits.map((a) => (
          <View key={a.id} style={styles.card}>
            <Text style={styles.body}>{a.action}</Text>
            <Text style={styles.meta}>
              {new Date(a.timestamp).toLocaleString()} · {a.worker_id}
            </Text>
            {a.notes && <Text style={styles.body}>{a.notes}</Text>}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 18, fontWeight: '700' },
  h2: { fontSize: 14, fontWeight: '700', marginTop: 8 },
  meta: { color: '#64748b', fontSize: 12 },
  card: { backgroundColor: 'white', borderRadius: 10, padding: 12, gap: 4 },
  body: { color: '#0f172a' },
  pending: { color: '#b45309', fontStyle: 'italic' },
  resolve: {
    backgroundColor: '#16a34a',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  resolveText: { color: 'white', fontWeight: '700' },
  empty: { color: '#64748b', textAlign: 'center', marginTop: 40 },
});
