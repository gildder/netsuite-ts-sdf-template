/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Casos de uso de installment. El puerto del repositorio vive en
 * ./ports/installment.repository.port.ts.
 *
 * Side effect (post-success): when all installments are created OK,
 * custentity_mc_date_first_sale_multicard on the customer is set with the
 * invoice trandate, ONLY if the field is empty or null (idempotent).
 */
import { type ApiResponse, failure, success } from '../../../shared/response';
import { isValidCustomerType } from '../../../shared/customer-type';
import type { ICustomerRepository } from '../../customer/usecase/ports/customer.repository.port';
import type { IInvoiceRepository } from '../../invoice/usecase/ports/invoice.repository.port';
import {
  type IInstallmentInput,
  type IInstallmentResult,
  type InstallmentRecord,
  buildInstallmentSchedule,
  roundToCents,
} from '../domain/installment.domain';
import type { IInstallmentRepository } from './ports/installment.repository.port';

// Re-export domain input/result types for convenience
export type { IInstallmentInput, IInstallmentResult };

// ---------------------------------------------------------------------------
// Use case: GenerateInstallments
// ---------------------------------------------------------------------------

export class GenerateInstallments {
  constructor(
    private readonly repo: IInstallmentRepository,
    private readonly customerRepo: ICustomerRepository,
    private readonly invoiceRepo: IInvoiceRepository,
  ) {}

  execute(input: IInstallmentInput): ApiResponse<IInstallmentResult[]> {
    // Validate required fields
    if (!input.customerId) {
      return failure('customerId es requerido.');
    }
    if (!input.invoiceId) {
      return failure('invoiceId es requerido.');
    }
    if (input.amount <= 0) {
      return failure('amount debe ser mayor a 0.');
    }
    if (input.nroInstallment <= 0) {
      return failure('nroInstallment debe ser mayor a 0.');
    }
    if (input.paymentDay < 1 || input.paymentDay > 31) {
      return failure('paymentDay debe estar entre 1 y 31.');
    }
    if (!isValidCustomerType(input.customerType)) {
      return failure(`customerType inválido: ${input.customerType}. Debe ser '1', '2' o '3'.`);
    }

    const createdIds: string[] = [];
    const results: IInstallmentResult[] = [];

    try {
      const schedule = buildInstallmentSchedule(input);

      for (const row of schedule) {
        const record: InstallmentRecord = {
          customerId: input.customerId,
          invoiceId: input.invoiceId,
          nro: row.nro,
          paymentDate: row.paymentDate,
          financedAmount: input.amount,
          capital: row.capital,
          adminCharge: row.interest,
          total: row.fixedInstallment,
        };

        const id = this.repo.save(record);
        createdIds.push(id);

        results.push({
          id,
          nro: row.nro,
          paymentDate: row.paymentDate.toISOString(),
          total: roundToCents(row.fixedInstallment),
        });
      }
    } catch (_err) {
      this.compensate(createdIds);
      return failure('No se pudieron generar las cuotas; se revirtieron las creadas.');
    }

    // Side effect: set custentity_mc_date_first_sale_multicard if empty.
    // Runs AFTER the success path. Wrapped in try/catch — must not break the
    // main flow if it fails. The repository's setFirstSaleMulticardDateIfEmpty
    // logs internally via N/log.error on failure.
    try {
      const invoice = this.invoiceRepo.findById(input.invoiceId);
      if (invoice) {
        this.customerRepo.setFirstSaleMulticardDateIfEmpty(
          input.customerId,
          new Date(invoice.date),
        );
      }
    } catch {
      // Best-effort side effect. Errors are logged inside the repository.
    }

    return success<IInstallmentResult[]>(results);
  }

  private compensate(ids: string[]): void {
    for (const id of ids) {
      try {
        this.repo.delete(id);
      } catch {
        // Best-effort cleanup. Individual delete errors are swallowed.
        // The repository's delete implementation logs internally via N/log.
      }
    }
  }
}
