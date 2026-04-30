# FastFreight Update

A local-first React Native (Expo) application for **Onsite Event Logistics**,
designed for warehouse and exhibition-hall workers operating in
high-concurrency, low-connectivity environments. Writes happen locally to
SQLite first; a background sync loop reconciles with an Azure SQL backend and
Azure Blob Storage when connectivity returns. A parent web dashboard receives
real-time updates via Azure Web PubSub (SignalR).

## Repository layout

```
FastFreightUpdate/
├── shared/   # Shared TypeScript types (Shipment, AuditLog, Investigation, SyncOp)
├── mobile/   # Expo SDK 51 app (TypeScript, expo-router, expo-sqlite, expo-camera)
└── api/      # Node 20 + Express + mssql + Azure Blob + Web PubSub
```

This is an npm workspaces monorepo. From the root:

```sh
npm install
npm run dev:mobile   # expo start
npm run dev:api      # ts-node-dev src/index.ts
npm run typecheck
npm test
```

## Architecture overview

### Local-first sync

1. UI writes go to SQLite immediately with `sync_status='pending'`.
2. The `sync_queue` table records the corresponding op (`upsert_shipment`,
   `insert_audit`, `upsert_investigation`).
3. `useOfflineSync` (in `mobile/src/sync/useOfflineSync.ts`) listens to
   `NetInfo`. When the device comes online (and on a 30 s timer) it:
   - **Push phase**: requests SAS URLs for any pending audit photos, uploads
     to Blob, then `POST /api/sync/batch`.
   - **Pull phase**: `GET /api/sync/changes?since=<cursor>` and merges rows
     into SQLite using **Last-Write-Wins** by `updated_at` (tiebroken by id).

### Missing-item investigation loop

- Marking a shipment **Missing** in `app/(tabs)/scan.tsx` opens an
  `investigations` row with `resolution_status='PendingResponse'`.
- The investigations list shows a **Pending Management Response** pill until
  the API endpoint `POST /api/investigations/:id/response` is called by ops
  staff, which sets `management_response` and bumps `updated_at`.
- The next pull cycle delivers the response to the device. The detail screen
  (`app/investigations/[id].tsx`) renders the response and enables a
  **Resolve** button when the worker physically locates the item.

### Concurrency

- All rows carry `updated_at` (ISO‑8601 UTC).
- API LWW rule: an incoming op only wins when its `updated_at` is strictly
  greater than the server row; otherwise the server returns `conflict` with
  the authoritative `server_row`, which the client adopts locally.
- After every successful write the API publishes a `{entity, id, updated_at}`
  event on the `logistics` Web PubSub hub so the parent dashboard can refresh.

## Required configuration

### `mobile/app.json` → `extra`

- `apiBaseUrl` — the Node API's public URL.
- `entra.clientId`, `entra.tenantId`, `entra.scopes`, `entra.redirectUri` —
  Microsoft Entra ID app registration for device login.

### `api/.env` (see `api/.env.example`)

- `SQL_*` — Azure SQL credentials.
- `AZURE_STORAGE_*` — Blob account / key / container for audit photos.
- `WEB_PUBSUB_CONNECTION_STRING`, `WEB_PUBSUB_HUB` — real-time channel.
- `ENTRA_TENANT_ID`, `ENTRA_AUDIENCE` — JWT validation parameters.

## Verification (end-to-end)

1. **Offline write**: in airplane mode, scan/select an equipment id on the
   Audit tab and mark it `Missing`. A row appears in `investigations` with
   the **Pending Management Response** pill.
2. **Push**: re-enable Wi-Fi. Within ~30 s, the queue depth in the status
   bar drops to 0 and the row appears in Azure SQL.
3. **Pull**: from a SQL client, run
   `UPDATE investigations SET management_response='Item found, arriving 4 PM',
   updated_at=SYSUTCDATETIME() WHERE id='...';`. After the next sync tick the
   detail screen shows the response.
4. **Resolve**: tap **Mark as Resolved**. The investigation flips to
   `Resolved` locally, an audit log records the action, and both rows sync up.
5. **Realtime**: a SignalR/Web PubSub client subscribed to the `logistics`
   hub receives an event for each accepted write.

## Out of scope

- Web parent dashboard UI (the API publishes Web PubSub events; the web app
  consumes them — to be built separately).
- Signature capture (audit_log carries a nullable `signature_blob_url` column
  ready for future use).
- CI/CD and EAS build profiles.
