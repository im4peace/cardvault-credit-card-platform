# Security Review (Final Re-review) - Credit Card Demo - 2026-09-19

Scope: backend/src, backend/prisma, backend/tests, frontend/src/api, frontend/src/auth. Read-only static review; nothing was executed or modified. Only behavior verified from the code (and, for the empty-list audit filter, the existing test) is reported.

## Status of earlier Mediums

| Earlier Medium | Status | Basis |
|---|---|---|
| Login-throttle eviction flood resets counters | CLOSED (residual distributed variant below, M-1) | src/service/auth.ts:101-107 reserves the IP slot first. A single IP can hold at most 30 unrefunded slots per window, so it can own about 31 live entries (30 pair keys + 1 ip key), far below maxEntries=10,000 (auth.ts:28). Rejected IPs (429 at :101) create no pair entry. reserveOne+refund nets to zero on success (:113-114), so a successful login cannot be used to launder earlier failures. Filling the map needs several hundred distinct source IPs, and such an attacker already gets a fresh budget per IP. |
| TRUST_PROXY=1 meant "trust all" | CLOSED | src/config/index.ts:34-37 accepts only `0`, empty or `^[1-9][0-9]?$` and returns a number. app.ts:12 passes that number to `app.set('trust proxy', n)`. Express then uses the n-th address from the right of the chain, so with unset/0 X-Forwarded-For is ignored. Test review-fixes.test.ts (lines ~323-329) covers this. |

## Critical
None.

## High
None.

## Medium

### M-1 Throttle is keyed on the raw `req.ip`, so IPv6 address rotation bypasses it entirely (new, residual)
File: backend/src/service/auth.ts:97-98 (keys), backend/src/api/routes/auth.ts:13 (`req.ip`).
Scenario: an attacker on a host with a routable IPv6 /64 (typical VPS or residential allocation) sends each guess for victim@x.test from a different source address. Every address gets its own fresh pair budget (5) and IP budget (30), so guesses per victim email are effectively unlimited. Express does not collapse IPv6 addresses to a prefix, and there is no per-email (global) limit by design. Same effect for any large IPv4 pool, but IPv6 needs only one machine.
Also, with this many addresses the map fills (10,000 entries) and eviction (auth.ts:47-50) runs, but that gives no extra benefit to the attacker.
Fix: key the IP budget on the /64 for IPv6 (normalize before building keys), and add a coarse per-email global ceiling (higher than the pair limit, e.g. 100 failures per 15 min) that only slows guessing without allowing one IP to lock out a user. bcrypt cost 10 and the demo scope limit the practical impact, hence Medium rather than High.

## Low

### L-1 Misconfigured hop count makes spoofing or shared-bucket lockout possible
File: backend/src/config/index.ts:48, backend/src/service/auth.ts:98-101.
- TRUST_PROXY=1 with no proxy, or with a proxy that does not append to X-Forwarded-For (for example it only sets X-Real-IP): the rightmost XFF value is client-controlled, so the attacker picks its own throttle key (same bypass as M-1).
- TRUST_PROXY unset behind a real proxy (or a hop count too low): every user shares the proxy IP. Any 30 failed logins (or 5 against one email) then return 429 to every user of that bucket, a cheap login denial of service. The same applies to users behind one corporate NAT with the correct setting: one user can lock a colleague out of that pair for 15 minutes (pair key includes only IP and email).
The hop-count design is correct; this is deployment guidance only (README/.env.example note that the value must equal the real number of appending proxies).

### L-2 /auth/register is not throttled
File: backend/src/api/routes/auth.ts:8-10 (no limiter), backend/src/service/auth.ts:75-91.
Scenario: unauthenticated clients can create unlimited accounts, each costing a bcrypt hash (about 70-100 ms CPU), and 409 vs 201 enumerates registered emails. Also gives any attacker a free "own account" (no security gain against the throttle, as verified above, but cheap CPU and DB growth). Fix: apply the same IP-keyed reservation to register.

### L-3 Unbounded DRAFT creation makes the audit view do unbounded work
File: backend/src/repository/index.ts:51-52 and 113-120, backend/src/service/history.ts:13, backend/src/api/routes/customer.ts:18 (POST /applications has no cap or rate limit).
Scenario: a customer creates many drafts. Every GET /officer/audit loads all draft ids into memory and builds a `NOT ... IN (...)` with that list; the audit query itself is also unpaginated. With very large counts the officer audit endpoint slows or may fail on SQLite bind-variable limits (I did not execute this, so the failure threshold is unverified; the unbounded growth is verified). Fix: cap drafts per customer, or express the filter as a relation/subquery (`NOT EXISTS` on status) instead of an id list, and paginate the audit list.

### L-4 Production check depends on exact-case NODE_ENV; non-production accepts the published demo secret
File: backend/src/config/index.ts:13-25 (`=== 'production'` at :16), .env.example.
Scenario: a deployment with NODE_ENV unset or spelled differently, or copying .env.example as documented, runs with the public secret `demo-only-secret-change-me`, so anyone can mint tokens for any user id/role (authenticate() re-reads the user by `sub`, so a forged token needs a valid user id, which are cuids and not guessable, but that is a weak barrier). The random per-process fallback when unset is good. Fix: also reject DEMO_SECRET regardless of NODE_ENV, or leave the placeholder commented out in .env.example.

### L-5 JWT stored in localStorage
File: frontend/src/api/client.ts:18-22.
No XSS sinks were found in frontend/src/api or frontend/src/auth (no innerHTML or dangerouslySetInnerHTML in the frontend grep), so this is only an exposure-amplifier if an XSS is ever introduced. 8 h expiry, no server-side revocation other than deleting the user.

## Informational

- I-1 Refund race across window boundary (auth.ts:64-69, 113-114): a request that reserved in an expired window and finishes after another request reset the entry decrements the new window's count by one. Gain is at most one extra attempt per boundary; not exploitable in a meaningful way.
- I-2 Sweep only runs when the map is at capacity (auth.ts:42); the header comment says expired entries are swept generally. When the map is full of live entries every login request does a full 10,000-entry scan first (only reachable from several hundred IPs); bounded, negligible.
- I-3 Map size is bounded at maxEntries+2 (sweep guarantees size < max, then at most 2 keys are added). Key length is bounded (email max 254, zod runs before the throttle), so memory is bounded (a few MB).
- I-4 positiveNumber (config/index.ts:26-31) accepts hex/exponent/whitespace forms (`0x10`, `1e3`, ` 5 `) and values above MAX_AMOUNT (1,000,000); a value above 1e6 is harmless because zod caps decisions and requests at 1e6 first. `PORT` (config/index.ts:42) is not validated. `CORS_ORIGIN=*` is accepted as written.
- I-5 Audit filter correctness verified: repository/index.ts:117 `NOT: { entityType: 'CreditCardApplication', entityId: { in: ids } }` is AND-ed with the optional caller filter (`...filter`; no key collision since only entityType/entityId are spread from the route, routes/officer.ts:36-44 with typeof string checks). With an empty draft list Prisma evaluates `in []` as false, so NOT(false) returns all rows; review-fixes.test.ts (audit test) asserts this ("after" submit, zero drafts, both rows returned) and that a draft's rows are hidden with and without an `entityId` filter. Non-application entity types (Card, CreditLimitRequest) are unaffected. Officer application views (list, detail, decide) also hide DRAFTs (application.ts getSubmitted, listForReview incl. `status=DRAFT` returns []). Decided-history queries cannot contain drafts.
- I-6 Customer-facing id leaks checked: all customer responses carrying a decision go through withPublicDecision (application.ts update/submit/listMine/getMine, limit.ts listMine/cancel), which whitelists decision, approvedLimit, comment, decidedAt (views.ts:14-18); officerId is not exposed. Cards return their `application` relation without decision (repository cardRepo.findById). Officer-only endpoints intentionally return officerId.
- I-7 RBAC/IDOR verified: officerRouter and customerRouter apply `authenticate` then `requireRole` at router level (routes/officer.ts:6, customer.ts:14); customer resources use owner checks returning 404 (application.ts getOwned, limit.ts getOwned, card.ts getMine, limit request creation checks card.customerId). Registration hard-codes role CUSTOMER. Zod object schemas strip unknown keys so PATCH cannot set status/customerId. State changes use compare-and-set updates, the one-pending-limit-request rule has a partial unique index (migration 2), JWT algorithm is pinned to HS256, and the user is re-read on each request. Unknown-user login runs a dummy bcrypt compare and throttled/unknown/invalid responses are indistinguishable by account existence.
- I-8 No secrets committed: .env and *.db are git-ignored; seed and tests use fixture passwords only.

## Counts
- Critical: 0
- High: 0
- Medium: 1 (M-1, new residual; both earlier Mediums CLOSED)
- Low: 5
- Informational: 8
