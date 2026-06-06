/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Capa de infraestructura — adaptador de persistencia NetSuite para sales-order.
 * ÚNICO archivo del feature con imports de N/*. Implementa el puerto
 * ISalesOrderRepository declarado en usecase/ports/sales-order.repository.port.ts.
 * Los identificadores de NetSuite del feature viven acá (FIELDS).
 */
import * as log from 'N/log';
import * as record from 'N/record';
import * as search from 'N/search';
import {
  SALES_ORDERS_PAGE_SIZE,
  type SalesOrder,
  type SalesOrderSearchCriteria,
} from '../domain/sales-order.domain';
import type { ISalesOrderRepository } from '../usecase/ports/sales-order.repository.port';

// --- Identificadores NetSuite (sales-order) ---
// Shape mínimo expuesto por el endpoint: id, tranId, entity, location,
// trandate, total. NOTA: `subtotal` no es una column válida en search.create()
// para transaction records; por eso no se incluye acá.
const FIELDS = {
  INTERNAL_ID: 'internalid',
  TRAN_ID: 'tranid',
  ENTITY: 'entity',
  LOCATION: 'location',
  TRAN_DATE: 'trandate',
  TOTAL: 'total',
} as const;

const toNumber = (raw: unknown): number => {
  const n = Number.parseFloat(raw as string);
  return Number.isFinite(n) ? n : 0;
};

// search.create().run().getRange() devuelve search.Result; se lee con
// getValue/getText. (No es lo mismo que search.lookupFields, que devuelve
// un objeto con arrays anidados tipo { internalid: [{ value: 'x' }] }.)
const toSalesOrder = (r: search.Result): SalesOrder => {
  return {
    id: (r.getValue(FIELDS.INTERNAL_ID) as string) ?? '',
    tranId: (r.getValue(FIELDS.TRAN_ID) as string) ?? '',
    entity: (r.getValue(FIELDS.ENTITY) as string) ?? '',
    location: (r.getText(FIELDS.LOCATION) as string) ?? '',
    trandate: (r.getValue(FIELDS.TRAN_DATE) as string) ?? '',
    total: toNumber(r.getValue(FIELDS.TOTAL)),
  };
};

export class NetSuiteSalesOrderRepository implements ISalesOrderRepository {
  findByCriteria(criteria: SalesOrderSearchCriteria, soIds?: string[]): SalesOrder[] {
    try {
      // NOTA: no se puede filtrar sales orders por custom fields del Customer
      // joined (custentity_*). El filtro Multicard por soIds (que ya viene del
      // customer correcto) es la única forma válida de limitar la búsqueda.
      // `mainline: T` es OBLIGATORIO: si no, NetSuite devuelve una fila por cada
      // línea de la OV (no por header), y el mismo SO aparece repetido.
      const filters: unknown[] = [
        ['mainline', 'is', 'T'],
        'AND',
        [FIELDS.TRAN_DATE, 'isnotempty', ''],
      ];

      // Filtro Multicard: solo OVs que tienen cuotas → facturas Multicard
      if (soIds && soIds.length > 0) {
        filters.push('AND');
        filters.push([FIELDS.INTERNAL_ID, 'anyof', soIds]);
      }

      const start = criteria.page * SALES_ORDERS_PAGE_SIZE;
      const end = start + SALES_ORDERS_PAGE_SIZE;

      const results = search
        .create({
          type: record.Type.SALES_ORDER,
          filters: filters as unknown as search.Filter[],
          columns: Object.values(FIELDS),
        })
        .run()
        .getRange({ start, end });

      return results.map(toSalesOrder);
    } catch (err) {
      log.error({
        title: 'NetSuiteSalesOrderRepository.findByCriteria',
        details: (err as Error).message,
      });
      return [];
    }
  }

  findById(salesOrderId: string): SalesOrder | null {
    try {
      const results = search
        .create({
          type: record.Type.SALES_ORDER,
          filters: [[FIELDS.INTERNAL_ID, 'is', salesOrderId]],
          columns: Object.values(FIELDS),
        })
        .run()
        .getRange({ start: 0, end: 1 });

      if (!results || results.length === 0) return null;
      return toSalesOrder(results[0]);
    } catch (err) {
      log.error({
        title: `NetSuiteSalesOrderRepository.findById salesOrderId: ${salesOrderId}`,
        details: (err as Error).message,
      });
      return null;
    }
  }
}
