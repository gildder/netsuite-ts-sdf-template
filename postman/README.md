# Postman — Multicard API

Colección lista para probar los RESTlets de multicard-api en NetSuite.

## Archivos

- `multicard-api.postman_collection.json` — los 8 RESTlets, con OAuth 1.0 (TBA) y la URL completa de cada endpoint.
- `multicard-api.postman_environment.json` — variables de cuenta y credenciales OAuth.

## Pasos

1. **Importar** en Postman: arrastrá los dos archivos (o Import → Files).
2. Seleccioná el environment **Multicard API - SB1** (arriba a la derecha).
3. Editá el environment y completá:
   - **Credenciales TBA** (tipo secret): `consumerKey`, `consumerSecret`, `token`, `tokenSecret`.
4. Ejecutá cualquier request. La firma OAuth 1.0 se arma sola.

## Qué incluye la colección

- **Obtener Cliente** — consulta un cliente Multicard por número de documento.
- **Obtener Cliente por Id** — consulta un cliente por id interno de NetSuite.
- **Obtener Factura** — recupera la factura asociada a la compra.
- **Obtener Estado y Saldo del Cliente** — devuelve `enabled` y `availableBalance`.
- **Obtener Resumen de OV Multicard** — devuelve orden de venta, factura, cliente y cuotas.
- **Obtener OV por Documento de Cliente** — lista paginada de órdenes de venta Multicard.
- **Validar Cliente para Compra** — valida si el cliente puede comprar.
- **Generar Cuotas** — crea cuotas desde un body JSON.

## Credenciales (de dónde salen)

- **Consumer Key / Secret** → Integration Record (Setup → Integration → Manage Integrations).
- **Token Id / Secret** → Access Token (Setup → Users/Roles → Access Tokens).
- El rol del token debe tener acceso al RESTlet y a los registros que consulta (cliente, factura, cuotas).

## Notas

- `realm` ya viene seteado en `5469654_SB1` (sandbox actual). Cambialo si usás otra cuenta.
- `restletUrl` apunta a `5469654-sb1`. Si cambia la cuenta, actualizá `accountId` y `restletUrl`.
- La colección ya trae los `script` y `deploy` dentro de cada request; no hace falta cargarlos en el environment.
- Los valores de inputs en cada request (ej. `documentNumber=20304050`) son de ejemplo; reemplazalos.
- ⚠️ No commitees el environment con credenciales reales cargadas. Compartilo vacío o usá un environment local.
