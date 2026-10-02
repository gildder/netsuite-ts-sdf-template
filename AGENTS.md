# AGENTS.md

Rules for coding agents (Claude Code, OpenCode, ...) working in this repository. Project overview, setup, commands, testing and folder structure live in `README.md`; read it before changing code.

## Critical gotchas

1. Tests run against the compiled JS, not the TS source. Run `pnpm build` before `pnpm test`, or you test stale or missing output.
2. `tsc` strips file-level JSDoc when emitting AMD; `scripts/inject-headers.js` re-injects it. Every deployable script must start with the `@NApiVersion / @NScriptType / @NModuleScope` header, or NetSuite rejects the deploy. `pnpm watch` does not run this step.
3. Never edit `src/FileCabinet/SuiteScripts/` by hand: `pnpm build` generates it and `prebuild` wipes it on every run.
4. `pnpm watch` does not format, and `tsc` emits no JS on a type error (`noEmitOnError`). Use `pnpm build` to validate.
5. Before finishing a change, run `pnpm build && pnpm test && pnpm lint`; all three must pass.

## Architecture

Before creating, modifying or reviewing code under `src/TypeScripts/`, load the `netsuite-clean-architecture` skill (`.claude/skills/netsuite-clean-architecture/SKILL.md`). It holds the architecture rules, the domain modeling pattern, the script naming prefixes and the review checklist.

## Code conventions

- Log with `N/log`, never `console`. `N/log` only has `debug`, `audit`, `error` and `emergency` (no `warn` or `info`).
- Biome is stricter than defaults: `noExplicitAny`, `noConsole` and `noDoubleEquals` are errors; `lineWidth: 100`, single quotes, semicolons, trailing commas. `organizeImports` is off for `src/TypeScripts`: preserve manual import order.
- Identifiers and code in English. Comments mix Spanish and English: match the file you are editing.
