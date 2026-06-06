# Postman — Multicard API

Colección lista para probar los RESTlets de multicard-api en NetSuite.

## Archivos

- `multicard-api.postman_collection.json` — los 7 RESTlets, con OAuth 1.0 (TBA) ya configurado a nivel colección.
- `multicard-api.postman_environment.json` — variables (cuenta, credenciales, ids de script/deployment).

## Pasos

1. **Importar** en Postman: arrastrá los dos archivos (o Import → Files).
2. Seleccioná el environment **Multicard API - SB1** (arriba a la derecha).
3. Editá el environment y completá:
   - **Credenciales TBA** (tipo secret): `consumerKey`, `consumerSecret`, `token`, `tokenSecret`.
   - **Ids de cada RESTlet**: `script_*` y `deploy_*` con los **ids numéricos** que muestra cada Script Deployment en NetSuite tras el deploy.
4. Ejecutá cualquier request. La firma OAuth 1.0 se arma sola.

## Credenciales (de dónde salen)

- **Consumer Key / Secret** → Integration Record (Setup → Integration → Manage Integrations).
- **Token Id / Secret** → Access Token (Setup → Users/Roles → Access Tokens).
- El rol del token debe tener acceso al RESTlet y a los registros que consulta (cliente, factura, cuotas).

## Notas

- `realm` ya viene seteado en `5469654_SB1` (sandbox actual). Cambialo si usás otra cuenta.
- `restletUrl` apunta a `5469654-sb1`. Si cambia la cuenta, actualizá `accountId` y `restletUrl`.
- Los valores de inputs en cada request (ej. `documentNumber=20304050`) son de ejemplo; reemplazalos.
- ⚠️ No commitees el environment con credenciales reales cargadas. Compartilo vacío o usá un environment local.
