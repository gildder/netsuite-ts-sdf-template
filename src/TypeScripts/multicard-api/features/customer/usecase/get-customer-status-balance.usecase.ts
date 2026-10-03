/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Use case: GetCustomerStatusBalance — returns habilitado status and available balance for a customer.
 */
import type { IInstallmentRepository } from '../../installment/usecase/ports/installment.repository.port';
import { type ApiResponse, failure, success } from '../../../shared/response';
import { ENABLED_STATUS } from '../domain/customer.domain';
import type { ICustomerRepository } from './ports/customer.repository.port';

// ---------------------------------------------------------------------------
// Result DTO
// ---------------------------------------------------------------------------

export interface CustomerStatusBalanceResult {
  enabled: string;
  availableBalance: number;
  creditLimit: number;
}

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
    if (!customer.matchesComplemento(input.complemento)) {
      return failure('No se encontró el cliente.');
    }

    // Step 5: derive habilitado label (mora is only queried when the customer has Multicard)
    const enabled = customer.enabledStatus(() => this.installmentRepo.hasMora(customer.id));

    // Step 6: no Multicard returns zero balances
    if (enabled === ENABLED_STATUS.NO_MULTICARD) {
      return success<CustomerStatusBalanceResult>({
        enabled,
        availableBalance: 0,
        creditLimit: 0,
      });
    }

    // Step 7: return success with always-present saldoDisponible and balance
    return success<CustomerStatusBalanceResult>({
      enabled,
      availableBalance: customer.availableBalance,
      creditLimit: customer.creditLimit,
    });
  }
}
