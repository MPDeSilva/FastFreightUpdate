import { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { Investigation } from '@ffu/shared';
import { SyncStatusBar } from '../../components/SyncStatusBar';
import { useOfflineSync } from '../../src/sync/useOfflineSync';
import { listInvestigations } from '../../src/db/investigations';

export default function InvestigationsScreen() {
  const sync = useOfflineSync();
  const [rows, setRows] = useState<Investigation[]>([]);

  const reload = async () => setRows(await listInvestigations());
  useEffect(() => {
    void reload();
  }, [sync.lastSyncedAt]);

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <SyncStatusBar {...sync} />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => (
          <Link href={`/investigations/${item.id}`} asChild>
            <Pressable style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.issue_description}
                </Text>
                <StatusPill status={item.resolution_status} />
              </View>
              <Text style={styles.meta}>
                Item {item.item_id.slice(0, 8)} · opened{' '}
                {new Date(item.opened_at).toLocaleString()}
              </Text>
              {item.management_response && (
                <Text style={styles.response} numberOfLines={2}>
                  Response: {item.management_response}
                </Text>
              )}
            </Pressable>
          </Link>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No investigations open.</Text>
        }
      />
    </View>
  );
}

function StatusPill({ status }: { status: Investigation['resolution_status'] }) {
  const colors: Record<Investigation['resolution_status'], string> = {
    PendingResponse: '#f59e0b',
    Open: '#0ea5e9',
    Responded: '#6366f1',
    Resolved: '#16a34a',
  };
  return (
    <View style={[styles.pill, { backgroundColor: colors[status] }]}>
      <Text style={styles.pillText}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    margin: 12,
    padding: 14,
    backgroundColor: 'white',
    borderRadius: 10,
    gap: 6,
    elevation: 1,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { flex: 1, fontWeight: '600' },
  meta: { color: '#64748b', fontSize: 12 },
  response: { color: '#1e293b' },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillText: { color: 'white', fontWeight: '600', fontSize: 11 },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 40 },
});
