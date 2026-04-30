import { NextFunction, Request, Response } from 'express';
import jwt, { JwtHeader, SigningKeyCallback } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const tenantId = process.env.ENTRA_TENANT_ID;
const audience = process.env.ENTRA_AUDIENCE;

const client = tenantId
  ? jwksClient({
      jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
      cache: true,
      cacheMaxAge: 10 * 60_000,
    })
  : null;

function getKey(header: JwtHeader, cb: SigningKeyCallback) {
  if (!client) return cb(new Error('Entra not configured'));
  client.getSigningKey(header.kid, (err, key) => {
    if (err || !key) return cb(err ?? new Error('no key'));
    cb(null, key.getPublicKey());
  });
}

export interface AuthedRequest extends Request {
  user?: { workerOid: string; name?: string };
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const auth = req.header('authorization');
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'missing bearer' });
    return;
  }
  if (!tenantId || !audience) {
    res.status(500).json({ error: 'auth not configured' });
    return;
  }
  jwt.verify(
    auth.slice(7),
    getKey,
    {
      audience,
      issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
      algorithms: ['RS256'],
    },
    (err, decoded) => {
      if (err || !decoded || typeof decoded === 'string') {
        res.status(401).json({ error: 'invalid token' });
        return;
      }
      const claims = decoded as jwt.JwtPayload;
      req.user = {
        workerOid: String(claims.oid ?? claims.sub ?? ''),
        name: typeof claims.name === 'string' ? claims.name : undefined,
      };
      next();
    }
  );
}
