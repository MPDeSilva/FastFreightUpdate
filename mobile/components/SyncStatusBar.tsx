import React from 'react';
import { Text, View, StyleSheet, Pressable } from 'react-native';
import { SyncState } from '../src/sync/useOfflineSync';

export function SyncStatusBar(props: SyncState & { syncNow: () => void }) {
  const dotColor = props.online ? '#16a34a' : '#dc2626';
  const label = props.syncing
    ? 'Syncing…'
    : props.online
    ? 'Online'
    : 'Offline';
  return (
    <Pressable onPress={props.syncNow} style={styles.bar}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.meta}>
        Pending: {props.queueDepth}
        {props.lastSyncedAt
          ? `  ·  Last sync ${new Date(props.lastSyncedAt).toLocaleTimeString()}`
          : ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#0f172a',
    gap: 8,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { color: 'white', fontWeight: '600' },
  meta: { color: '#94a3b8', marginLeft: 'auto', fontSize: 12 },
});
