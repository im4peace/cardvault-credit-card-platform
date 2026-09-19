import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { config } from '../config/index.js';
import { userRepo } from '../repository/index.js';
import { clientKey } from './clientKey.js';
import { AppError, type AuthUser, type Role } from '../types/index.js';

interface Registration {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

/**
 * Login throttling design (demo-grade, in-memory, per process):
 *  - Attempts are counted per (client IP + email) and per client IP, NOT per email alone. An attacker who only knows a
 *    victim's email therefore exhausts their own budget, not the victim's, so it cannot be used to lock a user out.
 *  - A slot is RESERVED synchronously before the slow bcrypt comparison and refunded on success. Node runs the
 *    reservation without yielding, so N parallel guesses cannot all slip under the limit while bcrypt is running.
 *  - Successful logins refund their slot, so normal use never accumulates failures.
 *  - IPv6 clients are keyed by /64 prefix (see clientKey.ts), IPv4-mapped addresses as IPv4.
 *  - The IP budget is checked before any per-email entry is created, so a single client can create at most
 *    perIpPerWindow live entries per window (it cannot flood the map to evict its own counters).
 *  - Windows expire after 15 minutes, and expired entries are swept so the map cannot grow without bound.
 * Behind a reverse proxy set TRUST_PROXY to the number of proxy hops (e.g. 1) so `req.ip` is the real client address;
 * it is a hop count, never "trust everything", so client-supplied X-Forwarded-For values cannot pick their own IP.
 */
export const LOGIN_LIMITS = { perPairPerWindow: 5, perIpPerWindow: 30, windowMs: 15 * 60 * 1000, maxEntries: 10_000 };

const attempts = new Map<string, { count: number; start: number }>();
// Compared against when the email is unknown so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

function signToken(user: AuthUser): string {
  return jwt.sign({ sub: user.id, role: user.role, email: user.email }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwtExpiresIn,
  });
}

function sweep(now: number): void {
  if (attempts.size < LOGIN_LIMITS.maxEntries) return;
  for (const [key, entry] of attempts) {
    if (now - entry.start > LOGIN_LIMITS.windowMs) attempts.delete(key);
  }
  // Still full of live entries (an attack): drop the oldest so memory stays bounded.
  for (const key of attempts.keys()) {
    if (attempts.size < LOGIN_LIMITS.maxEntries) break;
    attempts.delete(key);
  }
}

function reserveOne(key: string, limit: number, now: number): void {
  const entry = attempts.get(key);
  if (!entry || now - entry.start > LOGIN_LIMITS.windowMs) {
    attempts.set(key, { count: 1, start: now });
  } else if (entry.count >= limit) {
    throw new AppError(429, 'Too many login attempts. Try again later.');
  } else {
    entry.count += 1;
  }
}

function refund(key: string): void {
  const entry = attempts.get(key);
  if (!entry) return;
  entry.count -= 1;
  if (entry.count <= 0) attempts.delete(key); // keep the map tidy: zero-count entries carry no information
}

export const authService = {
  /** Test hook: clears all login throttling state. */
  resetLoginThrottle: (): void => attempts.clear(),

  async register(input: Registration) {
    const email = input.email.toLowerCase();
    if (await userRepo.findByEmail(email)) throw new AppError(409, 'Email already registered');
    const passwordHash = await bcrypt.hash(input.password, 10);
    try {
      // Role is always CUSTOMER here; officers exist only via seeding.
      const user = await userRepo.create({ ...input, email, passwordHash, role: 'CUSTOMER' });
      const authUser: AuthUser = { id: user.id, email: user.email, role: 'CUSTOMER' };
      return { token: signToken(authUser), user: authUser };
    } catch (err) {
      // Two concurrent registrations passed the check above; the unique index decides the loser.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError(409, 'Email already registered');
      }
      throw err;
    }
  },

  async login(email: string, password: string, ip: string) {
    const normalized = email.toLowerCase();
    const now = Date.now();
    sweep(now);
    const client = clientKey(ip); // IPv6 grouped by /64 so rotating addresses inside one prefix gains nothing
    const pairKey = `pair|${client}|${normalized}`;
    const ipKey = `ip|${client}`;
    // IP budget first: an IP that is out of budget is rejected BEFORE any per-email entry is created, so one client
    // cannot flood the map with random emails (each failure costs it a slot) and force eviction of its own counters.
    reserveOne(ipKey, LOGIN_LIMITS.perIpPerWindow, now);
    try {
      reserveOne(pairKey, LOGIN_LIMITS.perPairPerWindow, now);
    } catch (err) {
      refund(ipKey); // blocked pair: no password check happens, so do not burn the IP budget
      throw err;
    }

    const user = await userRepo.findByEmail(normalized);
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new AppError(401, 'Invalid email or password');

    refund(pairKey);
    refund(ipKey);
    const authUser: AuthUser = { id: user.id, email: user.email, role: user.role as Role };
    return { token: signToken(authUser), user: authUser };
  },

  /** Verifies the token, then re-reads the user so deleted users / changed roles take effect immediately. */
  async authenticate(token: string): Promise<AuthUser> {
    let sub: string;
    try {
      const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
      sub = String(payload.sub);
    } catch {
      throw new AppError(401, 'Invalid or expired token');
    }
    const user = await userRepo.findById(sub);
    if (!user) throw new AppError(401, 'Invalid or expired token');
    return { id: user.id, email: user.email, role: user.role as Role };
  },
};
