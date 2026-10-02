# Feature: agents-md-migration

## Objective

Make `AGENTS.md` the single source of agent instructions (read by Claude Code and OpenCode), and define a shared domain modeling pattern for all features.

## Problem

- Architecture guidance is duplicated in `CLAUDE.md`, `.claude/agents/architect/agent.md` and `.opencode/skills/architect/SKILL.md`, and the copies already diverge (port location: `usecase/ports/` vs "inline or ports/").
- No rule defines HOW the domain is modeled, so each feature uses a different style (entity class, pure functions, data-only class, types only).
- `agent.md` claims every feature has entity classes, which does not match the code.

## Why

One source of truth avoids drift between tools. A written domain pattern makes new features consistent and reviewable.

## Scope (authorized)

- `docs/arquitectura/patron-dominio.md` (new) and the existing `docs/arquitectura/resumen-arquitectura.md`.
- `AGENTS.md` (new), `CLAUDE.md` (reduced to `@AGENTS.md`).
- `.claude/agents/architect/agent.md` and `.opencode/skills/architect/SKILL.md` (correct domain section and port rule, point to AGENTS.md).

Out of scope: any source code change. User WIP in `customer.domain.ts` and `sales-order.domain.ts` must not be touched or committed.

## Constraints

- Claude Code v2.1.288 reads `AGENTS.md` natively (>= 2.1.277), but only when no `CLAUDE.md` exists; `@AGENTS.md` import keeps both working.
- Always-loaded instructions stay concise; long detail lives in `docs/arquitectura/`.

## Tasks

- [x] T1 — Write the domain pattern guide in `docs/arquitectura/patron-dominio.md`; link it from `resumen-arquitectura.md`. Route: delegated (writer trigger: 2+ non-trivial files across T1–T3). Commit: `4e5caf8`.
- [x] T2 — Create `AGENTS.md` from `CLAUDE.md` + concise domain pattern rules; reduce `CLAUDE.md` to `@AGENTS.md`. Route: delegated (same writer). Commit: `6018b45`.
- [x] T3 — Fix `agent.md` and `SKILL.md`: domain layer description, port location rule, reference to `AGENTS.md` and the guide. Route: delegated (same writer). No commit: `.claude/` is in `.gitignore` and `.opencode/` in `.git/info/exclude`, so both files are unversioned; change applied on disk only.

- [x] T4 — Convert the `architect` agent into one shared skill at `.claude/skills/architect/SKILL.md` (Claude Code and OpenCode both read `.claude/skills/`; Claude Code does not read `.agents/skills/` or `.opencode/skills/`). Remove `.claude/agents/architect/` and the duplicate `.opencode/skills/architect/`; frontmatter reduced to `name` + `description`; `.gitignore` changed from `.claude/` to `.claude/*` + `!.claude/skills/`; references updated in `AGENTS.md`, `README.md`, `resumen-arquitectura.md`. Route: inline (mechanical, already understood). Commit: `92ec644`. Check: `git check-ignore` confirms the skill is tracked and `.claude/settings.local.json` stays ignored.

## Acceptance criteria

- `CLAUDE.md` imports `AGENTS.md`; `AGENTS.md` contains all previous `CLAUDE.md` content plus the domain pattern rules.
- No contradiction about port location across the files.
- The domain guide describes the three domain piece types and the shared conventions, with Mermaid diagrams and no code blocks.

## Checks

- TDD: not applicable (documentation only, no runner involved).
- Structural readback of each file; `rg` for contradictions ("inline" port rule).

## Progress

- T1–T3 done. Verification (writer, read back by parent): only ```mermaid fences in the guide (2 blocks); old "inline or ports/" rule gone from architect files; `agent.md` and `SKILL.md` identical after the header; no file under `src/` changed.
- Writer correction: the inline `complemento` comparison lives in `get-customer-status-balance.usecase.ts` and `get-sales-orders-by-customer-document.usecase.ts`, not in `validate-customer-for-purchase`.
- Not verified: markdownlint run; Claude Code resolving `@AGENTS.md` (takes effect in a new session).
- Next: decide whether to version the architect agent (unignore `.claude/agents/`); apply the domain pattern feature by feature.
