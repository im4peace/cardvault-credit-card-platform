# Independent Security Review - Credit Card Demo (backend + frontend auth)

Scope: backend/src, prisma schema/migrations/seed, frontend/src/api/client.ts, frontend/src/auth/. Read-only review; findings verified against code. Self-review not consulted.

## Critical
None found. No auth bypass, no privilege escalation path, no injection, no cross-customer IDOR was verified.

## High
None found.

## Medium

### M-1 Login lockout enables targeted account-lockout DoS and is bypassable by concurrent requests
- backend/src/service/auth.ts:14-38, 54-66
- Lockout is keyed only on the submitted email, in process memory. Any unauthenticated party can send 10 bad passwords for officer@test.com (or any known email) and lock that user out for 15 minutes, repeatedly. There is no per-IP throttle.
- `checkLockout` runs before the async `bcrypt.compare`, while `recordFailure` runs after it. A burst of N parallel requests all pass the check before any failure is recorded, so the 10-attempt cap does not bound a parallel burst.
- No rate limiting exists anywhere else (register, all API routes). app.ts has no limiter middleware.
- Fix: add IP-based (plus account-based) limiter such as express-rate-limit, increment the counter before the compare, use progressive delay rather than hard lock.

### M-2 Known fallback JWT secret is used unless NODE_ENV=production
- backend/src/config/index.ts:3-11; backend/package.json scripts `start`/`dev` do not set NODE_ENV; backend/.env and .env.example both contain the 28-char demo secret (.env is gitignored, .env.example is a template).
- If the app is run via `npm start` without NODE_ENV=production, tokens are signed with a publicly known string (in source). An attacker who knows a valid officer user id (cuid; not secret, appears in API responses such as decision.officerId visible to customers, see L-3) can forge an officer token and pass `authenticate` (the DB lookup only checks the id exists).
- Failing scenario: forge HS256 token with sub=<officerId from a customer's application decision> using the demo secret, call POST /officer/applications/:id/decision.
- Fix: fail startup whenever JWT_SECRET is missing/weak regardless of NODE_ENV (or generate a random secret per boot in dev); make `start` set NODE_ENV=production.
- Note: the officer id leakage in L-3 makes this concretely exploitable when the demo secret is in use.

### M-3 Application/limit approval has no authority limits or business bounds
- backend/src/types/index.ts:73-76; backend/src/service/application.ts:61-100; backend/src/service/limit.ts:62-96
- Any CREDIT_OFFICER can approve any limit up to 1,000,000, above the customer's requested limit and regardless of income, with no second approver or tiered authority. `approvedLimit` is not constrained to <= requestedCreditLimit. Limit-increase approvals apply `requestedLimit` unconditionally, with no cap relative to the existing limit.
- One officer can approve arbitrary limits with only an audit record (no dual control).
- Fix: enforce approvedLimit <= requestedCreditLimit (or require an explicit override reason), add per-officer authority tiers/dual control for large amounts.

### M-4 Officers can read customers' unsubmitted DRAFT applications and full PII
- backend/src/repository/index.ts:33-38; backend/src/service/application.ts:54-59; backend/src/api/routes/officer.ts:16-21
- `listForReview` with no `status` (or status=DRAFT) and `getForReview(id)` return any application in any state, including drafts the customer has not submitted, with DOB, phone, address, income. Data-minimisation gap; officers only need PENDING_CREDIT_REVIEW and decided ones.
- Fix: restrict officer reads to non-DRAFT statuses; default the list filter to PENDING_CREDIT_REVIEW.

## Low

### L-1 Limit-request cancellation is not audited
- backend/src/service/limit.ts:53-58; AuditAction type (types/index.ts:21-30) has no cancel action.
- Cancellation changes state with no audit entry. Draft edits (application.ts:24-33) are also unaudited, as are failed logins, registrations and lockouts.
- Fix: add LIMIT_CHANGE_CANCELLED, APPLICATION_UPDATED, and security events to audit.

### L-2 Duplicate registration race returns 500
- backend/src/service/auth.ts:44-49
- Check-then-create; concurrent registrations for the same email: the loser hits the unique constraint (Prisma P2002), which is not mapped and yields 500 (and a logged stack). No integrity break (unique index holds). Registration also allows email enumeration via 409 (auth.ts:46).
- Fix: catch P2002 and return 409; consider a generic response.

### L-3 Internal identifiers and officer comments exposed to customers
- backend/src/repository/index.ts:22-32, 76-83; routes/customer.ts
- Customer endpoints include the full `decision` row (officerId, comment) and card/application relations. Officer user ids are exposed to customers (feeds M-2) and free-text officer comments are shown verbatim.
- Fix: use explicit `select`/DTOs for customer responses.

### L-4 Unbounded in-memory lockout map and unbounded list/audit responses
- auth.ts:16 (`failures` Map keyed by arbitrary valid email string, entries only removed on the same key's later attempt or success): memory growth under distinct-email spam. officer.ts:36-44 / repository:110 `/officer/audit`, `/officer/history` are unpaginated.
- Fix: TTL sweep/LRU, pagination.

### L-5 Weak input validation on free text and dates
- backend/src/types/index.ts:48-86
- No max lengths on names, address, comment, reason (only the 64kb body cap); `dateOfBirth` accepts any date (future, age <18); `phone` min length only; application `email` is free-form and not tied to the account; `employmentStatus` validated but no income sanity. Passwords: min 8, no complexity/breach check.
- Multiple applications per customer are allowed with no cap, so one customer can create many DRAFT/pending applications and, if approved, multiple cards (applicationId unique only per card).
- Fix: length caps, DOB range/age check, per-customer open-application limit.

### L-6 Decrease approval can mask over-utilisation; limits stored as Float
- backend/src/service/limit.ts:77-81; prisma/schema.prisma (Float money columns)
- `availableLimit = max(0, available + delta)`: a decrease below current utilisation silently clamps to 0 instead of being rejected/flagged. Card update is read-then-write without a CAS on the card row (safe under SQLite's single writer; would lose updates on a multi-writer DB).
- Fix: use integer minor units/Decimal; reject or flag decreases below utilisation; guard update with `updateMany where creditLimit = <read value>`.

### L-7 JWT properties: no revocation, 8h lifetime, localStorage storage
- backend/src/config/index.ts:16; frontend/src/api/client.ts:4,15-19; frontend/src/auth/AuthContext.tsx:19-26,42-45
- Token stored in localStorage (readable by any XSS; none found in reviewed code, React escapes output). No server-side logout/revocation, only user-existence re-check (good: role is re-read from DB each request, service/auth.ts:69-80). Client only clears the token if /me fails at startup; a 401 mid-session does not log the user out.
- Fix (if hardening): short-lived access tokens with refresh in httpOnly SameSite cookie, centralised 401 handling.

## Informational

- I-1 Partial unique index for one-pending-limit-request-per-card lives only in raw SQL (migrations/20260919063046_one_pending_limit_request/migration.sql); schema.prisma cannot express it, so a future `prisma migrate dev` / `db push` may drop it as drift. Add a CI test guarding the index (concurrency safety in limit.ts:42-47 depends on it).
- I-2 Unknown routes: customerRouter is mounted at `/` with `authenticate, requireRole('CUSTOMER')` for everything (app.ts:20, customer.ts:14), so unauthenticated unknown paths return 401 and officers get 403 instead of 404. Harmless but noisy; ensures no unauthenticated data route.
- I-3 Card activation is self-service with no verification (card.ts:14-23): acceptable for demo.
- I-4 Frontend RequireRole is UX only (RequireRole.tsx); server enforces roles correctly. Default API base is http://localhost:4000.
- I-5 `console.error(err)` for 500s logs full errors (no secrets/passwords observed logged); error responses are generic. Validation `details` echo Zod flatten output only.
- I-6 Seed uses fixed demo passwords (prisma/seed.ts:7-8) but refuses to run under NODE_ENV=production; .env, *.db are gitignored (dev.db/e2e.db not tracked).

## Verified OK (no finding)
- SQL/NoSQL injection: all queries use Prisma with parameters; `status`, `entityType`, `entityId` query values are typed strings passed as values, no raw queries ($queryRaw/$executeRaw) anywhere. None.
- Customer data isolation/IDOR: every customer application/card/limit-request lookup checks `customerId === user.id` and returns 404 for non-owners (application.ts:5-10, card.ts:8-12, limit.ts:6-10, 13-16). None.
- RBAC: routers apply authenticate + requireRole at router level; role is derived from DB, not token claims; register hard-codes CUSTOMER; zod strips unknown keys, so no mass assignment of status/role/customerId.
- Password hashing: bcryptjs cost 10, 72-char cap, dummy-hash compare against user enumeration timing. JWT verify pins HS256, expiry set.
- State transitions & concurrency: applications (DRAFT -> PENDING_CREDIT_REVIEW -> CARD_ISSUED/REJECTED -> CARD_ACTIVATED), card ISSUED -> ACTIVE, and limit requests (PENDING -> APPROVED/REJECTED/CANCELLED) use atomic compare-and-set `updateMany` inside transactions; decision/card rows have unique constraints (applicationId, requestId), so duplicate/concurrent approvals yield 409 and roll back. Double-issue of a card is prevented.
- CORS: explicit origin allowlist, no credentials; helmet enabled; body limit 64kb.

## Summary counts
- Critical: 0
- High: 0
- Medium: 4 (M-1 to M-4)
- Low: 7 (L-1 to L-7)
- Informational: 6 (I-1 to I-6)
