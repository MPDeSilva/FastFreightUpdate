import {
  BlobSASPermissions,
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from '@azure/storage-blob';
import { BlobSasRequest, BlobSasResponse } from '@ffu/shared';

const account = process.env.AZURE_STORAGE_ACCOUNT;
const key = process.env.AZURE_STORAGE_KEY;
const container = process.env.AZURE_BLOB_CONTAINER ?? 'audits';

let cred: StorageSharedKeyCredential | null = null;
let svc: BlobServiceClient | null = null;
function init() {
  if (!account || !key) throw new Error('Azure storage env vars missing');
  if (!cred) cred = new StorageSharedKeyCredential(account, key);
  if (!svc)
    svc = new BlobServiceClient(`https://${account}.blob.core.windows.net`, cred);
}

export function issueSas(req: BlobSasRequest): BlobSasResponse {
  init();
  const expiresOn = new Date(Date.now() + 5 * 60_000);
  const sas = generateBlobSASQueryParameters(
    {
      containerName: container,
      blobName: req.filename,
      permissions: BlobSASPermissions.parse('cw'),
      contentType: req.content_type,
      expiresOn,
      protocol: 'https' as any,
    },
    cred!
  ).toString();
  const blob_url = `https://${account}.blob.core.windows.net/${container}/${req.filename}`;
  return {
    upload_url: `${blob_url}?${sas}`,
    blob_url,
    expires_at: expiresOn.toISOString(),
  };
}
