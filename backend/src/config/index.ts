import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

/** Placeholder shipped in `.env.example` for local demos. Rejected in production. */
export const DEMO_SECRET = 'demo-only-secret-change-me';

/**
 * JWT signing secret.
 * - production: JWT_SECRET is mandatory, 32+ chars, and must not be the demo placeholder.
 * - otherwise: JWT_SECRET if set (e.g. from `.env`), else a random per-process secret, so there is never a
 *   well-known default key baked into the code. Tokens then stop working when the server restarts.
 */
export function resolveJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.JWT_SECRET;
  if (env.NODE_ENV?.trim().toLowerCase() === 'production') {
    if (!secret || secret === DEMO_SECRET || secret.length < 32) {
      throw new Error('JWT_SECRET must be set to a strong (32+ char, non-demo) value in production');
    }
    return secret;
  }
  if (secret) return secret;
  console.warn('JWT_SECRET is not set: using a random per-process secret (tokens reset on restart).');
  return randomBytes(32).toString('hex');
}

export function positiveNumber(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const n = /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : Number.NaN; // plain decimals only (no hex/exponent/whitespace)
  if (!Number.isFinite(n) || n <= 0) throw new Error(name + ' must be a positive number, got \'' + raw + '\'');
  return n;
}

/** TRUST_PROXY = number of reverse-proxy hops in front of the app (0/unset = none). Never 'trust all'. */
export function resolveTrustProxy(raw: string | undefined): number {
  if (raw === undefined || raw === '' || raw === '0') return 0;
  if (!/^[1-9][0-9]?$/.test(raw)) throw new Error('TRUST_PROXY must be a hop count such as 1 (number of proxies), got \'' + raw + '\'');
  return Number(raw);
}

export const config = {
  jwtSecret: resolveJwtSecret(),
  port: Number(process.env.PORT ?? 4000),
  jwtExpiresIn: '8h',
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((s) => s.trim()),
  /** Highest credit limit the Credit Team may approve or a customer may request a change to. */
  maxApprovedLimit: positiveNumber('MAX_APPROVED_LIMIT', process.env.MAX_APPROVED_LIMIT, 100_000),
  /** Number of trusted reverse-proxy hops (TRUST_PROXY=1 for one proxy). Express then uses the address the trusted proxy appended, so client-supplied X-Forwarded-For values cannot spoof req.ip. */
  trustProxy: resolveTrustProxy(process.env.TRUST_PROXY),
} as const;

export const prisma = new PrismaClient();
