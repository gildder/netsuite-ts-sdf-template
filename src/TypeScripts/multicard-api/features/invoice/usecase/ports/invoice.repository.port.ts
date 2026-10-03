/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Puerto (driven side) del repositorio de Invoice.
 */
import type { Invoice, SalesOrderFinancing } from '../../domain/invoice.domain';

export interface IInvoiceRepository {
  findById(invoiceId: string): Invoice | null;
  findBySalesOrderId(salesOrderId: string): Invoice | null;
  /** Mapa de financiamiento por factura; la clave es el id de la Sales Order. */
  findSalesOrderMapByIds(invoiceIds: string[]): Map<string, SalesOrderFinancing>;
}
