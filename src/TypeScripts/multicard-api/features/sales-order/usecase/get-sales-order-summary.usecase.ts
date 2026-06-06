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
import type { IInstallmentRepository } from '../../installment/usecase/installment.usecase';
import type { IInvoiceRepository } from '../../invoice/usecase/invoice.usecase';
import type { SalesOrderSummaryResponse } from '../domain/sales-order.domain';
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

    const invoiceJSON = invoice.toJSON();
    const customerDetail = customer.toDetailJSON();

    const summary: SalesOrderSummaryResponse = {
      salesOrderID: salesOrder.id,
      invoice: {
        id: invoiceJSON.id,
        date: invoiceJSON.date,
        location: invoiceJSON.location,
        invoiceNumber: invoiceJSON.invoiceNumber,
        customerNit: invoiceJSON.customerNit,
        customerName: invoiceJSON.customerName,
        email: invoiceJSON.email,
        amount: invoiceJSON.amount,
        cuf: invoiceJSON.cuf,
        customerId: invoiceJSON.customerId,
        cashRegister: invoiceJSON.cashRegister,
      },
      customer: {
        id: customerDetail.id,
        documentNumber: customerDetail.documentNumber,
        typeDocument: customerDetail.typeDocument,
        name: customerDetail.name,
        email: customerDetail.email,
        phone: customerDetail.mobilePhone,
        type: customerDetail.type,
        creditLimit: customerDetail.creditLimit,
        balance: customerDetail.balance,
        paymentDay: String(customerDetail.paymentDay),
        contractNumber: customerDetail.contractNumber,
      },
      installments,
    };

    return success<SalesOrderSummaryResponse>(summary);
  }
}
