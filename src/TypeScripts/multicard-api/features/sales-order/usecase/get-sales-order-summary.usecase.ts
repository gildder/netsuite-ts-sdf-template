/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Use case: GetSalesOrderSummary — devuelve el resumen completo de una transacción
 * Multicard (formato legacy `responseFormat`): { salesOrderID, invoice, customer, installments }.
 * Se usa para informar al cliente los detalles de su venta Multicard.
 */
import { type ApiResponse, failure, success } from '../../../shared/response';
import type { ICustomerRepository } from '../../customer/usecase/ports/customer.repository.port';
import type { IInstallmentRepository } from '../../installment/usecase/ports/installment.repository.port';
import type { IInvoiceRepository } from '../../invoice/usecase/ports/invoice.repository.port';
import {
  type SalesOrderSummaryResponse,
  toCustomerSummary,
  toInvoiceSummary,
} from '../domain/sales-order.domain';
import type { ISalesOrderRepository } from './ports/sales-order.repository.port';

export class GetSalesOrderSummary {
  constructor(
    private readonly salesOrderRepo: ISalesOrderRepository,
    private readonly invoiceRepo: IInvoiceRepository,
    private readonly customerRepo: ICustomerRepository,
    private readonly installmentRepo: IInstallmentRepository,
  ) {}

  execute(salesOrderId: string): ApiResponse<SalesOrderSummaryResponse> {
    const trimmed = salesOrderId?.trim() ?? '';
    if (trimmed === '') {
      return failure('salesOrderId es requerido.');
    }

    const salesOrder = this.salesOrderRepo.findById(trimmed);
    if (!salesOrder) {
      return failure('No se encontró la orden de venta.');
    }

    const invoice = this.invoiceRepo.findBySalesOrderId(trimmed);
    if (!invoice) {
      return failure('No se encontró la factura asociada a la orden de venta.');
    }

    const customer = this.customerRepo.findById(invoice.customerId);
    if (!customer) {
      return failure('Cliente asociado a la OV no encontrado.');
    }

    const installments = this.installmentRepo.findInstallmentsByInvoiceId(invoice.id);

    const summary: SalesOrderSummaryResponse = {
      salesOrderID: salesOrder.id,
      invoice: toInvoiceSummary(invoice.toJSON()),
      customer: toCustomerSummary(customer.toDetailJSON()),
      installments,
    };

    return success<SalesOrderSummaryResponse>(summary);
  }
}
