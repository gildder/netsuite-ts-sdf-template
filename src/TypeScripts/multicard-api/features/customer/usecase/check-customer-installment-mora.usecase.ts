/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Use case: CheckCustomerInstallmentMora — checks if a customer has overdue installments.
 *
 * Cross-feature dependency (intencional):
 * Este usecase vive en `customer/` pero importa `IInstallmentRepository` de
 * `installment/`. La mora es un estado de installments, no de customer —
 * no hay forma de chequearla sin hablar con installment. Documentado como
 * WARN en el compliance audit.
 */
import type { IInstallmentRepository } from '../../installment/usecase/installment.usecase';
import { type ApiResponse, success } from '../../../shared/response';

interface CheckMoraOutput {
  hasMora: boolean;
}

export class CheckCustomerInstallmentMora {
  constructor(private readonly installmentRepo: IInstallmentRepository) {}

  execute(customerId: string): ApiResponse<CheckMoraOutput> {
    return success<CheckMoraOutput>({ hasMora: this.installmentRepo.hasMora(customerId) });
  }
}
