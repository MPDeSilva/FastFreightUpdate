import Constants from 'expo-constants';
import {
  BlobSasRequest,
  BlobSasResponse,
  SyncBatchRequest,
  SyncBatchResponse,
  SyncChangesResponse,
} from '@ffu/shared';
import { getAccessToken } from '../auth/msal';

const baseUrl =
  (Constants.expoConfig?.extra as { apiBaseUrl: string }).apiBaseUrl ??
  'https://api.example.com';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(res.status, `HTTP ${res.status} ${path}: ${body}`);
  }
  return (await res.json()) as T;
}

export const api = {
  syncBatch(req: SyncBatchRequest): Promise<SyncBatchResponse> {
    return request('/api/sync/batch', { method: 'POST', body: JSON.stringify(req) });
  },
  syncChanges(since: string): Promise<SyncChangesResponse> {
    return request(`/api/sync/changes?since=${encodeURIComponent(since)}`);
  },
  blobSas(req: BlobSasRequest): Promise<BlobSasResponse> {
    return request('/api/blob/sas', { method: 'POST', body: JSON.stringify(req) });
  },
  async putBlob(uploadUrl: string, fileUri: string, contentType: string): Promise<void> {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'Content-Type': contentType,
      },
      body: { uri: fileUri, type: contentType, name: 'upload' } as any,
    });
    if (!res.ok) throw new ApiError(res.status, `Blob upload failed: ${res.status}`);
  },
};

export { ApiError };
