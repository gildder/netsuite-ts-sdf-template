/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Use case: ValidateCustomerForPurchase — purchase eligibility rules.
 */
import type { IInstallmentRepository } from '../../installment/usecase/installment.usecase';
import { type ApiResponse, failure, success } from '../../../shared/response';
import {
  STATUS_DISABLED,
  STATUS_MORA,
  STATUS_NOBALANCE,
  STATUS_NOPHONE,
  STATUS_SUCCESS,
  STATUS_UNKNOWN,
  type CustomerStatus,
} from '../../../shared/status';
import { type CustomerJSON, isValidDocumentNumber } from '../domain/customer.domain';
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
    if (!customer.isCardValid())
      return success<ValidateOutput>({ status: STATUS_DISABLED, customer: null });
    if (this.installmentRepo.hasMora(customer.id))
      return success<ValidateOutput>({ status: STATUS_MORA, customer: null });
    if (!customer.isPhoneValid())
      return success<ValidateOutput>({ status: STATUS_NOPHONE, customer: null });
    if (!customer.hasBalance())
      return success<ValidateOutput>({ status: STATUS_NOBALANCE, customer: null });

    return success<ValidateOutput>({ status: STATUS_SUCCESS, customer: customer.toJSON() });
  }
}
