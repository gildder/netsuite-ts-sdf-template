/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Puerto (driven side) del repositorio de Invoice.
 */
import type { Invoice } from '../../domain/invoice.domain';

export interface IInvoiceRepository {
  findById(invoiceId: string): Invoice | null;
  findBySalesOrderId(salesOrderId: string): Invoice | null;
  findSalesOrderMapByIds(
    invoiceIds: string[],
  ): Map<string, { financedAmount: number; invoiceId: string }>;
}
