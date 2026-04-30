# Running the Demo

This walks you through end-to-end demo of the offline-first sync, the
Reconciliation Dashboard, and the Missing → Pending → Response → Resolve loop.
**No Azure resources, no Entra setup** — everything runs on your laptop with
SQLite + Express + Expo.

## Prereqs

- **Node 22 LTS** (specifically `>=22.13 <23`). Node 24 will not work — Expo SDK 51 trips on its stricter ESM resolver. A `.nvmrc` is included.
- npm 10
- One of:
  - **iOS Simulator** (Xcode), or
  - **Android Emulator** (Android Studio), or
  - The **Expo Go** app on a physical phone, on the same Wi-Fi as your laptop.

### Installing Node 22 on Windows

Use [nvm-windows](https://github.com/coreybutler/nvm-windows/releases) (one-time setup):

```powershell
# Install nvm-windows from the link above, then:
nvm install 22.13.0
nvm use 22.13.0
node --version   # should print v22.13.0
```

Or download Node 22 LTS directly from <https://nodejs.org/en/download> and uninstall any existing Node 24 first.

## 1. Install once

After confirming `node --version` shows `v22.x`:

```powershell
cd FastFreightUpdate

# If a previous failed install left node_modules behind, nuke it first.
# Close VS Code / any explorer windows pointing at the folder before running this.
rd /s /q node_modules
del package-lock.json

npm install
```

## 2. Start the demo API

In **terminal 1**:

```sh
npm run demo:api
```

You should see:
```
  FastFreight Update — DEMO API
  Listening on http://localhost:3000
  SQLite DB:   .../api/demo.db
```

The API has these endpoints:
- `GET  /health` — sanity check.
- `GET  /api/demo/state` — view all rows in JSON (open in browser).
- `POST /api/sync/batch`, `GET /api/sync/changes?since=…` — what the mobile app talks to.
- `POST /api/investigations/:id/response` — operations endpoint to send a management response (you'll call this in step 5).

## 3. Seed sample shipments

In **terminal 2**:

```sh
npm run demo:seed
```

This inserts 10 sample shipments across stands `A12`, `B07`, `C03`. Equipment IDs printed at the end (e.g. `EQ-1001`).

## 4. Start the mobile app

In **terminal 2** (after seeding):

```sh
npm run demo:mobile
```

Press `i` for iOS simulator, `a` for Android emulator, or scan the QR code with Expo Go on a physical phone.

> **Network tip**: the app's `apiBaseUrl` defaults to `http://localhost:3000`.
> - **iOS Simulator**: works as-is.
> - **Android Emulator**: change `mobile/app.json` → `extra.apiBaseUrl` to `http://10.0.2.2:3000`.
> - **Physical phone**: change it to your laptop's LAN IP, e.g. `http://192.168.1.42:3000`. Both devices must be on the same Wi-Fi.

## 5. Demo script (5 minutes)

1. **Reconciliation tab**: pull-to-refresh. You should see the 10 seeded shipments grouped by stand. The status bar at the top shows "Online · Pending: 0".

2. **Audit tab**: type `EQ-1001` in the manual entry box and tap **Use ID** (or scan a QR if you printed one). The selected item appears.

3. Tap **Delivered**. Watch the status bar pending count briefly tick up, then drop back to 0 as it syncs. Refresh `http://localhost:3000/api/demo/state` in your browser — `EQ-1001.status` is now `Delivered` and an `audit_logs` row exists.

4. **Trigger an investigation**: select `EQ-1002`, tap **Missing**. The app pops "Investigation opened — Pending Management Response". Switch to the **Investigations** tab — a row appears with the **PendingResponse** pill.

5. **Send a management response from outside the app** (simulating the parent web dashboard) — in **terminal 3**:

   ```sh
   # Grab the investigation id from the demo state endpoint:
   curl -s http://localhost:3000/api/demo/state | jq '.investigations[0].id'

   # Send the response (paste the id):
   curl -X POST http://localhost:3000/api/investigations/<paste-id>/response \
     -H "Content-Type: application/json" \
     -d '{"management_response":"Item found at warehouse, arriving 4 PM"}'
   ```

6. Within ~30 s (or pull-to-refresh on the Investigations tab), the row's pill changes to **Responded** and tapping into it shows the response text.

7. Tap **Mark as Resolved**. Pill flips to **Resolved**, an audit row is logged, and `/api/demo/state` reflects it.

## 6. Show offline-first

1. With the API still running, on the device: turn on Airplane Mode (or stop the API with Ctrl-C).
2. The status bar flips to **Offline**.
3. Scan more items, mark a couple **Missing**. Pending count climbs.
4. Re-enable network (or restart the API). Within seconds the queue drains and `/api/demo/state` shows everything.

## 7. Show concurrency / LWW

Run two devices (e.g. iOS Simulator + Android Emulator) pointed at the same API. Mark the same equipment with different statuses. Whichever write has the later `updated_at` wins on both devices after the next pull.

## Resetting the demo

Stop the API and delete `api/demo.db` (and `api/demo-blobs/` if any photos were uploaded), then re-seed.

## Switching back to "real" mode

When you're ready to wire up Azure SQL / Blob / Entra:
- Set `mobile/app.json` → `extra.demoMode = false` and fill in `entra.*`.
- Use `npm run dev:api` (instead of `demo:api`) and configure `api/.env` from `.env.example`.
