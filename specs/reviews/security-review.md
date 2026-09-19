# Security & Code-Quality Review

Status summary (latest): **0 Critical, 0 High, 0 Medium open**; open Lows and accepted limitations are listed under Rounds 2 and 3.

Scope: backend (auth, JWT, RBAC, isolation, validation, Prisma, state machine, concurrency, limits, audit, errors, env, CORS),
frontend token handling. Method: manual review of all `backend/src`, `backend/prisma`, frontend `src/api` + `src/auth`,
plus regression tests for each fix (`backend/tests/security.test.ts`). Demo scope: simulated data, local use.

## Critical
None found.

## High
| # | Finding | Status |
|---|---------|--------|
| H1 | JWT secret silently fell back to a hard-coded value; running with no `JWT_SECRET` anywhere would let anyone forge officer tokens. | **Fixed** — server refuses to start in `NODE_ENV=production` unless `JWT_SECRET` is set, ≥32 chars, and not the demo value. Tokens also pinned to `HS256` on sign and verify. |

## Medium
| # | Finding | Status |
|---|---------|--------|
| M1 | Role was trusted from the JWT claim; a deleted user or a role change stayed effective until expiry (8h). | **Fixed** — every request re-reads the user; stored role wins (tests: forged claim, deleted user). |
| M2 | CORS was `cors()` (any origin). | **Fixed** — allow-list from `CORS_ORIGIN` (default `http://localhost:5173`). |
| M3 | No brute-force protection on login. | **Fixed, then redesigned in Round 2** — first version was per-email (lock-out DoS); now per IP+email and per IP (see Round 2). |
| M4 | Check-then-insert race: two concurrent limit requests could both become PENDING. | **Fixed** — partial unique index `one PENDING per card` (migration `..._one_pending_limit_request`) + P2002 → 409. |
| M5 | `PATCH /applications/:id` checked DRAFT then wrote unconditionally; a concurrent submit could be edited after submission. | **Fixed** — atomic `updateMany … WHERE status='DRAFT'`. |
| M6 | Approving a limit change did not re-check the card status; a BLOCKED/CLOSED card could get a new limit. | **Fixed** — approval requires the card to be ACTIVE inside the transaction (rolls back otherwise). |
| M7 | Malformed JSON bodies returned 500. | **Fixed** — body-parser errors map to 400; body limit 64 kb. |

## Low
| # | Finding | Status |
|---|---------|--------|
| L1 | Login timing differed for unknown emails (bcrypt skipped). | **Fixed** — compares against a dummy hash. |
| L2 | No password max length (bcrypt truncates at 72 bytes) and no amount upper bounds (floats, `Infinity`). | **Fixed** — password ≤72; amounts ≤ 1,000,000. |
| L3 | Missing security headers / `X-Powered-By`. | **Fixed** — `helmet`. |
| L4 | Seed script is destructive. | **Fixed** — refuses to run in production. |
| L5 | Cancelling a limit request is not audited. | **Fixed in Round 2** — `LIMIT_CHANGE_CANCELLED`. |
| L6 | Unknown routes under the customer router answer 401/403 instead of 404. | Open — harmless, leaks nothing. |
| L7 | `activate` ignores a 0-row result when syncing the application status (only possible with inconsistent data). | Open. |

## Informational
- **Authorization model is sound:** every customer query is scoped by `customerId` from the verified token; foreign and missing
  ids return the same 404 body (tested); officer routes are role-gated at router level; registration cannot set a role.
- **Prisma safety:** no `$queryRaw`/`$executeRaw`; all filters are parameterized. Query-string filters are accepted only if `string`.
- **State machine:** all transitions are compare-and-set updates inside transactions with their audit rows, so concurrent
  duplicate approvals produce one decision (tested).
- **Secrets:** `.env`, `*.db` are git-ignored; `.env.example` holds demo placeholders only. Demo passwords are documented on purpose.
- **Frontend:** JWT is kept in `localStorage` (exposed to XSS; React escapes output and no `dangerouslySetInnerHTML` is used).
  No logout-side revocation. Acceptable for a demo; use httpOnly cookies + CSRF protection for anything real.
- **Money is stored as `Float`** — fine for a demo, use integer minor units or `Decimal` in real systems.
- **Prisma tooling note:** the partial index exists only in migration SQL (Prisma can't model it); `prisma migrate dev` may report drift for it.
- `package.json#prisma` (seed config) is deprecated in Prisma 7; migrate to `prisma.config.ts` when upgrading.

---
## Round 2 — independent review follow-up (see `security-reviewer-independent.md`, `security-reviewer-rerun.md`)

Independent review #1: 0 Critical / 0 High / 4 Medium / 7 Low. Re-review after fixes: 0 / 0 / 2 Medium (new, in the login throttle) / 5 Low.

| Finding | Status |
|---------|--------|
| Officers could read DRAFT applications | **Fixed** (list/detail/decide hide drafts; /officer/audit hides draft rows) |
| Email-only lockout = lock-out DoS; parallel bypass | **Fixed** — per IP+email and per-IP throttle, slot reserved before bcrypt, refunded on success |
| Re-review M-1: eviction flood reset the throttle | **Fixed** — IP budget checked first; zero-count entries deleted |
| Re-review M-2: `TRUST_PROXY=1` meant "trust all" (spoofable XFF) | **Fixed** — hop count only; rightmost entry used |
| Approved limit could exceed request | **Fixed** — `0 < approved <= requested`, `<= MAX_APPROVED_LIMIT` |
| Demo JWT secret usable / officer ids exposed | **Fixed** — no built-in default key; production needs strong secret; customer responses omit `officerId` |
| Duplicate registration 500 | **Fixed** (409) |
| Cancellation unaudited | **Fixed** (`LIMIT_CHANGE_CANCELLED`) |
| Missing max lengths / DOB range | **Fixed** |
| 401 mid-session did not sign the UI out | **Fixed** |
| `MAX_APPROVED_LIMIT` NaN passes all checks | **Fixed** — validated at startup |
| JWT in `localStorage` | **Accepted, documented** (README) |
| Demo secret from `.env.example` accepted outside production | **Accepted, documented** (explicit dev convenience; refused in production) |
| Registration is unthrottled; 409 reveals registered emails | **Open (Low)** — inherent to open self-registration |
| Behind a proxy without `TRUST_PROXY`, clients share one IP | **Documented** |
| Unpaginated audit/history; Float money; availableLimit clamp; token-clear race | **Open (Informational)** |

---
## Round 3 — final re-review (`security-reviewer-final.md`)

Result: 0 Critical / 0 High / 1 Medium / 5 Low / 8 Informational. Both Round-2 Mediums confirmed **CLOSED**.

| Finding | Status |
|---------|--------|
| M-1: IPv6 clients could rotate addresses inside a /64 to get fresh throttle budgets | **Fixed** — `clientKey()` groups IPv6 by /64, unwraps IPv4-mapped addresses (tested). The reviewer also suggested a per-email global ceiling; **rejected on purpose** — it would recreate the lock-out DoS the design avoids. Distributed guessing is an accepted limitation (needs edge protection). |
| L-1: wrong `TRUST_PROXY` hop count is exploitable / shares one bucket | **Documented** (README) |
| L-2: registration unthrottled, 409 reveals emails | **Open (Low)**, documented |
| L-3: unbounded drafts + unpaginated audit `NOT IN` list | **Open (Low)**, documented; fine at demo scale |
| L-4: `NODE_ENV` compared case-sensitively | **Fixed** — trimmed, case-insensitive (config + seed guard); demo secret outside production is an accepted, documented dev convenience |
| L-5: JWT in localStorage | **Accepted, documented** |
| Info: `positiveNumber` accepted hex/exponent/whitespace | **Fixed** — plain decimals only |

The final small change set (`clientKey`, NODE_ENV/number parsing) was verified by tests (82 backend tests) but not re-reviewed by an agent again.
