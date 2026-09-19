# credit-card-management

Demo Credit Card Application and Management web app. Customers apply for a card; a back-office Credit Team
(CREDIT_OFFICER) approves/rejects; approved applications get a simulated card the customer activates; customers can
request credit-limit increases/decreases routed to the Credit Team. **Learning/demo only**: mock data, no real banking,
payment networks, credit bureaus, or card issuance. Never store real card numbers, CVVs, PINs, SSNs, or government IDs.

## Quick Reference

**Backend:** `cd backend && npm test` | `npm run lint` | `npm run typecheck` (Node, TypeScript, Express, Prisma + SQLite, Vitest)
**Frontend:** `cd frontend && npm test` | `npm run lint` | `npm run typecheck` (React, Vite, React Router, Vitest + RTL)
**Full stack:** Local dev servers (backend :4000, frontend :5173). See `init.sh`.

## Architecture

Strict layered architecture: Types → Config → Repository → Service → API → UI.
One-way dependencies only. See `.claude/architecture.md` for full rules.
Auth: simple demo auth with role-based access control (CUSTOMER, CREDIT_OFFICER). Every business event writes an AuditLog row.

## Where to Find Things

| What | Where |
|------|-------|
| Architecture rules | `.claude/architecture.md` |
| Quality principles | `.claude/skills/code-gen/SKILL.md` |
| Testing patterns | `.claude/skills/testing/SKILL.md` |
| Evaluation rubric | `.claude/skills/evaluation/SKILL.md` |
| Sprint contract format | `.claude/skills/evaluation/references/contract-schema.json` |
| Playwright patterns | `.claude/skills/evaluation/references/playwright-patterns.md` |
| Human control knobs | `.claude/program.md` |
| Session recovery | `claude-progress.txt` |
| Feature tracking | `features.json` |
| Learned rules | `.claude/state/learned-rules.md` |
| Design reference | `design.md` |

## Pipeline Commands

| Command | Purpose |
|---------|---------|
| `/brd` | Socratic interview → BRD |
| `/spec` | BRD → stories + features.json |
| `/design` | Architecture + schemas + mockups |
| `/build` | Full 8-phase pipeline |
| `/auto` | Autonomous ratcheting loop |
| `/implement` | Code gen with agent teams |
| `/evaluate` | Run app, verify contract |
| `/review` | Evaluator + security review |
| `/test` | Test plan + Playwright E2E |
| `/deploy` | Local dev bootstrap (init.sh) |

## Code Style

- TDD mandatory: test first, then implement
- 100% meaningful coverage target, 80% floor
- Functions < 50 lines, files < 300 lines
- Static typing everywhere (zero `any`)
- See `.claude/skills/code-gen/SKILL.md` for full rules

## Git

Branch: `<type>/<description>` (e.g., `feat/user-auth`)
Commits: conventional format (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`)
