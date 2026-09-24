# CardVault - Credit Card Application and Limit Management Demo

> **This is a DEMO / learning application. It uses simulated data only.**
> It must **not** be used for real credit-card processing. There is no integration with real banks, payment networks,
> credit bureaus or card issuers. No real card numbers, CVVs, PINs, SSNs, government IDs or bank credentials are collected
> or stored — a "card" is just a record with an opaque ID, a status and limits. Demo passwords in this README are public.

Customers apply for a card online; a back-office Credit Team reviews and approves or rejects; approved applications get a
simulated card the customer activates; customers can request credit-limit increases or decreases, which the Credit Team
decides. Requirements: [`specs/brd/brd.md`](specs/brd/brd.md).

## My role and project context

I created this as a Virtusa AI Native Engineer training hackathon project. I defined the credit card application and limit management journeys, business rules, and acceptance criteria, then used Claude Harness Engine and Claude Code to move from requirements through implementation, tests, review, and integration. AI tools generated and revised code under that workflow; this is a demonstration of product definition and AI-assisted delivery, not a claim that I manually wrote the entire application or deployed it at a bank.

## Key features

- Customer application with draft, submission, and status tracking.
- Credit officer review and approval or rejection with an audit trail.
- Simulated card issuance and customer activation after approval.
- Credit limit increase and decrease requests with officer decisions.
- Role-based access, customer-level record isolation, and automated tests.

## Five-minute demo

1. Follow [Run locally on Windows](#run-locally-on-windows) and open `http://localhost:5173`.
2. Sign in as `customer4@test.com` using the demo password below. Open the draft application, complete or review its details, and submit it.
3. Sign out and sign in as `officer@test.com`. Open **Pending Applications**, review the newly submitted application, set an approved limit, and approve it.
4. Sign out and return as `customer4@test.com`. Open **My Card** and activate the newly issued simulated card.
5. Open **Credit Limit**, submit a limit change request, then sign in as the officer to review it. Return to the customer account to show the decision and request history.

The seed resets the demo data. Avoid rerunning it during a demo because it deletes the changes you made in the local development database.

## Screenshots

Screenshots will be added after capturing the running demo. Suggested views: customer application, officer review, card activation, and credit limit decision. The application contains simulated data only.

## Architecture overview

```
frontend/  React + Vite + React Router (customer portal + credit-team portal)      :5173
   │  REST/JSON + Bearer JWT
backend/   Express + TypeScript                                                    :4000
   ├─ api/         routes + middleware (auth, RBAC, validation, error handling)
   ├─ service/     business rules and state transitions (the only place rules live)
   ├─ repository/  Prisma queries, atomic compare-and-set status updates
   ├─ config/      env + Prisma client          types/  zod schemas, enums, AppError
   └─ prisma/      schema, migrations, seed  →  SQLite file
e2e/       Playwright (own database + ports)
```

Layers depend one way only: `types → config → repository → service → api`. Entities: User, CustomerProfile,
CreditCardApplication, CreditDecision, Card, CreditLimitRequest, LimitDecision, AuditLog.

## Prerequisites

- Node.js 20+ (developed on 24) and npm
- Git Bash / any POSIX shell for `init.sh` (optional; the commands below work in PowerShell too)
- For E2E only: Playwright's Chromium (`cd e2e && npx playwright install chromium`)

## Run locally on Windows

Open **two PowerShell terminals** in the repository root. First install dependencies and prepare the development database in Terminal 1:

```powershell
cd backend
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npx prisma generate
npx prisma migrate deploy
npm run seed
npm run dev
```

If `backend/.env` already exists, leave it in place; do not overwrite a working local configuration. The seed command **deletes and recreates** demo rows in the development database. Run it only when you want a fresh demo.

In Terminal 2, starting again from the **repository root**:

```powershell
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173`. The backend listens at `http://localhost:4000`; `GET /health` is available for a quick API check. To stop each development server, press **Ctrl+C** in its terminal.

For Git Bash or another POSIX shell, `./init.sh` installs backend and frontend dependencies, prepares and reseeds the development database, and starts both servers. It also resets the demo rows; do not run it when you need to preserve your current local demo state.

### Environment configuration

`backend/.env.example` contains local demo settings. Copy it to `backend/.env` before running the backend. The `.env` file is ignored by Git.

| Variable | Default | Notes |
|----------|---------|-------|
| `DATABASE_URL` | `file:./dev.db` | SQLite file, relative to `backend/prisma/` |
| `JWT_SECRET` | *(unset)* | In `production` it is mandatory: 32+ characters and not the demo placeholder. Outside production, an unset value generates a random per-process secret. The example contains a demo-only value; never commit a real secret. |
| `PORT` | `4000` | Backend port |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed frontend origin |
| `MAX_APPROVED_LIMIT` | `100000` | Maximum demo credit limit |
| `TRUST_PROXY` | unset (0) | Configure only for the actual number of reverse-proxy hops. |

Frontend: optional `VITE_API_URL` (default `http://localhost:4000`).

## Architecture and data

The backend uses Prisma and SQLite. `npx prisma migrate deploy` applies migrations; `npm run seed` recreates the demo users and records below. This demo does not connect to a real bank, bureau, issuer, or payment network.

## Demo accounts (demo-only passwords — never reuse them)

| Role | Email | Password | State after seeding |
|------|-------|----------|---------------------|
| Customer | `customer@test.com` | `Customer123!` | ACTIVE card, one PENDING limit-increase request |
| Customer | `customer2@test.com`, `customer3@test.com` | `Customer123!` | Application awaiting review |
| Customer | `customer4@test.com` | `Customer123!` | DRAFT application |
| Customer | `customer5@test.com` | `Customer123!` | Approved; card ISSUED (try activating it) |
| Customer | `customer6@test.com` | `Customer123!` | Rejected application |
| Credit Officer | `officer@test.com`, `officer2@test.com` | `Officer123!` | — |

New sign-ups are always CUSTOMERs; officers exist only through the seed.

## Workflows

**Customer:** register / sign in → *New Application* (name, contact, address, employment, income, requested limit) →
status `PENDING_CREDIT_REVIEW` → once approved the card appears on *My Card* as `ISSUED` → *Activate card* (`ACTIVE`) →
*Credit Limit* to request an increase or decrease → track everything under *Request History*.

**Credit Officer:** sign in → *Pending Applications* → *Review* → set the approved limit and approve, or reject with a
required comment → *Limit Requests* → approve or reject increases and decreases with a comment → *Decision History*.

**Rules enforced by the backend** (`backend/src/service`):

- Application: `DRAFT → PENDING_CREDIT_REVIEW → CARD_ISSUED` (approved) `| REJECTED`, then `CARD_ACTIVATED` on activation.
  Only DRAFT applications are editable/submittable; only PENDING_CREDIT_REVIEW ones can be decided, exactly once
  (atomic status compare-and-set, safe under concurrent requests).
- Approval requires `0 < approvedLimit <= requestedLimit` and `<= MAX_APPROVED_LIMIT`; the officer may approve the requested amount or less. It creates the card (`ISSUED`, limit = approved limit). Only `ISSUED` cards can be activated. Only `ACTIVE` cards can
  request limit changes; one pending request per card (also enforced by a partial unique index). Increases and decreases
  both require Credit Team approval — there is no auto-approval.
- Approved changes update `creditLimit` and shift `availableLimit` by the same delta (floored at 0); rejected ones leave the
  card untouched.
- Every business event writes an `AuditLog` row (actor, action, entity type/id, timestamp, comment).
- DRAFT applications are private to the customer; the Credit Team only sees applications once submitted.
- Customer-facing responses show decision status, approved limit, comment and time — never the deciding officer's id.
- Customers only ever see their own records (foreign IDs return 404, indistinguishable from non-existent ones).

## Running the tests

```bash
cd backend  && npm test && npm run lint && npm run typecheck
cd frontend && npm test && npm run lint && npm run typecheck && npm run build
```

Backend tests run against a throw-away SQLite file (`backend/prisma/test.db`), recreated on each run.

### End-to-end tests (Playwright)

```bash
cd e2e && npm ci && npx playwright install chromium && npm run test:e2e
```

> **E2E tests reset their own test data.** They start a separate API (port 4100) and UI (port 5174) against a dedicated
> database, `backend/prisma/e2e.db`, which is **deleted, re-migrated and re-seeded on every run**. Your normal development
> database (`dev.db`) and any dev servers you have running are never touched. `npm run seed` (dev data) and
> `npm run test:e2e` (test data) are fully separate.

## API summary

`POST /auth/register|login`, `GET /auth/me` · customer: `/applications` (POST, GET, GET/:id, PATCH/:id, POST/:id/submit),
`/cards` (GET, GET/:id, POST/:id/activate, POST/:id/limit-requests), `/limit-requests` (GET, POST/:id/cancel) ·
officer: `/officer/applications` (GET, GET/:id, POST/:id/decision), `/officer/limit-requests` (GET, POST/:id/decision),
`/officer/history`, `/officer/audit` · `GET /health`.

## Security notes (demo scope)

bcrypt password hashing, HS256 JWTs (8h) re-validated against the user table on every request (stored role wins), role
checks per router, zod validation with amount caps and max lengths on all free text, parameterized Prisma queries only,
CORS allow-list, `helmet` headers, atomic state transitions, audit rows written in the same transaction.

**Login throttling design.** IPv6 clients are grouped by /64 prefix (one host controls a whole /64, so rotating addresses inside it gains nothing). Failed attempts are counted per *client IP + email* (5 per 15 min) and per client IP (30 per
15 min) — deliberately **not** per email alone, so knowing someone's email does not let an attacker lock that person out;
the attacker only exhausts their own budget. A slot is reserved *before* the slow bcrypt check and refunded on success, so
parallel guesses cannot slip past the limit; the IP budget is checked first so one client cannot flood the table with random emails to evict its own counters. State is in memory (per process, swept and bounded) — fine for a local demo,
use a shared store / edge rate limiting for anything real.

**Known limitations (accepted for the demo):** `TRUST_PROXY` must equal the real number of proxy hops (too high lets clients spoof their IP; too low/unset behind a proxy makes all users share one throttle bucket). Registration is not throttled and its 409 reveals registered emails. Distributed guessing from many networks needs edge protection (WAF/rate limiting), not an in-process throttle. Draft creation is unbounded. the JWT is kept in `localStorage` (readable by any script that runs in the
page; React escapes output and the app uses no `dangerouslySetInnerHTML`). There is no refresh-token/revocation (tokens
last 8h, but are re-checked against the user table and a 401 signs the UI out). A production design would use httpOnly
SameSite cookies plus CSRF protection. Money is stored as `Float`. Audit/history endpoints are not paginated.
Review notes: `specs/reviews/`.
