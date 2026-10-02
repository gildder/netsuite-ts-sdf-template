# AGENTS.md

Rules for coding agents (Claude Code, OpenCode, ...) working in this repository. Project overview, setup, commands, testing, folder structure and RESTlet naming live in `README.md`; read it before changing code.

## Critical gotchas

1. Tests run against the compiled JS, not the TS source. Run `pnpm build` before `pnpm test`, or you test stale or missing output.
2. `tsc` strips file-level JSDoc when emitting AMD; `scripts/inject-headers.js` re-injects it. Every deployable script must start with the `@NApiVersion / @NScriptType / @NModuleScope` header, or NetSuite rejects the deploy. `pnpm watch` does not run this step.
3. Never edit `src/FileCabinet/SuiteScripts/` by hand: `pnpm build` generates it and `prebuild` wipes it on every run.
4. `pnpm watch` does not format, and `tsc` emits no JS on a type error (`noEmitOnError`). Use `pnpm build` to validate.
5. Before finishing a change, run `pnpm build && pnpm test && pnpm lint`; all three must pass.

## Architecture rules

Dependencies point inward: `restlet → usecase → domain`. The repository implements a port the use case declares.

- `domain/` has zero `N/*` imports. Only `repository/` imports `N/search`, `N/record`, `N/log`.
- Ports (`IXxxRepository`) live in `usecase/ports/`, never in `repository/`. Cross-feature use of a port is allowed (the `installment` use case consumes `customer`'s port).
- NetSuite IDs (`custentity_...`, record types) live only in the repository, in a `FIELDS` const next to a single `toDomain` mapper.
- Composition root (RESTlet): instantiate the repository once at module scope, parse the request, `new` the use case per request, return `JSON.stringify(useCase.execute(...))`. Reference: `suitescript/restlet/mc_rl_mcard_get_customer.ts`.
- One RESTlet per use case, no `?action=` dispatch. Inputs come from the query string or JSON body, never from SDF script parameters.
- Existing code does not fully follow these rules yet: `installment` and `invoice` declare their port inline in the use case file. Do not copy that pattern.

## Domain modeling

Not everything in `domain/` is a class. Use the piece type that fits:

1. **Entity**: identity plus rules over its own state. `XxxProps` (readonly), class with private readonly props, getters, `isX` / `hasX` / `canX` methods, `toJSON(): XxxJSON`. Example: `Customer`.
2. **Domain calculation**: pure functions with explicit input and output types, no identity. Inject the reference date for determinism. Example: installment amortization.
3. **Read model**: projection composing other features. Reuse their `XxxJSON` types (`Pick` / `Omit` allowed); no duplicated shapes, no rules. Example: sales-order summary.

Conventions:

- `I` prefix only for ports (`IXxxRepository`); data types have no prefix.
- The domain owns `XxxProps` / `XxxJSON`; the use case owns `XxxInput` / `XxxOutput`.
- File order: constants, types, entity, pure functions.
- Business rules live in the domain, not in use cases.
- Every domain has a domain test in `__test__/<feature>/`, using fakes instead of NetSuite mocks.
- No NetSuite field names in the domain, comments included.

## Code conventions

- Every endpoint returns `ApiResponse<T>` (`{ success, data, message, error }`) through `success()` / `failure()` from `shared/response.ts`. User-facing `message` strings are in Spanish.
- Log with `N/log`, never `console`. `N/log` only has `debug`, `audit`, `error` and `emergency` (no `warn` or `info`).
- Biome is stricter than defaults: `noExplicitAny`, `noConsole` and `noDoubleEquals` are errors; `lineWidth: 100`, single quotes, semicolons, trailing commas. `organizeImports` is off for `src/TypeScripts`: preserve manual import order.
- Identifiers and code in English. Comments mix Spanish and English: match the file you are editing.
