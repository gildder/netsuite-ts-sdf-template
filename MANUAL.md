# Manual de uso — Multicard API (RESTlets)

Guía para **consumir** los RESTlets del proyecto. Para arquitectura y convenciones
ver el [README](README.md).

---

## 1. Cómo se llaman los RESTlets

Todos los RESTlets reciben sus datos por el **request HTTP**:

- `GET` → parámetros en la **query string** (`?documentNumber=123`)
- `POST` → datos en el **body JSON**

### Formato de URL

```text
https://<ACCOUNT-ID>.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=<SCRIPT_ID>&deploy=<DEPLOY_ID>
```

- `<ACCOUNT-ID>` de la sandbox actual: `5469654-sb1`
- `<SCRIPT_ID>` / `<DEPLOY_ID>` son los **ids numéricos internos** que aparecen en
  el registro Script Deployment después del deploy (no el `scriptid` de texto)
- En GET, agregá los inputs como query params: `&documentNumber=123`

---

## 2. Autenticación (TBA / OAuth 1.0)

Credenciales necesarias:

- **Integration Record** → Consumer Key + Consumer Secret
- **Access Token** (Setup → Users/Roles → Access Tokens) → Token Id + Token Secret
- El rol del token debe tener acceso al RESTlet y a los registros que toca
  (cliente, factura, cuotas)

Datos para firmar la petición OAuth 1.0:

- Signature Method: `HMAC-SHA256`
- Version: `1.0`
- **Realm**: `5469654_SB1` (en mayúscula y con guion bajo — obligatorio)

---

## 3. Postman (forma más fácil)

En la carpeta [`postman/`](postman/) están los archivos listos para compartir:

- `multicard-api.postman_collection.json` — los 8 RESTlets ya armados, con la URL
  completa de cada endpoint
- `multicard-api.postman_environment.json` — variables de cuenta y credenciales OAuth

Pasos:

1. En Postman: **Import** → arrastrá los dos archivos.
2. Arriba a la derecha, seleccioná el environment **Multicard API - SB1**.
3. Editá el environment y completá: `consumerKey`, `consumerSecret`, `token`,
   `tokenSecret`.
4. Ejecutá cualquier request. La auth OAuth 1.0 ya está configurada a nivel
   colección; no hay que tocar nada más.

---

## 4. Respuesta

Todas las respuestas son un `ApiResponse<T>` en JSON:

```json
{ "success": true,  "data": { }, "message": "", "error": null }
```

```json
{ "success": false, "data": null, "message": "motivo", "error": "motivo" }
```

---

## 5. Referencia de endpoints

| Endpoint | HTTP | Inputs | Descripción |
| --- | --- | --- | --- |
| Obtener Cliente | GET | `documentNumber` | Devuelve el detalle del cliente Multicard buscado por número de documento. |
| Obtener Cliente por Id | GET | `customerId` | Devuelve el detalle del cliente Multicard usando el id interno de NetSuite. |
| Obtener Factura | GET | `invoiceId` | Devuelve la factura asociada a una compra Multicard. |
| Obtener Estado y Saldo del Cliente | GET | `documentNumber`, `complemento?` | Devuelve si el cliente está habilitado y cuál es su saldo disponible actual. |
| Obtener Resumen de OV Multicard | GET | `salesOrderId` | Devuelve el resumen completo de una transacción Multicard: orden de venta, factura, cliente y cuotas. |
| Obtener OV por Documento de Cliente | GET | `documentNumber`, `complemento?`, `page?` | Lista paginada de órdenes de venta Multicard para un cliente. |
| Validar Cliente para Compra | GET | `documentNumber` | Valida si el cliente puede comprar según estado, mora, teléfono y saldo. |
| Generar Cuotas | POST | body JSON (ver abajo) | Genera las cuotas de una compra y revierte toda la operación si ocurre una falla parcial. |

### Ejemplos GET

```text
?script=6624&deploy=1&documentNumber=20304050
?script=6623&deploy=1&customerId=12345
?script=6625&deploy=1&invoiceId=67890
?script=6824&deploy=1&documentNumber=20304050
?script=customscript_mc_rl_mcard_get_so_summary&deploy=customdeploy_mc_rl_mcard_get_so_summary&salesOrderId=55555
?script=customscript_mc_rl_mcard_get_so_custdoc&deploy=customdeploy_mc_rl_mcard_get_so_custdoc&documentNumber=20304050&complemento=01&page=0
?script=6628&deploy=1&documentNumber=20304050
```

### GET - Obtener Estado y Saldo del Cliente

Inputs:

- `documentNumber` requerido
- `complemento` opcional

Respuesta exitosa típica:

```json
{
  "success": true,
  "data": {
    "habilitado": "Sí",
    "saldoDisponible": 1250
  },
  "message": "",
  "error": null
}
```

Notas:

- Si el cliente tiene cuotas en mora, `habilitado` devuelve `No, con Mora`.
- Si se envía `complemento`, debe coincidir con el del cliente encontrado.
- El `saldoDisponible` se calcula como límite de crédito menos balance actual (`límite - balance`).

### GET - Obtener Resumen de OV Multicard

Inputs:

- `salesOrderId` requerido

Respuesta exitosa: devuelve `salesOrderID`, `invoice`, `customer` e `installments`.

### GET - Obtener OV por Documento de Cliente

Inputs:

- `documentNumber` requerido
- `complemento` opcional
- `page` opcional, base 0

Respuesta exitosa: devuelve `salesOrders` y `page`.

### POST — Generar Cuotas

| Campo | Tipo | Requerido | Validación |
| --- | --- | --- | --- |
| `customerId` | string | sí | no vacío |
| `invoiceId` | string | sí | no vacío |
| `amount` | number | sí | > 0 (monto financiado) |
| `nroInstallment` | number | sí | > 0 (cantidad de cuotas) |
| `paymentDay` | number | sí | entre 1 y 31 |
| `customerType` | string | sí | `'1'` normal · `'2'` empleado · `'3'` corporativo |

```json
{
  "customerId": "12345",
  "invoiceId": "67890",
  "amount": 100000,
  "nroInstallment": 6,
  "paymentDay": 10,
  "customerType": "1"
}
```

Notas:

- `customerType='2'` (empleado) → amortización simple sin interés. `'1'`/`'3'` →
  amortización francesa (tasa anual 34.92%).
- `paymentDay` puede dar error si el día no existe en el mes destino (ej. 31 en
  febrero).
- Ante una falla parcial, se revierten todas las cuotas creadas (compensación).
