# multicard-api

NetSuite SDF customization for the Multicenter/Multicard module. TypeScript source compiles to AMD (SuiteScript 2.1) and deploys to NetSuite. Built with pragmatic Clean Architecture (4 layers) and a 1-RESTlet-per-use-case convention.

> 📖 **Operations & usage:** see the [Manual](MANUAL.md) for endpoint reference, request/response shapes, TBA authentication, the SDF object structure, and the request-driven design decision (why RESTlets use **no** script parameters).

## Requirements

- **Node.js:** v22.x (LTS) or higher
- **Package Manager:** [pnpm](https://pnpm.io/) v9.x
- **Java:** Oracle JDK 21 — required for the SuiteCloud SDK
- **SuiteCloud CLI:** `@oracle/suitecloud-cli` v3.x+ (install globally with `npm install -g @oracle/suitecloud-cli`)
- **NetSuite Account:** "SuiteCloud Development Integration" (245955) bundle installed in the target environments

## Initial Setup

```bash
git clone <repository-url>
cd multicard-api
pnpm install
pnpm setup        # authenticates to your NetSuite account
```

### VS Code (recommended)

- **[SuiteCloud Extension](https://marketplace.visualstudio.com/items?itemName=Oracle.suitecloud-vscode-extension)** — SDF integration and account management
- **[Biome](https://marketplace.visualstudio.com/items?itemName=biomejs.biome)** — real-time linting and formatting on save

## Stack

- **TypeScript source:** `src/TypeScripts/multicard-api/`
- **Compiled output:** `src/FileCabinet/SuiteScripts/multicard-api/`
- **Test runner:** Jest with `@oracle/suitecloud-unit-testing` stubs
- **Linter/Formatter:** Biome
- **Size:** ~28 TypeScript files across 4 features (`customer`, `installment`, `invoice`, `sales-order`)

## Architecture

Pragmatic Clean Architecture in 4 layers:

```
features/<feature>/
├── domain/          ← entities + value objects (zero NetSuite imports)
├── usecase/         ← use cases + ports (interface IXxxRepository)
└── repository/      ← NetSuite implementation (N/search, N/record, N/log)

suitescript/restlet/ ← driving adapters (HTTP entry points, composition root)
shared/              ← cross-feature types (ApiResponse, CUSTOMER_TYPE, status codes)
```

Full architecture guide lives in the architect agent:

- **Claude Code:** [`.claude/agents/architect/agent.md`](.claude/agents/architect/agent.md)
- **Opencode:** [`.opencode/skills/architect/SKILL.md`](.opencode/skills/architect/SKILL.md)

## RESTlet Naming Convention

Mandatory pattern for every RESTlet file in `suitescript/restlet/`:

```
mc_rl_mcard_<acción>.ts
```

| Segment    | Meaning                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------- |
| `mc`       | Multicenter (container project/client)                                                      |
| `rl`       | RESTlet (NetSuite script type)                                                              |
| `mcard`    | Multicard (functional module qualifier)                                                     |
| `<acción>` | `verb_noun` describing the endpoint (e.g. `get_customer`, `validate_customer_for_purchase`) |

**Rule: 1 RESTlet per use case.** Each HTTP endpoint lives in its own file with its own composition root. No `?action=...` dispatching, no multi-action RESTlets.

**Why this pattern:**

- Deploys are independent — changing one endpoint does not redeploy the rest
- Each RESTlet has its own namespace in the NetSuite Execution Log
- URLs are self-documenting (no magic `?action=validate` param)
- Blast radius is small — a bug in one endpoint does not affect the others

**Current inventory:**

| File                                            | Use case                      | HTTP | Params                                    |
| ----------------------------------------------- | ----------------------------- | ---- | ----------------------------------------- |
| `mc_rl_mcard_get_customer.ts`                   | `GetCustomer`                 | GET  | `documentNumber`                          |
| `mc_rl_mcard_get_customer_by_id.ts`             | `GetCustomerById`             | GET  | `customerId`                              |
| `mc_rl_mcard_validate_customer_for_purchase.ts` | `ValidateCustomerForPurchase` | GET  | `documentNumber`                          |
| `mc_rl_mcard_generate_installments.ts`          | `GenerateInstallments`        | POST | body JSON (`IInstallmentInput`)           |
| `mc_rl_mcard_get_invoice.ts`                    | `GetInvoice`                  | GET  | `invoiceId`                               |
| `mc_rl_mcard_get_sales_order_by_id.ts`          | `GetSalesOrderById`           | GET  | `salesOrderId`                            |
| `mc_rl_mcard_get_sales_orders_by_document.ts`   | `GetSalesOrdersByDocument`    | GET  | `documentNumber`, `complemento?`, `page?` |

## Build & Workflow

```bash
pnpm install      # install dependencies
pnpm build        # format TS source → tsc → inject NetSuite headers → format JS output
pnpm test         # run Jest
pnpm lint         # Biome check (no fixes)
pnpm lint:fix     # Biome auto-fix (safe fixes only)
pnpm watch        # tsc --watch (no format — use during iteration)
pnpm run deploy   # build → suitecloud project:deploy (use `run` to avoid pnpm 9.x workspace command conflict)
```

`pnpm build` is **self-healing**. It runs `biome format` on the TS source *before* `tsc`, so any line over `lineWidth: 100` is auto-split. After `tsc` and the header-injection step, it runs `biome format` again on the compiled JS output. You rarely need to run `pnpm lint:fix` manually.

> **Caveat**: `pnpm watch` only runs `tsc -w`. It does **not** run the format step. If a long line slips into the source, `watch` will not catch it. Use `pnpm build` before committing.

## Pre-deploy Gate

```bash
pnpm build && pnpm test && pnpm lint
```

All three must be green before `pnpm run deploy`. The build also runs as a `prebuild` hook that wipes the compiled output directory, so stale JS files from old renames never leak into a deploy.

## Acknowledgments

- **Oracle NetSuite SuiteCloud Team** — for the SuiteCloud SDK, SDF CLI, and VS Code extensions
- **[Head in the Cloud Development](https://github.com/headintheclouddev)** — for `@hitc/netsuite-types`, which makes strict compile-time type safety a reality for SuiteScript 2.x

## License

MIT
