import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { Shipment, ShipmentStatus } from '@ffu/shared';
import { SyncStatusBar } from '../../components/SyncStatusBar';
import { useOfflineSync } from '../../src/sync/useOfflineSync';
import { listShipmentsByStand } from '../../src/db/shipments';

interface StandGroup {
  stand_number: string;
  counts: Record<ShipmentStatus, number>;
  items: Shipment[];
}

export default function ReconciliationScreen() {
  const sync = useOfflineSync();
  const [groups, setGroups] = useState<StandGroup[]>([]);

  const reload = async () => {
    const rows = await listShipmentsByStand();
    const map = new Map<string, StandGroup>();
    for (const r of rows) {
      const g =
        map.get(r.stand_number) ??
        {
          stand_number: r.stand_number,
          counts: { Arrived: 0, Unpacked: 0, Delivered: 0, Missing: 0 },
          items: [],
        };
      g.counts[r.status]++;
      g.items.push(r);
      map.set(r.stand_number, g);
    }
    setGroups([...map.values()]);
  };

  useEffect(() => {
    void reload();
  }, [sync.lastSyncedAt]);

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <SyncStatusBar {...sync} />
      <FlatList
        data={groups}
        keyExtractor={(g) => g.stand_number}
        refreshControl={
          <RefreshControl
            refreshing={sync.syncing}
            onRefresh={() => {
              sync.syncNow();
              void reload();
            }}
          />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.title}>Stand {item.stand_number}</Text>
            <View style={styles.row}>
              <Pill label="Arrived" value={item.counts.Arrived} color="#0ea5e9" />
              <Pill label="Unpacked" value={item.counts.Unpacked} color="#6366f1" />
              <Pill label="Delivered" value={item.counts.Delivered} color="#16a34a" />
              <Pill label="Missing" value={item.counts.Missing} color="#dc2626" />
            </View>
            {item.items.slice(0, 3).map((it) => (
              <Text key={it.equipment_id} style={styles.itemLine}>
                {it.status} · {it.description}
              </Text>
            ))}
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No shipments yet. Scan items on the Audit tab to populate.
          </Text>
        }
      />
    </View>
  );
}

function Pill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: color }]}>
      <Text style={styles.pillText}>
        {label} {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    margin: 12,
    padding: 14,
    backgroundColor: 'white',
    borderRadius: 10,
    gap: 8,
    elevation: 1,
  },
  title: { fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillText: { color: 'white', fontWeight: '600', fontSize: 12 },
  itemLine: { color: '#334155' },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 40 },
});
