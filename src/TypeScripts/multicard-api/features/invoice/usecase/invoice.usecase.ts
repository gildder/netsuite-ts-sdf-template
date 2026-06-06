/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Capa de aplicación — casos de uso de invoice. Orquestan dominio + repositorio.
 * El puerto del repositorio (IInvoiceRepository) se declara acá.
 */
import { type ApiResponse, failure, success } from '../../../shared/response';
import { type Invoice, type InvoiceJSON, isValidInvoiceId } from '../domain/invoice.domain';

// --- Puerto (driven) ---
export interface IInvoiceRepository {
  findById(invoiceId: string): Invoice | null;
  findBySalesOrderId(salesOrderId: string): Invoice | null;
  findSalesOrderIdsByIds(invoiceIds: string[]): string[];
}

// --- Salidas ---
interface GetInvoiceOutput {
  invoice: InvoiceJSON | null;
}

// --- Use case ---
export class GetInvoice {
  constructor(private readonly invoiceRepo: IInvoiceRepository) {}

  execute(invoiceId: string): ApiResponse<GetInvoiceOutput> {
    if (!isValidInvoiceId(invoiceId)) {
      return failure('invoiceId inválido o vacío.');
    }

    const invoice = this.invoiceRepo.findById(invoiceId);

    if (!invoice) {
      return {
        success: true,
        data: { invoice: null },
        message: 'No se encontró la factura',
        error: null,
      };
    }

    return success<GetInvoiceOutput>({ invoice: invoice.toJSON() });
  }
}
