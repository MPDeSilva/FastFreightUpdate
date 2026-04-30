/**
 * Entra ID (Azure AD) auth via expo-auth-session.
 *
 * In demo mode (extra.demoMode = true) this short-circuits to a static token —
 * the demo API doesn't validate it.
 *
 * For production, configure an App Registration in Entra ID with redirect URI
 * `<scheme>://auth` (the scheme is set in app.json) and call `signIn()` from a
 * login screen. Tokens are cached in SecureStore. PKCE is on by default.
 */
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import * as AuthSession from 'expo-auth-session';

interface EntraConfig {
  clientId: string;
  tenantId: string;
  scopes: string[];
  redirectUri: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as {
  entra?: EntraConfig;
  demoMode?: boolean;
};
const cfg = extra.entra;
const DEMO_MODE = !!extra.demoMode;
const TOKEN_KEY = 'ffu.entra.access_token';
const EXPIRY_KEY = 'ffu.entra.expires_at';
const REFRESH_KEY = 'ffu.entra.refresh_token';

function discovery() {
  if (!cfg) throw new Error('Entra config missing in app.json extra.entra');
  return {
    authorizationEndpoint: `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/authorize`,
    tokenEndpoint: `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`,
  };
}

export async function getAccessToken(): Promise<string | null> {
  if (DEMO_MODE) return 'demo-token';
  const cached = await SecureStore.getItemAsync(TOKEN_KEY);
  const expires = await SecureStore.getItemAsync(EXPIRY_KEY);
  if (cached && expires && new Date(expires).getTime() > Date.now() + 60_000) {
    return cached;
  }
  return refresh().catch(() => null);
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(EXPIRY_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

export async function signIn(): Promise<string | null> {
  if (DEMO_MODE) return 'demo-token';
  if (!cfg) throw new Error('Entra not configured');
  const request = new AuthSession.AuthRequest({
    clientId: cfg.clientId,
    scopes: cfg.scopes,
    redirectUri: cfg.redirectUri,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
  });
  const d = discovery();
  const result = await request.promptAsync(d);
  if (result.type !== 'success' || !result.params.code) return null;
  const tokenResult = await AuthSession.exchangeCodeAsync(
    {
      clientId: cfg.clientId,
      code: result.params.code,
      redirectUri: cfg.redirectUri,
      extraParams: request.codeVerifier ? { code_verifier: request.codeVerifier } : undefined,
    },
    d
  );
  await persist(tokenResult);
  return tokenResult.accessToken;
}

async function refresh(): Promise<string | null> {
  if (!cfg) return null;
  const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
  if (!refreshToken) return null;
  const tokenResult = await AuthSession.refreshAsync(
    { clientId: cfg.clientId, refreshToken, scopes: cfg.scopes },
    discovery()
  );
  await persist(tokenResult);
  return tokenResult.accessToken;
}

async function persist(t: AuthSession.TokenResponse): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, t.accessToken);
  if (t.refreshToken) await SecureStore.setItemAsync(REFRESH_KEY, t.refreshToken);
  const expiresAt = new Date(
    Date.now() + (t.expiresIn ?? 3600) * 1000
  ).toISOString();
  await SecureStore.setItemAsync(EXPIRY_KEY, expiresAt);
}
