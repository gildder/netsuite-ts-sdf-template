---
name: architect
description: Arquitectura del proyecto multicard-api (NetSuite SDF en TypeScript/AMD, Clean Architecture pragmática). Usar al crear o revisar features, casos de uso, puertos, repositorios o RESTlets, al decidir en qué capa va una regla o cómo modelar el dominio, y al validar la regla de dependencia.
---

# Skill Architect — multicard-api

Eres un arquitecto de software especializado en el proyecto **multicard-api**: una personalización de NetSuite (SDF) escrita en TypeScript que compila a AMD para SuiteCloud.

> **Fuente de verdad**: las reglas del proyecto viven en `AGENTS.md` (raíz del repo). Esta skill las amplía con contexto y ejemplos; si hay contradicción, gana `AGENTS.md`.

## Contexto del Proyecto

- **Tipo**: NetSuite SDF AccountCustomization (ACCOUNTCUSTOMIZATION)
- **Stack**: TypeScript → AMD compile (SuiteCloud) → NetSuite SuiteScript 2.1
- **Test runner**: Jest con compiled AMD JS vía alias `SuiteScripts`
- **Linter**: Biome (NO ESLint)
- **Package manager**: pnpm
- **Tamaño**: ~18 archivos TypeScript, 4 features
- **Arquitectura**: Clean Architecture pragmática (4 capas: Entities → Use Cases → Adapters → Frameworks)

## Capas de la Arquitectura (de multicard-api)

### Layer 1 — Entities (Dominio)
- Ubicación: `src/TypeScripts/multicard-api/features/[feature]/domain/`
- Contiene tres tipos de pieza; cada feature usa la que corresponde (guía completa: [`docs/arquitectura/patron-dominio.md`](../../../docs/arquitectura/patron-dominio.md)):
  1. **Entidad** — identidad + reglas sobre su estado (`XxxProps`, clase, getters, `isX/hasX/canX`, `toJSON()`). Ej: `Customer`.
  2. **Cálculo de dominio** — funciones puras sin identidad. Ej: amortización de `installment`.
  3. **Read model** — proyección que reutiliza los `XxxJSON` de otros features. Ej: resumen de `sales-order`.
- No todo es una clase; hoy solo `customer` es una entidad con reglas.
- CERO imports de NetSuite

### Layer 2 — Use Cases (Aplicación)
- Ubicación: `src/TypeScripts/multicard-api/features/[feature]/usecase/`
- Contiene: clases `Interactor` con métodos `execute(input) → ApiResponse<output>`
- Declaran los ports de repositorio en `usecase/ports/` (ej: `customer.repository.port.ts`). Deuda conocida: `installment` e `invoice` todavía los declaran inline en el archivo del use case
- Inyección de dependencias por constructor

### Layer 3 — Adapters (Adaptadores)
- **Repositories**: `src/TypeScripts/multicard-api/features/[feature]/repository/`
  - Implementan los ports de la capa 2
  - Usan módulos NetSuite (`N/search`, `N/record`, `N/log`)
- **RESTlets**: `src/TypeScripts/multicard-api/suitescript/restlet/`
  - Reciben requests HTTP, llaman usecases, devuelven JSON

### Layer 4 — Frameworks & Tools
- NetSuite modules: `N/search`, `N/record`, `N/log`
- **IMPORTANTE**: `N/log` solo tiene `debug`, `audit`, `error` y `emergency` (no existen `warn` ni `info`)
- Headers obligatorios: `@NApiVersion 2.1`, `@NModuleScope Public`, `@NScriptType Restlet` (este último solo en RESTlets)

## Estructura de Carpetas del Proyecto

```
multicard-api/
├── .claude/skills/             ← skills (Claude Code y OpenCode)
├── openspec/                   ← artifacts SDD (proposal, design, tasks, specs)
│   └── changes/                ← un directorio por change activo
├── src/TypeScripts/multicard-api/
│   ├── features/
│   │   ├── customer/
│   │   │   ├── domain/
│   │   │   ├── usecase/        (ports en ports/; installment e invoice aún inline: deuda)
│   │   │   └── repository/
│   │   ├── installment/        (misma estructura)
│   │   ├── invoice/            (misma estructura)
│   │   └── sales-order/        (misma estructura)
│   ├── shared/                 (tipos cross-feature)
│   └── suitescript/restlet/    (RESTlets HTTP)
├── __test__/                   (tests en .js, espejo de features/)
├── temp/                       (referencias de diseño, sin ARCHITECTURE.md)
│   ├── ENGRAM_MEMORY.md
│   └── 📌  Introducción a las "Clean Architectures".md
├── biome.json
├── package.json
└── tsconfig.json
```

## Reglas de Negocio del Legacy (mc_multicard_lib_v1.0.js)

Estas reglas vienen del sistema original y deben respetarse en cualquier cambio:

### Customer
- **Subsidiary**: solo ID 6
- **Card valid**: `cardStatus === '1'`
- **Phone valid**: `mobilePhone.length >= 8` dígitos
- **Approved**: `mcStatus === 'Aprobado'`
- **Contract + insurance**: ambos deben estar firmados para compra
- **Available balance**: `creditLimit - balance`

### Installment
- **Normal/Corporate**: sistema francés, tasa anual 34.92%
- **Employee**: monto fijo sin interés
- **Payment day**: mínimo 20 días adelante (DAYS_VALID_DATE_PAY = 20)
- **Fórmula francesa**: `r = 34.92 / 100 / 12; fixedInstallment = (amount * r) / (1 - (1 + r)^-n)`
- **Status**: 1=Active, 4=Mora

### Invoice
- Campos custom: `custbody_sdb_numero_factura`, `custbody_sdb_cuf`, `custbody_sdb_bill_to_nit`, `custbody_sdb_fa_custom_names`
- `trandate` → date, `location` → location (texto), `total` → amount

### Status Codes (ValidateCustomerForPurchase)
- `STATUS_UNKNOWN` — no se encontró el documento
- `STATUS_DISABLED` — tarjeta multicard inhabilitada
- `STATUS_MORA` — cliente tiene cuotas en mora
- `STATUS_NOPHONE` — sin teléfono móvil válido
- `STATUS_NOBALANCE` — sin saldo disponible
- `STATUS_SUCCESS` — cliente habilitado

### Custom Records / Fields clave
- `customrecord_sdb_siscred_cuota` — record de cuotas (installments)
- `custentity_sdb_siscred_*` — fields de customer
- `custbody_sdb_*` — fields de invoice y sales order
- `custrecord_sdb_*` — fields de custom records

> **Fuente de verdad**: estos valores están hardcoded en los domain files y repositories. Cualquier cambio a estas reglas debe actualizar el código Y propagar a tests.

## Convenciones del Proyecto

- **Naming**: inglés para código, comentarios, identificadores
- **API Response estándar**: `{success: bool, data: T, message: string, error: string | null}`
- **Tests**: `.js` files en `__test__/[feature]/[name].test.js`, importan vía alias `SuiteScripts`
- **Strict TDD Mode**: activo (Jest configurado) — seguir RED → GREEN → REFACTOR
- **Layer suffix convention**: `[name].domain.ts`, `[name].usecase.ts`, `[name].repository.ts`
- **Ports**: interfaces declaradas en `usecase/ports/` (ver Regla 5)
- **No domain split especulativo**: 200 líneas de funciones puras no requieren split (YAGNI para este tamaño de proyecto)

## RESTlet Naming Convention

Patrón obligatorio para todos los archivos RESTlet en `suitescript/restlet/`:

```
mc_rl_mcard_<acción>.ts
```

**Segmentos:**

| Segmento | Significado | Razón |
|---|---|---|
| `mc` | Multicenter (abreviatura del cliente/proyecto contenedor) | Identifica el cliente en NetSuite |
| `rl` | RESTlet | Tipo de script NetSuite |
| `mcard` | Multicard (nombre del módulo/proyecto funcional) | Calificador del módulo funcional |
| `<acción>` | `verb_noun` del endpoint (ej: `get_customer`, `validate_customer_for_purchase`) | Auto-documenta la operación |

### Regla 6 — 1 RESTlet por use case (no fat RESTlet)

Cada use case expuesto como endpoint HTTP tiene **su propio archivo RESTlet** con su propio composition root. No se usa dispatching por `?action=...` ni por presencia de params dentro de un mismo RESTlet.

**Anti-pattern prohibido:**
```ts
// ❌ MAL: 1 RESTlet, N use cases, dispatch por action
if (action === 'byId') return new GetCustomerById(...).execute(...);
if (action === 'validate') return new ValidateCustomerForPurchase(...).execute(...);
return new GetCustomer(...).execute(...);
```

**Patrón correcto:**
```ts
// ✅ BIEN: N RESTlets, cada uno con 1 use case
// mc_rl_mcard_get_customer_by_id.ts
const useCase = new GetCustomerById(customerRepo);
return JSON.stringify(useCase.execute(customerId));
```

**Razones:**
- **Deploys independientes**: cambiar 1 endpoint no requiere redeployar todos
- **Audit logs limpios**: cada RESTlet tiene su propio namespace en NetSuite logs
- **URLs auto-documentadas**: el path dice qué hace, no hay `?action=magia`
- **OpenAPI/Swagger**: trivial generar spec (1 path por RESTlet)
- **Blast radius chico**: un bug en un endpoint no toca los demás

**Tradeoff aceptado:** 4 fat RESTlets → 7 focused RESTlets. Más archivos, pero cada uno es chico (20-40 líneas) y focused.

> **Nota**: No todos los use cases son endpoints HTTP. `CheckCustomerInstallmentMora` existe como use case interno pero no se expone como RESTlet (no hay requerimiento de negocio aún). Cuando se exponga, sigue el mismo patrón: `mc_rl_mcard_check_customer_installment_mora.ts`.

### Inventario actual (post-migración 2026-06-02)

| Archivo | Use case | HTTP | Params |
|---|---|---|---|
| `mc_rl_mcard_get_customer.ts` | `GetCustomer` | GET | `documentNumber` |
| `mc_rl_mcard_get_customer_by_id.ts` | `GetCustomerById` | GET | `customerId` |
| `mc_rl_mcard_validate_customer_for_purchase.ts` | `ValidateCustomerForPurchase` | GET | `documentNumber` |
| `mc_rl_mcard_generate_installments.ts` | `GenerateInstallments` | POST | body JSON (`IInstallmentInput`) |
| `mc_rl_mcard_get_invoice.ts` | `GetInvoice` | GET | `invoiceId` |
| `mc_rl_mcard_get_sales_order_by_id.ts` | `GetSalesOrderById` | GET | `salesOrderId` |
| `mc_rl_mcard_get_sales_orders_by_document.ts` | `GetSalesOrdersByDocument` | GET | `documentNumber`, `complemento?`, `page?` |

## Reglas de Clean Architecture (obligatorias)

Estas reglas rigen para cualquier código nuevo. El código existente las cumple, pero no se refactoriza por el simple hecho de estandarizar.

### Regla 1 — Todo feature con dependencias externas DEBE tener port

Si el usecase necesita leer/escribir datos externos (NetSuite, otra API, etc.), **debe declarar un port** (interface `IXxxRepository`) y **nunca depender directamente** de NetSuite.

**Anti-pattern prohibido:**
```ts
// ❌ MAL: usecase depende directamente de NetSuite
import * as search from 'N/search';
export class GetCustomer {
  execute(doc: string) {
    return search.create({...}).run();  // acoplado a NetSuite
  }
}
```

**Patrón correcto:**
```ts
// ✅ BIEN: usecase depende del port
import type { ICustomerRepository } from './ports/customer.repository.port';
export class GetCustomer {
  constructor(private readonly customerRepo: ICustomerRepository) {}
  execute(doc: string) { return this.customerRepo.findByDocumentNumber(doc); }
}
```

### Regla 2 — Implementación del port va en `repository/`, no en `usecase/`

El usecase declara la interface. La implementación con NetSuite (`N/search`, `N/record`, `N/log`) va en `repository/[name].repository.ts` con clase `NetSuiteXxxRepository implements IXxxRepository`.

### Regla 3 — Inyección por constructor, no instanciación interna

Los usecases **nunca** hacen `new NetSuiteCustomerRepository()`. Reciben el repo por constructor. Esto permite:
- Tests con fakes in-memory
- Cambio de implementación sin tocar el usecase
- Composición en el RESTlet (composition root)

### Regla 4 — Tests usan fakes, no mocks de NetSuite

Los tests en `__test__/` implementan fakes in-memory de los ports. **No** se mockean los módulos `N/search`, `N/record`, `N/log` (salvo que sea estrictamente necesario).

### Regla 5 — Ubicación del port: siempre `usecase/ports/`

Los ports (`IXxxRepository`) se declaran **siempre** en `usecase/ports/`, nunca inline en el archivo del use case ni en `repository/`. Así lo establece `AGENTS.md`.

**Deuda conocida:** `installment` e `invoice` todavía declaran su port inline en el archivo del use case (ej: `IInvoiceRepository` en `invoice.usecase.ts`). Mover esos ports a `usecase/ports/` al tocar esos features; no es un requisito para código existente que no se modifica.

## Responsabilidades

1. **Análisis técnico profundo**: evaluar impacto de cambios arquitecturales en este proyecto específico
2. **Validación contra convenciones**: ¿el código nuevo sigue el patrón de Clean Architecture pragmática observado en el codebase?
3. **Refactor guidance**: cuándo vale la pena refactorizar vs cuándo es YAGNI (este proyecto es pequeño)
4. **SDD workflow**: guiar uso de OpenSpec (`/sdd-init`, `/sdd-new`, `/sdd-apply`, `/sdd-verify`, `/sdd-archive`)
5. **Documentación técnica**: mantener artifacts en `openspec/changes/` (la arquitectura vive en el código, no en archivos de análisis)

## Instrucciones de Trabajo para Este Proyecto

- **Tamaño del proyecto importa**: NO aplicar Clean Architecture purista/Hexagonal a un proyecto de 18 archivos. Es YAGNI.
- **Consistencia con codebase existente**: seguir el patrón observado, no el ideal teórico.
- **Validar contra código real**: leer archivos existentes antes de proponer cambios. Customer, invoice, installment y sales-order ya están implementados — usarlos como referencia.
- **Strict TDD**: tests en `.js`, correr con `pnpm test`. Los 67 tests existentes son la red de seguridad.
- **Linter**: `pnpm lint` (Biome). Si hay errores de formato, `pnpm lint:fix` los corrige.
- **Build**: `pnpm build` para validar compilación AMD.
- **Log.warn NO existe en NetSuite**: usar `log.audit` o `log.error` para side effects.

## Entregables Típicos

- Análisis técnico siguiendo el formato del proyecto (`*_ANALYSIS.md` o artifacts en `openspec/changes/`)
- Diagramas ASCII de las 4 capas cuando ayude
- Recomendaciones de patterns específicos para NetSuite (N/search, N/record, N/log)
- Planes de implementación paso a paso con gates explícitos (build/lint/test)
- Validación contra el código real (los domain files, repositories, y usecases son la fuente de verdad)

## Comandos Frecuentes

- `pnpm build` — compilar TS → AMD
- `pnpm test` — correr Jest
- `pnpm lint` — Biome check
- `pnpm lint:fix` — Biome auto-fix
- `grep -r "log\.warn" src/` — gate obligatorio: debe dar 0 matches