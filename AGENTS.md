# AGENTS.md

Reglas para agentes de código (Claude Code, OpenCode, etc.) que trabajan en este repositorio. La descripción del proyecto, la instalación, los comandos, los tests y la estructura de carpetas están en `README.md`; léelo antes de modificar código.

## Gotchas críticos

1. Los tests corren contra el JS compilado, no contra el código TS. Ejecuta `pnpm build` antes de `pnpm test`; de lo contrario se prueba código desactualizado o inexistente.
2. `tsc` elimina el JSDoc a nivel de archivo al generar AMD; `scripts/inject-headers.js` lo vuelve a insertar. Todo script desplegable debe comenzar con el header `@NApiVersion / @NScriptType / @NModuleScope`, o NetSuite rechaza el deploy. `pnpm watch` no ejecuta este paso.
3. Nunca edites `src/FileCabinet/SuiteScripts/` a mano: lo genera `pnpm build` y `prebuild` lo borra en cada ejecución.
4. `pnpm watch` no formatea, y `tsc` no genera JS si hay un error de tipos (`noEmitOnError`). Usa `pnpm build` para validar.
5. Antes de dar por terminado un cambio, ejecuta `pnpm build && pnpm test && pnpm lint`; los tres deben pasar.

## Arquitectura

Antes de crear, modificar o revisar código en `src/TypeScripts/`, carga la skill `netsuite-clean-architecture` (`.claude/skills/netsuite-clean-architecture/SKILL.md`). Contiene las reglas de arquitectura, el patrón de modelado del dominio, los prefijos de nombre de los scripts y el checklist de revisión.

## Convenciones de código

- Registra logs con `N/log`, nunca con `console`. `N/log` solo tiene `debug`, `audit`, `error` y `emergency` (no existen `warn` ni `info`).
- Biome es más estricto que su configuración por defecto: `noExplicitAny`, `noConsole` y `noDoubleEquals` son errores; `lineWidth: 100`, comillas simples, punto y coma y comas finales. `organizeImports` está desactivado en `src/TypeScripts`: conserva el orden manual de los imports.
- Identificadores y código en inglés. Los comentarios mezclan español e inglés: sigue el idioma del archivo que estás editando.
