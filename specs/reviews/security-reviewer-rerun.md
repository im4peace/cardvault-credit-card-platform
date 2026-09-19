# Security Re-review (rerun) - demo credit-card app

Scope: backend/src, prisma, tests, frontend/src/api/client.ts, frontend/src/auth. Read-only static review; no source changed. Line numbers refer to backend/src unless stated.

## Status of the 4 prior Medium findings

| # | Finding | Status | Evidence |
|---|---|---|---|
| M1 | Officers could list/read DRAFTs | CLOSED (Low residual L-2) | service/application.ts:200-204 getSubmitted returns 404 on DRAFT; :262-266 listForReview returns [] for status=DRAFT; repository/index.ts:183-188 listSubmitted uses `status != DRAFT` when unfiltered. decide() (:269) uses getSubmitted. Status filter is case-sensitive equality, so "draft" matches nothing. History uses decision-not-null so drafts cannot appear. |
| M2 | Lockout email-only / counted after bcrypt | PARTIAL | Per IP+email and per-IP keys; slot reserved synchronously before the first await (service/auth.ts:153-161), so parallel guesses cannot race. X-Forwarded-For is ignored when TRUST_PROXY is unset (app.ts:12, config/index.ts:58 -> false). Remaining: M-1 (eviction bypass), M-2 (trust proxy = true is spoofable). |
| M3 | Approval bounds | CLOSED (Low L-1) | application.ts:206-213 enforces approved <= requested and <= maxApprovedLimit before the tx; requestedCreditLimit is immutable after submit (edits only via atomic updateDraft on DRAFT). limit.ts:18-20 caps requests, :86-88 re-checks at approval (throw inside tx rolls back the status CAS and decision insert). zod caps: MAX_AMOUNT on approvedLimit, requestedCreditLimit, requestedLimit, monthlyIncome (types/index.ts:335,336,345,351). |
| M4 | JWT secret + officer id exposure | CLOSED (Low L-3) | config/index.ts:37-48: production rejects missing/demo/<32 chars; otherwise env value or random per process. Customer responses: all go through withPublicDecision (application.ts:235,250,256,259; limit.ts:57,69), which drops officerId, decision id, applicationId. Card responses (card.ts:119,124,134) include `application` (repository:214), which carries no decision and no officer field; Card, Application and CreditLimitRequest models have no officerId (schema.prisma). limitService.request returns the raw new request (no decision relation). Raw decisions are only returned on /officer routes (application.ts:266,308; limit.ts:73,110). No leak found. |

## Status of the Low / other items

| Item | Status | Evidence |
|---|---|---|
| Duplicate registration P2002 -> 409 | CLOSED | service/auth.ts:133 pre-check plus :140-145 catch of PrismaClientKnownRequestError P2002. |
| Free-text max lengths | CLOSED | types/index.ts: names 100, address/employer 200, phone 30, email 254, password 72, comment 1000, reason 500; patch schema is `.partial()` of the capped schema; body limit 64kb (app.ts:15). Only officer query strings (status/entityType/entityId) are uncapped (equality filters, header-size bounded). |
| LIMIT_CHANGE_CANCELLED audit | CLOSED | limit.ts:65-68 in same tx as the CAS; action type at types/index.ts:293; DB column is a free string. |
| Frontend clears auth on 401 | CLOSED (I-2) | frontend/src/api/client.ts:35-39 clears token and dispatches event; auth/AuthContext.tsx:28-32 sets user null; RequireRole.tsx:69 redirects to /login. Fires only when a token was sent. |
| Officer/user id exposure in customer responses | CLOSED | see M4. |
| Max-limit config validity (related to M3) | PARTIAL | see L-1. |

Note: the brief did not enumerate six distinct Lows; the ones named in the brief are covered above (5 explicit plus the max-limit config item).

## Critical
None.

## High
None.

## Medium

### M-1 Login throttle can be reset by map-eviction flooding (service/auth.ts:99-125, 155-161)
When the per-IP budget is exhausted, reserveOne(pairKey) has already created an entry; the ipKey reservation then throws and refund(pairKey) only decrements it to count 0. The entry stays in the map. One IP that has used its 30 attempts can keep sending well-formed logins with distinct made-up emails; each gets a cheap 429 (no bcrypt) but leaves a persistent entry. At 10,000 entries sweep() (:99-109) finds nothing expired and deletes the OLDEST entries in insertion order, which include the attacker's own `ip|<attacker>` key and any earlier `pair|<ip>|<victim>` key.
Failing scenario: the attacker guesses passwords for victim@example.com and reaches the 5/15min pair limit. The attacker then sends about 10k requests with random emails (small JSON, seconds), evicting both `pair|ip|victim` and `ip|ip`. Both counters restart at zero, giving another 5 to 30 guesses. Repeating this defeats the lockout entirely, and the flood also erases other users' counters. Memory remains bounded (that part of the fix holds). Derived from code reading; not executed.
Fix: reserve the IP key first and create the pair entry only if that succeeds; delete entries when count reaches 0 in refund(); when full, evict expired or count-0 entries first and never evict `ip|` keys over budget (or use an LRU/TTL store).

### M-2 TRUST_PROXY=1 maps to boolean `true`, trusting client-supplied X-Forwarded-For (config/index.ts:58, app.ts:12)
`process.env.TRUST_PROXY === '1'` yields true. In Express, `true` takes the LEFT-most X-Forwarded-For entry as req.ip, and most reverse proxies append to an inbound XFF header rather than replace it.
Failing scenario: with the documented deployment setting behind such a proxy, the attacker sends a different `X-Forwarded-For` value on every login; each attempt gets fresh pair and ip keys, so both limits are bypassed and password guessing is unlimited. The comment "TRUST_PROXY=1" also reads as a hop count, which is not what is implemented.
Fix: parse TRUST_PROXY as a hop count or subnet list (e.g. `Number(v)` so `1` trusts one hop). With TRUST_PROXY unset, spoofed XFF is correctly ignored (verified).

## Low

### L-1 MAX_APPROVED_LIMIT fails open on bad config (config/index.ts:56; application.ts:210; limit.ts:18,86)
Number("abc") is NaN and `x > NaN` is always false, so every system-maximum check silently passes (the approved <= requested check still holds). Fix: validate finite and positive at startup.

### L-2 Officers can still learn of DRAFTs via the audit endpoint (api/routes/officer.ts:106-114; service/history.ts:11)
/officer/audit is unfiltered; APPLICATION_CREATED rows expose a draft's entityId and the customer's userId before submission. No draft content is exposed and getSubmitted blocks reads, but the draft-privacy intent is only partly met. Fix: exclude audit rows for applications still in DRAFT, or document it.

### L-3 Well-known demo secret accepted whenever NODE_ENV != production (config/index.ts:37-45; backend/.env.example:4)
A deployment that forgets NODE_ENV=production and copies .env.example signs tokens with the public placeholder. Forging also needs a valid user id (cuid), which limits impact. Fix: reject DEMO_SECRET in all modes. (backend/.env holds the demo value; it is git-ignored.)

### L-4 Shared-IP lockout when TRUST_PROXY is unset behind a proxy (service/auth.ts:153-157)
All clients appear as the proxy IP: the 30 per-IP budget is shared by everyone, and the pair key is effectively email-only again, so 5 failures lock the victim's login for 15 minutes (the original M2 DoS). Safe only for directly exposed servers. Fix: document, or require an explicit TRUST_PROXY decision in production.

### L-5 Registration unthrottled and enumerates emails (service/auth.ts:131-147)
Unlimited registrations (bcrypt hash plus 3 rows each), and the 409 reveals registered emails. Acceptable for a demo; noted for completeness.

## Informational
- I-1 Distributed guessing: no global per-email cap, so many IPs each get 5 tries per victim per window (intended trade-off). IPv6 attackers can rotate addresses within a /64.
- I-2 frontend/src/api/client.ts:35-38: a late 401 from a request sent with an old token clears a newer token stored after a fresh login (token captured before send, not compared before clearing). Minor UX race.
- I-3 JWT in localStorage (client.ts:19-21) is readable by any XSS; no raw HTML rendering was seen in the reviewed files.
- I-4 limit.ts:96: clamping availableLimit to 0 on a decrease hides any outstanding balance; acceptable since the demo has no transactions.
- I-5 Audit trail and officer lists are unpaginated (history.ts; repository auditRepo.list) - officer-only.
- I-6 helmet, CORS allowlist and generic 500 handler are in place; no regression.

## Regression hunt
No regression in authorization paths: every customer route has authenticate + requireRole('CUSTOMER'), officer routes have requireRole('CREDIT_OFFICER'), ownership failures return 404, and status CAS transitions remain atomic. New issues are confined to the throttle implementation (M-1, M-2).

## Counts
Critical 0 | High 0 | Medium 2 | Low 5 | Informational 6
Prior Mediums: M1 CLOSED, M2 PARTIAL, M3 CLOSED, M4 CLOSED.
