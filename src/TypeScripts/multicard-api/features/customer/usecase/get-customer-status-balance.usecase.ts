/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Use case: GetCustomerStatusBalance — returns habilitado status and available balance for a customer.
 */
import type { IInstallmentRepository } from '../../installment/usecase/installment.usecase';
import { type ApiResponse, failure, success } from '../../../shared/response';
import type { ICustomerRepository } from './ports/customer.repository.port';

// ---------------------------------------------------------------------------
// Result DTO
// ---------------------------------------------------------------------------

export interface CustomerStatusBalanceResult {
  habilitado: string; // 'Sí' | 'No, con Mora'
  saldoDisponible: number;
}

// ---------------------------------------------------------------------------
// Habilitado string literals — inline constants; avoids shared/ pollution
// ---------------------------------------------------------------------------

const HABILITADO_STATUS = {
  SI: 'Sí',
  NO_MORA: 'No, con Mora',
} as const;

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

export class GetCustomerStatusBalance {
  constructor(
    private readonly customerRepo: ICustomerRepository,
    private readonly installmentRepo: IInstallmentRepository,
  ) {}

  execute(input: {
    documentNumber: string;
    complemento?: string;
  }): ApiResponse<CustomerStatusBalanceResult> {
    // Step 1: validate documentNumber is non-empty
    if (!input.documentNumber.trim()) {
      return failure('documentNumber es requerido.');
    }

    // Step 2: look up customer by document number
    const customer = this.customerRepo.findByDocumentNumber(input.documentNumber);

    // Step 3: not-found guard
    if (!customer) {
      return failure('No se encontró el cliente.');
    }

    // Step 4: optional complemento guard — mismatch returns same not-found message
    const comp = (input.complemento ?? '').trim();
    if (comp !== '' && customer.complemento !== comp) {
      return failure('No se encontró el cliente.');
    }

    // Step 5: check mora status
    const hasMora = this.installmentRepo.hasMora(customer.id);

    // Step 6: derive habilitado label
    const habilitado = hasMora ? HABILITADO_STATUS.NO_MORA : HABILITADO_STATUS.SI;

    // Step 7: return success with always-present saldoDisponible
    return success<CustomerStatusBalanceResult>({
      habilitado,
      saldoDisponible: customer.availableBalance,
    });
  }
}
