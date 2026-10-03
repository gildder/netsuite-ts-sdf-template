/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Capa de aplicación — casos de uso de invoice. Orquestan dominio + repositorio.
 * El puerto del repositorio vive en ./ports/invoice.repository.port.ts.
 */
import { type ApiResponse, failure, success } from '../../../shared/response';
import { type InvoiceJSON, isValidInvoiceId } from '../domain/invoice.domain';
import type { IInvoiceRepository } from './ports/invoice.repository.port';

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
      return success<GetInvoiceOutput>({ invoice: null }, 'No se encontró la factura');
    }

    return success<GetInvoiceOutput>({ invoice });
  }
}
