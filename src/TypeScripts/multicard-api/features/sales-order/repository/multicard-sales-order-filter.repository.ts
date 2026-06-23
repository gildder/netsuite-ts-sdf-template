/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Capa de infraestructura — adaptador del filtro Multicard para Sales Order.
 * Encapsula el camino: customerId → installments → invoiceIds → invoices → SO ids.
 *
 * Es un collaborator cross-feature (habla con installment + invoice) pero vive
 * dentro del feature sales-order para mantener la lógica de filtrado Multicard
 * junto a su consumidor principal (GetSalesOrdersByCustomerDocument).
 */
import * as log from 'N/log';
import type { IInstallmentRepository } from '../../installment/usecase/installment.usecase';
import type { IInvoiceRepository } from '../../invoice/usecase/invoice.usecase';
import type { IMulticardSalesOrderFilter } from '../usecase/ports/multicard-sales-order-filter.port';

export class NetSuiteMulticardSalesOrderFilter implements IMulticardSalesOrderFilter {
  constructor(
    private readonly installmentRepo: IInstallmentRepository,
    private readonly invoiceRepo: IInvoiceRepository,
  ) {}

  findSalesOrderIdsByCustomer(customerId: string): Map<string, number> {
    try {
      const invoiceIds = this.installmentRepo.findInvoiceIdsByCustomer(customerId);
      if (invoiceIds.length === 0) return new Map();

      const invoiceMap = this.invoiceRepo.findSalesOrderMapByIds(invoiceIds);
      const finalMap = new Map<string, number>();

      for (const [soId, details] of invoiceMap.entries()) {
        if (details.financedAmount > 0) {
          finalMap.set(soId, details.financedAmount);
        } else {
          // Fallback to installment
          const amount = this.installmentRepo.findFinancedAmountByInvoiceId(details.invoiceId);
          finalMap.set(soId, amount);
        }
      }

      return finalMap;
    } catch (err) {
      log.error({
        title: `NetSuiteMulticardSalesOrderFilter.findSalesOrderIdsByCustomer customerId: ${customerId}`,
        details: (err as Error).message,
      });
      return new Map();
    }
  }
}
