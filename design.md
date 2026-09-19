# Claude Harness Engine v1 — Design Reference

## System Architecture

```
User / CI
   │ slash commands
Orchestrator (Claude):  /brd → /spec → /design → /build → /test → /evaluate
   │
Planner   Generator   Evaluator   Test Eng   Security Rev
   └──────────┴──────────┴───────────┴───────────┘
                       │
                State Layer
   features.json · claude-progress.txt · learned-rules.md
   failures.md · iteration-log.md
```

## Karpathy Ratchet Loop

```
Build Feature → Evaluate vs Design → score ≥ threshold?
                     ▲                  │Yes → Proceed
                     │                  │No  → Design Critic suggests fix
                     └── Generator applies fix (max iterations per calibration-profile.json)
```

## Agent Roles

| Agent | File | Responsibility |
|-------|------|----------------|
| Planner | `.claude/agents/planner.md` | Sprint planning, story breakdown |
| Generator | `.claude/agents/generator.md` | Feature implementation |
| Evaluator | `.claude/agents/evaluator.md` | API + Playwright verification |
| Design Critic | `.claude/agents/design-critic.md` | Design scoring (Karpathy loop) |
| UI Designer | `.claude/agents/ui-designer.md` | Mockups, design tokens |
| Test Engineer | `.claude/agents/test-engineer.md` | Test authoring and execution |
| Security Reviewer | `.claude/agents/security-reviewer.md` | Vulnerability auditing |

## Hook Execution Order

| # | Hook | File | Trigger |
|---|------|------|---------|
| 1 | protect-env | `hooks/protect-env.js` | Any file write |
| 2 | detect-secrets | `hooks/detect-secrets.js` | Pre-commit |
| 3 | scope-directory | `hooks/scope-directory.js` | File access |
| 4 | lint-on-save | `hooks/lint-on-save.js` | File save |
| 5 | typecheck | `hooks/typecheck.js` | File save |
| 6 | check-function-length | `hooks/check-function-length.js` | File save |
| 7 | check-file-length | `hooks/check-file-length.js` | File save |
| 8 | check-architecture | `hooks/check-architecture.js` | File save |
| 9 | sprint-contract-gate | `hooks/sprint-contract-gate.js` | Pre-build |
| 10 | pre-commit-gate | `hooks/pre-commit-gate.js` | Pre-commit |
| 11 | task-completed | `hooks/task-completed.js` | Post-task |
| 12 | teammate-idle-check | `hooks/teammate-idle-check.js` | Periodic |

## State Files

| File | Purpose |
|------|---------|
| `features.json` | Feature registry with status tracking |
| `claude-progress.txt` | Session progress and pipeline position |
| `learned-rules.md` | Accumulated rules from past failures |
| `failures.md` | Failure log |
| `iteration-log.md` | Evaluator iteration history |
| `eval-scores.json` | Design scores per iteration |
| `coverage-baseline.txt` | Coverage baseline for regression detection |

## Sprint Contract Format

`sprint-contracts/{group-id}.json` defines a unit of work (contract_id, group_name, stories, acceptance_criteria,
dependencies, estimated_complexity, approved). The sprint-contract-gate hook blocks `/build` until `approved: true`.

## Quality Principles

1. **Correctness first** — all tests pass before a feature is done
2. **Type safety** — strict typing enforced on save
3. **Layered architecture** — one-way boundaries enforced by hook
4. **Test coverage** — ≥ 80% gate; regressions block merges
5. **Security by default** — secrets detection on commit; env files protected
6. **Iterative improvement** — ratchet ensures quality only moves forward
