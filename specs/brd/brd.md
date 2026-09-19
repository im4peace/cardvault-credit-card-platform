# BRD — Credit Card Application & Management (Demo)

Source: requirements and decisions supplied by the project owner in the scaffold conversation (no separate interview was run; the `/brd` interview was skipped because all five dimensions were already answered).

## 1. Executive Summary
A local learning/demo web app where customers apply for a credit card online, a back-office Credit Team reviews and approves/rejects, approved applications yield a simulated card the customer activates, and customers request credit-limit increases/decreases that the Credit Team decides. All data is simulated; there is no integration with real banking, payment networks, credit bureaus or card issuers.

## 2. Problem Statement
Provide a realistic but safe end-to-end workflow (customer portal + back-office portal + audit trail) to exercise the harness pipeline and demonstrate role-based, state-machine-driven business processes.

## 3. Target Users
| Role | Capabilities |
|------|--------------|
| CUSTOMER | Register/login; create, edit (while DRAFT) and submit applications; view application status; view issued card; activate card; view limit; request limit increase/decrease; track and cancel own pending limit requests |
| CREDIT_OFFICER | Login to back-office; view pending applications and limit requests; review details; approve/reject with comments; set approved credit limit; view processed-decision history |

CREDIT_OFFICER accounts are seeded only (no self-registration). Registration creates CUSTOMER accounts.

## 4. Success Metrics
- Both workflows (application → card issued → activated; limit request → decision) work end to end.
- All state-transition rules enforced and covered by tests; coverage ≥ 80%.
- Every business event produces an AuditLog row.
- Seed data lets a reviewer exercise both portals immediately.

## 5. Scope
**In:** registration/login (JWT, hashed passwords), RBAC, application lifecycle, credit decisions, simulated card issuance/activation, limit-change workflow, audit trail, customer portal, officer portal, seed data, automated + E2E tests.
**Out:** real payments/transactions, statements, billing, real card numbers/CVV/PIN, KYC/government IDs, credit-bureau checks, email/SMS notifications, automatic approval, card blocking/closing UI (statuses BLOCKED/CLOSED exist in the model only), production deployment.

## 6. MVP Definition
Full scope above; the 13-step incremental plan (schema → backend → seed → auth → application → officer approval → card issue/activate → limit workflow → audit → customer UI → officer UI → tests → E2E).

## 7. Alternatives Considered
Chosen: layered monolith (Express + Prisma/SQLite) with a separate Vite SPA. Rejected: microservices/queues (needless complexity for local demo); server-rendered UI (owner specified React SPA); Postgres (SQLite chosen for zero-setup local dev).

## 8. Technical Architecture
- Backend: Node, TypeScript, Express REST, Prisma + SQLite, zod validation, JWT (jsonwebtoken) + bcrypt, Vitest + supertest, ESLint, tsc.
- Frontend: React, TypeScript, Vite, React Router, Vitest + React Testing Library, ESLint.
- Layers: Types → Config → Repository → Service → API → UI (one-way). State-transition rules live in the service layer.
- Local dev: backend `:4000`, frontend `:5173`.

## 9. Data Model Overview
User, CustomerProfile, CreditCardApplication, CreditDecision, Card, CreditLimitRequest, LimitDecision, AuditLog (see design docs for fields). Card stores only: id, customerId, status, creditLimit, availableLimit, issuedAt, activatedAt (plus applicationId FK). Statuses are strings validated in TypeScript.

**Application fields:** first/last name, email, phone, date of birth, address, city, country, employment status, employer name, monthly income, requested credit limit.

## 10. External Integrations
None. All data mock/simulated.

## 11. Business Rules & Edge Cases
### Application lifecycle
`DRAFT → SUBMITTED → PENDING_CREDIT_REVIEW → APPROVED | REJECTED`; on approval `→ CARD_ISSUED → CARD_ACTIVATED`.
- BR-1: Submit moves DRAFT → SUBMITTED → PENDING_CREDIT_REVIEW (submission completes in one action).
- BR-2: Only DRAFT applications are editable; submitted applications are immutable.
- BR-3: Only PENDING_CREDIT_REVIEW applications can be approved/rejected; a second decision is rejected (409) — no duplicate processing (atomic conditional update inside a transaction).
- BR-4: Approval (with approved limit) creates the Card (status ISSUED, creditLimit = availableLimit = approved limit), sets application CARD_ISSUED, writes CreditDecision and audit rows, all in one transaction.
- BR-5: Rejected applications never issue a card.
- BR-6: Only ISSUED cards can be activated; activation sets Card ACTIVE, activatedAt, and application CARD_ACTIVATED. Re-activating an ACTIVE card fails.
- BR-7: Rejection requires a decision comment; approval requires a positive approved limit.

### Limit change
- BR-8: Only ACTIVE cards may have limit requests; both increases and decreases go to the Credit Team (no auto-approval).
- BR-9: Requested limit must be positive, differ from current limit; direction is derived (INCREASE/DECREASE) and validated. A card may have at most one PENDING request.
- BR-10: Only PENDING requests can be approved/rejected (or cancelled by the owning customer → CANCELLED).
- BR-11: Approval sets Card.creditLimit = new limit and adjusts availableLimit by the same delta (floored at 0); rejection leaves the card unchanged. Decision + audit written atomically.

### Access control
- BR-12: Customers see only their own applications, cards and requests (others → 404). Officer endpoints require CREDIT_OFFICER; customer endpoints require CUSTOMER.

### Audit
Actions: APPLICATION_CREATED, APPLICATION_SUBMITTED, APPLICATION_APPROVED, APPLICATION_REJECTED, CARD_ISSUED, CARD_ACTIVATED, LIMIT_CHANGE_REQUESTED, LIMIT_CHANGE_APPROVED, LIMIT_CHANGE_REJECTED. Each row: timestamp, actor user, action, entityType, entityId, comment/details. Audit rows are append-only.

### Security / sensitive data
Passwords hashed (bcrypt); JWT auth with a demo secret from env; no SSNs, government IDs, bank credentials, real card numbers, CVVs or PINs are collected or stored; card identifiers are opaque simulated IDs. Demo credentials are documented in the README and seed only.

### Failure modes
Invalid input → 400 with field errors; unauthenticated → 401; wrong role → 403; not owner/not found → 404; invalid state transition/duplicate processing → 409.

## 12. UI Context
Customer portal: Dashboard, New Application, Application Status, Card Details, Activate Card, Credit Limit Management, Request History.
Officer portal: Dashboard, Pending Applications, Application Review (approve/reject), Pending Limit Requests, Limit Request Review, Decision History.
Consumer-grade design bar (calibration: threshold 8). Desktop-first, responsive to mobile; target WCAG AA basics (labels, contrast, keyboard navigation).

## 13. Demo Seed Data
Users: `customer@test.com`, `customer2@test.com`, `customer3@test.com`, `officer@test.com`, `officer2@test.com` with documented demo-only passwords. Data: pending applications, one approved (card ISSUED), one rejected, one ACTIVE card, one PENDING limit request.

## 14. Open Questions
None blocking. Assumption: BLOCKED/CLOSED card statuses are modeled but have no workflow in this version.
