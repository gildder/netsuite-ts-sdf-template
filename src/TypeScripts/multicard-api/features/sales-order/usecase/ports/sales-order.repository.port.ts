/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Puerto (driven side) del repositorio de Sales Order.
 */
import type { SalesOrder, SalesOrderSearchCriteria } from '../../domain/sales-order.domain';

export interface ISalesOrderRepository {
  findByCriteria(criteria: SalesOrderSearchCriteria, soIds?: string[]): SalesOrder[];
  findById(salesOrderId: string): SalesOrder | null;
}
