import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, TextInput } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import Constants from 'expo-constants';
import { v4 as uuidv4 } from 'uuid';
import { ShipmentStatus } from '@ffu/shared';
import { SyncStatusBar } from '../../components/SyncStatusBar';
import { useOfflineSync } from '../../src/sync/useOfflineSync';
import { getShipment, upsertLocalShipment } from '../../src/db/shipments';
import { insertLocalAudit } from '../../src/db/auditLogs';
import { upsertLocalInvestigation } from '../../src/db/investigations';
import { enqueue } from '../../src/db/syncQueue';

const STATUSES: ShipmentStatus[] = ['Arrived', 'Unpacked', 'Delivered', 'Missing'];
const extra = (Constants.expoConfig?.extra ?? {}) as { demoWorkerId?: string };
// In production this comes from the Entra `oid` claim; keep a placeholder until login is wired.
const WORKER_ID = extra.demoWorkerId ?? 'worker-local';

export default function ScanScreen() {
  const sync = useOfflineSync();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState<string | null>(null);
  const [shipmentDesc, setShipmentDesc] = useState<string>('');
  const [manualId, setManualId] = useState<string>('');

  useEffect(() => {
    if (permission && !permission.granted) requestPermission();
  }, [permission]);

  const onBarcode = async (data: string) => {
    if (scanned) return;
    setScanned(data);
    const existing = await getShipment(data);
    setShipmentDesc(existing?.description ?? `Unknown item ${data.slice(0, 6)}`);
  };

  const recordStatus = async (status: ShipmentStatus) => {
    if (!scanned) return;
    const now = new Date().toISOString();
    const existing = await getShipment(scanned);
    const ship = {
      equipment_id: scanned,
      description: existing?.description ?? shipmentDesc,
      stand_number: existing?.stand_number ?? 'unassigned',
      status,
      updated_at: now,
    };
    await upsertLocalShipment(ship);
    await enqueue({ kind: 'upsert_shipment', row: ship });

    const audit = {
      id: uuidv4(),
      equipment_id: scanned,
      worker_id: WORKER_ID,
      action: `mark_${status.toLowerCase()}`,
      notes: null,
      image_path: null,
      image_blob_url: null,
      signature_blob_url: null,
      timestamp: now,
      updated_at: now,
    };
    await insertLocalAudit(audit);
    await enqueue({ kind: 'insert_audit', row: audit });

    if (status === 'Missing') {
      const inv = {
        id: uuidv4(),
        item_id: scanned,
        issue_description: `Item ${scanned} reported missing on stand ${ship.stand_number}`,
        management_response: null,
        resolution_status: 'PendingResponse' as const,
        opened_at: now,
        updated_at: now,
      };
      await upsertLocalInvestigation(inv);
      await enqueue({ kind: 'upsert_investigation', row: inv });
      Alert.alert('Investigation opened', 'Pending Management Response.');
    } else {
      Alert.alert('Saved', `${status} recorded for ${scanned}.`);
    }
    setScanned(null);
    sync.syncNow();
  };

  const capturePhoto = async () => {
    if (!scanned) return;
    // Reserved for full camera implementation; documents the file path layout.
    const dir = `${FileSystem.documentDirectory}audits/`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    Alert.alert('Photo capture', `Audit photos saved under ${dir}.`);
  };

  return (
    <View style={{ flex: 1 }}>
      <SyncStatusBar {...sync} />
      <View style={styles.cameraWrap}>
        {permission?.granted ? (
          <CameraView
            style={{ flex: 1 }}
            barcodeScannerSettings={{
              barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39'],
            }}
            onBarcodeScanned={(r) => void onBarcode(r.data)}
          />
        ) : (
          <View style={styles.permission}>
            <Text style={{ color: 'white' }}>Camera permission required.</Text>
          </View>
        )}
      </View>
      <View style={styles.panel}>
        <Text style={styles.scannedText}>
          {scanned ? `Equipment: ${scanned}` : 'Point camera at a label, or type an id below…'}
        </Text>
        {scanned && <Text style={styles.descText}>{shipmentDesc}</Text>}
        <View style={styles.manualRow}>
          <TextInput
            value={manualId}
            onChangeText={setManualId}
            placeholder="EQ-1001"
            autoCapitalize="characters"
            style={styles.input}
          />
          <Pressable
            style={styles.btn}
            onPress={() => {
              if (manualId.trim()) {
                void onBarcode(manualId.trim());
                setManualId('');
              }
            }}
          >
            <Text style={styles.btnText}>Use ID</Text>
          </Pressable>
          {scanned && (
            <Pressable
              style={[styles.btn, styles.btnGhost]}
              onPress={() => setScanned(null)}
            >
              <Text style={styles.btnText}>Clear</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.row}>
          {STATUSES.map((s) => (
            <Pressable
              key={s}
              onPress={() => recordStatus(s)}
              disabled={!scanned}
              style={[
                styles.btn,
                s === 'Missing' && styles.btnDanger,
                !scanned && { opacity: 0.4 },
              ]}
            >
              <Text style={styles.btnText}>{s}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={capturePhoto} style={[styles.btn, styles.btnGhost]}>
          <Text style={styles.btnText}>Take audit photo</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cameraWrap: { flex: 1, backgroundColor: 'black' },
  permission: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  panel: { padding: 16, gap: 12, backgroundColor: 'white' },
  scannedText: { fontSize: 16, fontWeight: '600' },
  descText: { color: '#475569' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  manualRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
  },
  btn: {
    backgroundColor: '#0f172a',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  btnDanger: { backgroundColor: '#dc2626' },
  btnGhost: { backgroundColor: '#475569' },
  btnText: { color: 'white', fontWeight: '600' },
});
