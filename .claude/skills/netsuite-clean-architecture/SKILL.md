---
name: netsuite-clean-architecture
description: Arquitectura del proyecto multicard-api (NetSuite SDF en TypeScript/AMD, Clean Architecture pragmática). Usar al crear o revisar features, casos de uso, puertos, repositorios o scripts de NetSuite (RESTlet, Suitelet, User Event, Map/Reduce, etc.), al decidir en qué capa va una responsabilidad o cómo modelar el dominio, y al validar la regla de dependencia.
---

# NetSuite Clean Architecture — multicard-api

Las reglas de arquitectura están en `AGENTS.md` (siempre cargado). Esta skill no las repite: indica cómo aplicarlas al crear o revisar código. Si algo contradice `AGENTS.md`, gana `AGENTS.md`.

Implementación de referencia, para copiar su forma: `get-customer` (RESTlet `mc_rl_mcard_get_customer.ts`, use case `get-customer.usecase.ts`, puerto `customer.repository.port.ts`, repositorio `customer.repository.ts`, dominio `customer.domain.ts`).

## Mapa de capas

Raíz: `src/TypeScripts/multicard-api/`.

| Responsabilidad | Ubicación | Archivo |
| --- | --- | --- |
| Entidades, cálculos y tipos del dominio | `features/<feature>/domain/` | `<feature>.domain.ts` |
| Caso de uso (orquesta, devuelve `ApiResponse<T>`) | `features/<feature>/usecase/` | `<accion>.usecase.ts` |
| Puerto (`IXxxRepository`) | `features/<feature>/usecase/ports/` | `<feature>.repository.port.ts` |
| Adaptador NetSuite (`NetSuiteXxxRepository`) | `features/<feature>/repository/` | `<feature>.repository.ts` |
| Script de NetSuite (entry point y composition root) | `suitescript/<tipo>/` | `mc_<prefijo>_mcard_<verb_noun>.ts` |
| Tipos usados por varios features | `shared/` | — |
| Objeto SDF del script | `src/Objects/<tipo>/` | `customscript_mc_<prefijo>_mcard_<nombre>.xml` |
| Tests | `__test__/<feature>/` | `<accion>.usecase.test.js`, `<feature>.domain.test.js` |

Header JSDoc: todos los módulos llevan `@NApiVersion 2.1`. Los RESTlets agregan `@NScriptType Restlet` y `@NModuleScope SameAccount`; el resto usa `@NModuleScope Public`.

## Prefijos por tipo de script

Todo script en `suitescript/` se nombra `mc_<prefijo>_mcard_<verb_noun>.ts`, con una subcarpeta por tipo de script nombrada como el tipo en minúsculas (por ejemplo, `suitescript/restlet/` y `src/Objects/restlet/`):

| Prefijo | Tipo de script |
| --- | --- |
| `cs` | Client Script |
| `ue` | User Event |
| `sl` | Suitelet |
| `rl` | RESTlet |
| `pl` | Portlet |
| `ss` | Scheduled |
| `mr` | Map/Reduce |
| `gl` | SuiteGL |
| `wa` | Workflow Action |
| `mu` | Mass Update |
| `bi` | Bundle Installation |

Cualquier tipo de script es un adaptador de entrada: solo traduce el evento de NetSuite a una llamada a un use case y actúa como composition root. Las reglas de negocio no van en el script.

## Elegir la pieza de dominio

1. ¿Tiene identidad y reglas sobre su propio estado? → **Entidad** (clase con `XxxProps`, getters, `isX`/`hasX`/`canX`, `toJSON()`).
2. ¿Es una transformación sin identidad (montos, fechas, tablas)? → **Cálculo de dominio** (funciones puras; la fecha de referencia se inyecta).
3. ¿Solo combina datos de otros features para una respuesta? → **Read model** (tipos que reutilizan los `XxxJSON` de esos features, sin reglas).

Si una entidad no tiene comportamiento, es un tipo, no una clase.

## Workflow: nuevo caso de uso expuesto como RESTlet

Copiar este checklist y marcarlo durante el trabajo:

- [ ] 1. Dominio: agregar o ajustar la pieza correspondiente. Las reglas de negocio nuevas van aquí, no en el use case.
- [ ] 2. Puerto: declarar o extender `IXxxRepository` en `usecase/ports/`, con métodos en términos del negocio (`findByDocumentNumber`, no `runSearch`).
- [ ] 3. Repositorio: implementar el puerto. IDs de NetSuite en `FIELDS`; un único mapper `toDomain` que devuelve piezas del dominio.
- [ ] 4. Use case: una clase con `execute(...)`, dependencias por constructor tipadas con el puerto, respuesta con `success()`/`failure()` y `message` en español.
- [ ] 5. RESTlet: un archivo nuevo. Repositorio instanciado a nivel de módulo, validación de parámetros del request, `new` del use case por request, `JSON.stringify(useCase.execute(...))`. Sin lógica de negocio.
- [ ] 6. Objeto SDF: `customscript_mc_rl_mcard_<nombre>.xml` en `src/Objects/restlet/`.
- [ ] 7. Tests: test del use case con un fake literal del puerto (sin mocks de `N/*`); test de dominio si hay reglas o cálculos nuevos.
- [ ] 8. Validar con `pnpm build && pnpm test && pnpm lint` y con el checklist de revisión. Si algo falla, corregir y repetir desde el paso que corresponda.

Un caso de uso interno, sin endpoint, omite los pasos 5 y 6.

## Checklist de revisión arquitectónica

Ejecutar desde `src/TypeScripts/multicard-api/`. Cada comando debe dar 0 resultados:

- Dominio y use cases sin NetSuite: `rg -n "from 'N/" features/*/domain features/*/usecase`
- IDs de NetSuite solo en repositorios: `rg -n "cust(entity|body|record)_" features/*/domain features/*/usecase suitescript`
- Use cases sin instanciar adaptadores: `rg -n "new NetSuite" features/*/usecase`
- Puertos fuera de `ports/`: `rg -n "^export interface I\w+Repository" features/*/usecase --glob '!**/ports/**'`
- RESTlets sin despacho por acción: `rg -n "action" suitescript/restlet`

Además, revisar a mano:

- Cada RESTlet expone un único use case.
- Los use cases no repiten reglas que deberían ser métodos del dominio.
- Los read models no redefinen shapes que ya existen como `XxxJSON` en otro feature.
- Los tipos de datos no llevan prefijo `I`; solo los puertos.

## Anti-patrones

- **RESTlet con varias acciones** (`?action=` o despacho por parámetros): un archivo y un use case por endpoint.
- **Puerto inline** en el archivo del use case: va en `usecase/ports/`. Parte del código existente todavía lo hace; no tomarlo como modelo.
- **Use case que instancia su repositorio:** el repositorio llega por constructor y se crea en el script (composition root).
- **Read model con shapes copiadas** de otros features: reutilizar sus `XxxJSON`.
- **Refactor por uniformidad:** el código existente que no se toca no se reescribe solo para estandarizarlo; se ajusta al modificarlo.
