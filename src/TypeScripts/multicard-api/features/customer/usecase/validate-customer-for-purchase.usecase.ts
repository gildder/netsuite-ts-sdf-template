/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Use case: ValidateCustomerForPurchase — purchase eligibility rules.
 */
import type { IInstallmentRepository } from '../../installment/usecase/ports/installment.repository.port';
import { type ApiResponse, failure, success } from '../../../shared/response';
import {
  type CustomerJSON,
  type CustomerStatus,
  isValidDocumentNumber,
  STATUS_SUCCESS,
  STATUS_UNKNOWN,
} from '../domain/customer.domain';
import type { ICustomerRepository } from './ports/customer.repository.port';

interface ValidateOutput {
  status: CustomerStatus;
  customer: CustomerJSON | null;
}

export class ValidateCustomerForPurchase {
  constructor(
    private readonly customerRepo: ICustomerRepository,
    private readonly installmentRepo: IInstallmentRepository,
  ) {}

  execute(documentNumber: string): ApiResponse<ValidateOutput> {
    if (!isValidDocumentNumber(documentNumber)) {
      return failure('El número de documento proporcionado no es válido o está vacío.');
    }

    const customer = this.customerRepo.findValidatedByDocument(documentNumber);

    if (!customer) return success<ValidateOutput>({ status: STATUS_UNKNOWN, customer: null });

    const status = customer.purchaseStatus(() => this.installmentRepo.hasMora(customer.id));
    return success<ValidateOutput>({
      status,
      customer: status === STATUS_SUCCESS ? customer.toJSON() : null,
    });
  }
}
