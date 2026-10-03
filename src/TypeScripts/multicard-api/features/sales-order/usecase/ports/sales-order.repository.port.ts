/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Puerto (driven side) del repositorio de Sales Order.
 */
import type { SalesOrder, SalesOrderSearchCriteria } from '../../domain/sales-order.domain';

export interface ISalesOrderRepository {
  /** Devuelve hasta `criteria.limit` filas, a partir de `page * pageSize`. */
  findByCriteria(criteria: SalesOrderSearchCriteria, soIds?: string[]): SalesOrder[];
  findById(salesOrderId: string): SalesOrder | null;
}
