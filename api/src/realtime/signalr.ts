import { WebPubSubServiceClient } from '@azure/web-pubsub';

const conn = process.env.WEB_PUBSUB_CONNECTION_STRING;
const hub = process.env.WEB_PUBSUB_HUB ?? 'logistics';
let client: WebPubSubServiceClient | null = null;

function getClient(): WebPubSubServiceClient | null {
  if (!conn) return null;
  if (!client) client = new WebPubSubServiceClient(conn, hub);
  return client;
}

export type RealtimeEvent =
  | { entity: 'shipment'; id: string; updated_at: string }
  | { entity: 'audit_log'; id: string; updated_at: string }
  | { entity: 'investigation'; id: string; updated_at: string };

export async function publish(event: RealtimeEvent): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    await c.sendToAll(event, { contentType: 'application/json' });
  } catch (err) {
    console.error('signalr publish failed', err);
  }
}
