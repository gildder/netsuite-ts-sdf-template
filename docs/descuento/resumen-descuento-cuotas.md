# Propuesta: descuentos de monto fijo sobre cuotas Multicard

**Tipo:** propuesta de implementación basada en el estado actual del sistema
**Fecha:** 30/09/2026
**Estado:** pendiente de revisión con el área solicitante
**Fuente analizada:** repositorio `NetSuite-Bundle-Prod-Test` (backup de scripts de NetSuite)

---

## 1. Resumen

- **Qué se pide:** aplicar descuentos de **monto fijo** a las cuotas Multicard. Se pueden descontar el cargo administrativo, la mora, el cargo de cobranza y el seguro. El **capital no** se descuenta.
- **Qué existe hoy:** la cuota ya tiene un mecanismo de descuento, pero **por días**. Un usuario carga los días a descontar en la cuota, y los scripts que calculan la mora y la cobranza los restan del cálculo.
- **Qué se propone:** **extender ese mismo mecanismo** con campos de descuento por monto. Los scripts que hoy calculan la mora y la cobranza también restarían el monto fijo.
- **Por qué conviene:** el descuento queda reflejado en los montos de la cuota, y todos los procesos que leen la cuota lo toman **sin modificarlos**. Esto incluye pagos, POS, extracto, certificado de deuda y reembolsos.
- **Cuánto cambia:** se modifican **3 scripts** y se agregan **4 campos** a la cuota.
- **Seguro:** es el único cargo que se factura y genera una deuda con la aseguradora. Se propone dejarlo para una **segunda fase**, cuando Contabilidad defina su tratamiento.

---

## 2. Estado actual

### 2.1 Cómo está compuesta una cuota

El record de la cuota es `customrecord_sdb_siscred_cuota`. Cada componente tiene un campo de **monto a cobrar** (`total_*`) y uno de **monto pagado** (`pago_*`).

| Componente | Monto a cobrar | Monto pagado | Cómo se calcula hoy | ¿Admite descuento? |
|---|---|---|---|---|
| Capital | `custrecord_sdb_total_capital` | `custrecord_sdb_pago_capital` | Fijo al generar la cuota (viene de la factura) | ❌ No |
| Cargo administrativo | `custrecord_sdb_total_cargoadministrativo` | `custrecord_sdb_pago_cargoadministrativo` | Fijo al generar la cuota | ✅ Sí |
| Mora | `custrecord_sdb_total_cargomora` | `custrecord_sdb_pago_cargomora` | Se recalcula: 0,1 % del capital pendiente × días de atraso | ✅ Sí |
| Cargo de cobranza | `custrecord_sdb_total_cobranza` | `custrecord_sdb_pago_cobranza` | Se recalcula: monto fijo por cada 30 días de atraso, hasta un máximo de 3 | ✅ Sí |
| Seguro | `custrecord_sdb_total_cargoseguro` | En `customrecord_sdb_pago_seguro` | Por cliente y por mes (12, o 15 con cesantía) | ✅ Sí (fase 2) |
| Total | `custrecord_sdb_total_total` | `custrecord_sdb_pago_total` | Suma de los componentes | — |

**Todos los procesos calculan lo que falta pagar de la misma forma:** `monto a cobrar − monto pagado`, componente por componente.

### 2.2 El mecanismo de descuento que ya existe (por días)

| Campo en la cuota | Qué hace |
|---|---|
| `custrecord_sdb_descuento_dias_mora` | Resta días al cálculo de la mora |
| `custrecord_sdb_descuento_d_cargo_cobr` | Resta días al cálculo del cargo de cobranza |

Funciona así:

| Paso | Qué pasa | Script |
|---|---|---|
| 1 | Un usuario abre la cuota en NetSuite y carga los días a descontar | Formulario de la cuota |
| 2 | Al guardar, se recalculan la mora y la cobranza restando esos días, y se actualizan los montos a cobrar | `Bundle 500705/SDB_calc_installment_mora.js` (User Event; solo corre desde la interfaz) |
| 3 | Todos los días, el proceso de mora recalcula la mora respetando los días de descuento | `Bundle 500705/sdb_set_monto_mora.js` (Map/Reduce) |
| 4 | Periódicamente, el proceso de cobranza recalcula el cargo respetando los días de descuento | `Bundle 500705/SDB_siscred_cargo_cobranza.js` (Map/Reduce) |
| 5 | Pagos, POS, extracto, etc. leen el monto a cobrar, que ya tiene el descuento aplicado | Sin cambios |

**Lo importante:** el descuento se guarda en un campo propio y lo aplican los mismos scripts que calculan el cargo. Por eso no se pierde cuando la mora se recalcula, y el resto del sistema no necesita saber que existe.

### 2.3 Tratamiento contable actual

| Componente | ¿Se factura? | Consecuencia para un descuento |
|---|---|---|
| Cargo administrativo | No, ingresa con el pago | Sin impacto contable: solo cobra menos |
| Mora | No, ingresa con el pago | Sin impacto contable: solo cobra menos |
| Cargo de cobranza | No, ingresa con el pago | Sin impacto contable: solo cobra menos |
| Seguro | **Sí** | Requiere nota de crédito. Además, `SDB_siscred_seguro_cpp.js` genera un asiento con la **cuenta por pagar a la aseguradora** |

---

## 3. Propuesta

### 3.1 Idea central

Se agregan **campos de descuento por monto** en la cuota, junto a los de días que ya existen. Los mismos 3 scripts que hoy aplican el descuento por días pasan a aplicar también el descuento por monto, usando esta fórmula:

```
Monto a cobrar del componente = Cálculo actual − Descuento por monto   (nunca menor a 0)
```

### 3.2 Campos nuevos en `customrecord_sdb_siscred_cuota`

Los IDs son sugeridos y siguen la convención actual.

| Campo (ID sugerido) | Tipo | Uso |
|---|---|---|
| `custrecord_sdb_descuento_monto_adm` | Moneda | Descuento fijo sobre el cargo administrativo |
| `custrecord_sdb_descuento_monto_mora` | Moneda | Descuento fijo sobre la mora |
| `custrecord_sdb_descuento_monto_cobr` | Moneda | Descuento fijo sobre el cargo de cobranza |
| `custrecord_sdb_descuento_motivo` | Texto | Justificación del descuento (auditoría) |

El registro de quién aplicó el descuento y cuándo queda en las **notas del sistema** (System Notes) de la cuota, igual que pasa hoy con los descuentos por días.

### 3.3 Cambios por script

| Script | Tipo | Cambio propuesto |
|---|---|---|
| `Bundle 500705/SDB_calc_installment_mora.js` | User Event | Al calcular la mora y la cobranza, restar también el descuento por monto (mínimo 0). Aplicar el descuento al cargo administrativo (ver 3.4). Si todos los componentes quedan saldados, pasar la cuota a **PAGADA** |
| `Bundle 500705/sdb_set_monto_mora.js` | Map/Reduce | Leer `descuento_monto_mora` y restarlo de la mora calculada (mínimo 0) |
| `Bundle 500705/SDB_siscred_cargo_cobranza.js` | Map/Reduce | Leer `descuento_monto_cobr` y restarlo del cargo calculado (mínimo 0) |

### 3.4 Caso particular: el cargo administrativo

A diferencia de la mora y la cobranza, el cargo administrativo **no se recalcula**: se fija al crear la cuota. Si al guardar se restara el descuento completo, cada nuevo guardado lo volvería a restar.

**Propuesta:** en el User Event, aplicar solo la **diferencia** entre el descuento anterior y el nuevo:

```
Nuevo cargo adm. = Cargo adm. actual − (Descuento nuevo − Descuento anterior)
```

Así, si se cambia o se anula el descuento, el cargo se ajusta correctamente. Si el descuento pasa a 0, el cargo vuelve a su valor original.

### 3.5 Qué NO hay que modificar

Estos procesos leen el monto a cobrar de la cuota, y ese monto ya tendría el descuento aplicado. **No requieren cambios**, solo pruebas de regresión:

| Grupo | Scripts |
|---|---|
| Aplicación de pagos | `SDB_siscred_pago.js`, `sdb_fee_payment_approval.js`, `mc_sc_get_sales_order_pos_gg_v1.0.js`, `mc_siscred_rl_get_payment_siscred.js` |
| Reembolsos | `sdb_mr_reembolso_siscred.js`, `sdb_wfa_reembolso_siscred.js`, `sdb_ue_reembolso_siscred.js` (trabajan sobre lo pagado, no sobre lo descontado) |
| POS | `sdb-pos-mc-restlet-GetInfoCuotas.js`, `sdb-pos-mc-rl-get-info-payment.js`, `sdb-pos-mc-restlet-getInfoCard.js` |
| Consultas y documentos | `mc_rl_cuota_details_gg_v1.0.js`, `SDB_sl_extracto_cliente.js`, `SDB_siscred_customer_state.js`, `mc_sl_certificado_deuda.js`, `siscred-suitelet.js`, `mc_rest_mcard_statemnt.js` |

---

## 4. Flujo operativo propuesto

| Paso | Quién | Acción |
|---|---|---|
| 1 | Usuario autorizado | Abre la cuota en NetSuite (igual que hoy para los descuentos por días) |
| 2 | Usuario autorizado | Carga el monto a descontar en el componente que corresponda y el motivo |
| 3 | Sistema (User Event) | Valida las reglas (ver sección 5) |
| 4 | Sistema (User Event) | Recalcula los montos a cobrar con el descuento aplicado |
| 5 | Sistema (User Event) | Si no queda nada por pagar, marca la cuota como **PAGADA** |
| 6 | Sistema (procesos diarios) | Los recálculos de mora y cobranza siguen respetando el descuento |
| 7 | Cliente / POS | Ve y paga el monto con descuento. El pago se aplica igual que hoy |

---

## 5. Validaciones propuestas

| Regla | Detalle |
|---|---|
| Sin descuento sobre capital | No se crea ningún campo de descuento para el capital |
| Monto no negativo | Los descuentos deben ser mayores o iguales a 0 |
| Tope por componente | El descuento no puede superar lo que falta pagar de ese componente |
| Solo cuotas abiertas | No se permite cargar descuentos en cuotas PAGADAS o REEMBOLSADAS |
| Motivo obligatorio | Si hay algún descuento por monto, el motivo es obligatorio |
| Permisos | Solo los roles autorizados pueden editar los campos de descuento (configuración de NetSuite, sin código) |

---

## 6. Comportamiento de la mora con descuento fijo

Con esta propuesta, la mora **sigue creciendo** después del descuento. El descuento fijo se resta siempre de la mora calculada al día.

| Día | Mora calculada | Descuento fijo | Mora a cobrar |
|---|---|---|---|
| Día 10 | 50 | 30 | 20 |
| Día 20 | 100 | 30 | 70 |

Si el negocio necesita **frenar** la mora, esa herramienta ya existe: el **descuento por días** (`descuento_dias_mora`). Los dos descuentos se pueden combinar.

---

## 7. Seguro (fase 2)

El seguro no entra en la primera fase por tres motivos:

| Motivo | Detalle |
|---|---|
| Se factura | Descontarlo requiere una nota de crédito al cliente |
| Deuda con la aseguradora | `SDB_siscred_seguro_cpp.js` genera un asiento con la cuenta por pagar a la aseguradora. Hay que definir si Multicenter absorbe el descuento o si se ajusta esa deuda |
| No es por cuota | Se cobra por cliente y por mes, con un monto fijo en el código (12, o 15 con cesantía, en `SDB_siscred_pago.js`) y se controla en `customrecord_sdb_pago_seguro`. Un descuento en la cuota no alcanza a ese proceso |

---

## 8. Propuesta por fases

| Fase | Alcance | Cambios | Impacto contable |
|---|---|---|---|
| **Fase 1** | Descuento fijo sobre cargo administrativo, mora y cobranza | 4 campos nuevos + 3 scripts modificados | Ninguno |
| **Fase 2** | Descuento sobre seguro | Nota de crédito, ajuste con la aseguradora, pasar el monto del seguro a parámetro | Sí; requiere definición de Contabilidad |

---

## 9. Observaciones del estado actual

Estas inconsistencias ya existen hoy. No bloquean la propuesta, pero conviene corregirlas en la misma intervención porque se tocan los mismos scripts:

| # | Observación | Script |
|---|---|---|
| 1 | Al recalcular desde la interfaz, el total de la cuota se arma como capital + administrativo + mora, **sin la cobranza** | `SDB_calc_installment_mora.js` |
| 2 | El proceso diario arma el total como capital + administrativo + cobranza + mora, **sin el seguro** | `sdb_set_monto_mora.js` |
| 3 | El proceso de cobranza actualiza el cargo pero **no actualiza el total** de la cuota | `SDB_siscred_cargo_cobranza.js` |
| 4 | Los días de mora se cuentan distinto: el proceso diario resta 1 día y el User Event no | `sdb_set_monto_mora.js` / `SDB_calc_installment_mora.js` |
| 5 | El monto del seguro está fijo en el código (12 / 15) | `SDB_siscred_pago.js` |

Hoy no hay riesgo de cobro incorrecto por estas diferencias, porque los pagos se calculan componente por componente y no con el total. Sí pueden verse montos totales distintos en las pantallas.

---

## 10. Decisiones pendientes del área solicitante

| # | Pregunta | Qué define |
|---|---|---|
| 1 | ¿Arrancamos con la Fase 1, o el seguro es necesario desde el inicio? | Alcance y dependencia con Contabilidad |
| 2 | ¿Es correcto que la mora siga creciendo después del descuento fijo (sección 6)? | Si alcanza con esta propuesta o hay que combinarla con descuento por días |
| 3 | ¿Qué roles pueden aplicar descuentos? ¿Hay monto máximo o hace falta aprobación? | Permisos y, si hace falta, un flujo de aprobación |
| 4 | ¿El descuento se aplica cuota por cuota, o se necesita descontar un monto total a repartir entre varias cuotas del cliente? | Si alcanza con el formulario de la cuota o hace falta una pantalla adicional |
| 5 | ¿El descuento debe mostrarse por separado en el extracto y en el POS, o alcanza con ver el monto final? | Si hay que modificar consultas (hoy no se modifican) |
| 6 | Seguro: ¿Multicenter absorbe el descuento frente a la aseguradora? | Tratamiento contable de la Fase 2 |

---

## 11. Plan de pruebas (sandbox)

| # | Escenario | Resultado esperado |
|---|---|---|
| 1 | Descuento sobre el cargo administrativo en una cuota pendiente | El cargo a cobrar baja en el monto del descuento |
| 2 | Cambiar el descuento administrativo de 10 a 15, y después a 0 | El cargo se ajusta en cada cambio y vuelve al original con 0 |
| 3 | Descuento sobre la mora y ejecución del proceso diario | La mora sigue neta del descuento después del recálculo |
| 4 | Descuento sobre la cobranza y ejecución del proceso de cobranza | El cargo sigue neto del descuento después del recálculo |
| 5 | Descuento mayor a lo que falta pagar | El sistema lo rechaza |
| 6 | Descuento que salda la cuota completa | La cuota pasa a PAGADA; si no quedan cuotas en mora, se reactiva la tarjeta |
| 7 | Pago parcial y total de una cuota con descuento (NetSuite y POS) | Se aplica sobre el monto neto y la cuota pasa a PAGADA al completarse |
| 8 | Reembolso de una cuota con descuento | Se devuelve solo lo pagado, nunca lo descontado |
| 9 | Consulta en extracto, POS y certificado de deuda | Muestran el saldo con el descuento aplicado |
| 10 | Descuento por días + descuento por monto en la misma cuota | Se aplican los dos |

---

## Anexo A. Scripts que usan los records de pago

Inventario inicial de los scripts que usan `customrecord_sdb_pago_seguro`, `customrecord_sdb_pago_cuota` o `customrecord_sdb_mc_pago_siscred`.

| # | Script | `pago_seguro` | `pago_cuota` | `mc_pago_siscred` |
|---|---|:-:|:-:|:-:|
| 1 | `backup-ns-bundle/Bundle 500705/SDB_siscred_pago.js` | ✅ | ✅ | ✅ |
| 2 | `backup-ns-bundle/Bundle 500705/sdb_mr_reembolso_siscred.js` | ✅ | ✅ | ✅ |
| 3 | `backup-ns-bundle/Bundle 500705/sdb_wfa_reembolso_siscred.js` | | ✅ | |
| 4 | `backup-ns-bundle/Bundle 500705/sdb_fee_payment_approval.js` | ✅ | | |
| 5 | `backup-ns-bundle/Bundle 499872/sdb-pos-mc-rl-get-info-payment.js` | ✅ | | |
| 6 | `backup-ns-bundle/Bundle 499872/sdb-pos-mc-restlet-GetInfoCuotas.js` | ✅ | | |
| 7 | `backup-netsuite/com.multicenter.projects/sales-order-pos/mc_sc_get_sales_order_pos_gg_v1.0.js` | | ✅ | ✅ |
| 8 | `backup-netsuite/com.multicenter.projects/siscred-reprocess-payment-customer/mc_siscred_rl_get_payment_siscred.js` | | | ✅ |
| 9 | `backup-netsuite/com.multicenter.projects/query-multicard/mc_rl_cuota_details_gg_v1.0.js` | ✅ | | |
| 10 | `backup-netsuite/com.multicenter.projects/certificate/mc_sl_certificado_deuda.js` | ✅ | | |
| 11 | `backup-netsuite/Local/mc_rest_mcard_statemnt.js` (copia local; confirmar si está desplegado) | ✅ | | ✅ |
| 12 | `backup-netsuite/SDB_siscred_customer_state.js` | ✅ | | |
| 13 | `backup-netsuite/SDB_sl_extracto_cliente.js` | ✅ | | ✅ |

## Anexo B. Alternativas evaluadas y descartadas

| Alternativa | Por qué se descartó |
|---|---|
| Restar el descuento directo del monto a cobrar, sin guardarlo aparte | Los procesos de mora y cobranza recalculan ese monto y el descuento se perdería |
| Registrar el descuento como un pago ficticio | Los reportes de cobranza mostrarían dinero que no ingresó, y los reembolsos podrían devolver montos descontados |
| Record de descuento separado + nueva fórmula de saldo en todos los scripts | Funciona, pero obliga a modificar unos 20 scripts de pagos, POS y consultas. La propuesta actual logra lo mismo tocando 3 |
