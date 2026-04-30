import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

interface EntraConfig {
  clientId: string;
  tenantId: string;
  scopes: string[];
  redirectUri: string;
}

const cfg = (Constants.expoConfig?.extra as { entra: EntraConfig }).entra;
const TOKEN_KEY = 'ffu.entra.access_token';
const EXPIRY_KEY = 'ffu.entra.expires_at';

let inFlight: Promise<string | null> | null = null;

export async function getAccessToken(): Promise<string | null> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const cached = await SecureStore.getItemAsync(TOKEN_KEY);
    const expires = await SecureStore.getItemAsync(EXPIRY_KEY);
    if (cached && expires && new Date(expires).getTime() > Date.now() + 60_000) {
      return cached;
    }
    return acquireSilent().catch(() => null);
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

export async function setAccessToken(token: string, expiresAt: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(EXPIRY_KEY, expiresAt);
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(EXPIRY_KEY);
}

async function acquireSilent(): Promise<string | null> {
  const msal = await tryLoadMsal();
  if (!msal) return null;
  const result = await msal.acquireTokenSilent({
    scopes: cfg.scopes,
    authority: `https://login.microsoftonline.com/${cfg.tenantId}`,
  });
  if (result?.accessToken) {
    await setAccessToken(result.accessToken, result.expiresOn);
    return result.accessToken;
  }
  return null;
}

export async function signIn(): Promise<string | null> {
  const msal = await tryLoadMsal();
  if (!msal) throw new Error('MSAL not available on this platform');
  const result = await msal.acquireToken({
    scopes: cfg.scopes,
    authority: `https://login.microsoftonline.com/${cfg.tenantId}`,
    redirectUri: cfg.redirectUri,
  });
  if (result?.accessToken) {
    await setAccessToken(result.accessToken, result.expiresOn);
    return result.accessToken;
  }
  return null;
}

async function tryLoadMsal(): Promise<any | null> {
  try {
    const mod = await import('@azure/msal-react-native');
    return new (mod as any).PublicClientApplication({
      auth: { clientId: cfg.clientId },
    });
  } catch {
    return null;
  }
}
