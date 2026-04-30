import sql from 'mssql';

let poolPromise: Promise<sql.ConnectionPool> | null = null;

export function getPool(): Promise<sql.ConnectionPool> {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool({
      server: requireEnv('SQL_SERVER'),
      database: requireEnv('SQL_DATABASE'),
      user: requireEnv('SQL_USER'),
      password: requireEnv('SQL_PASSWORD'),
      options: { encrypt: true, trustServerCertificate: false },
      pool: { max: 20, min: 2, idleTimeoutMillis: 30_000 },
    }).connect();
  }
  return poolPromise;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export { sql };
