/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Use case: GetCustomer — simple lookup by document number.
 */
import { type ApiResponse, failure, success } from '../../../shared/response';
import { type CustomerJSON, isValidDocumentNumber } from '../domain/customer.domain';
import type { ICustomerRepository } from './ports/customer.repository.port';

interface GetCustomerOutput {
  customer: CustomerJSON | null;
}

export class GetCustomer {
  constructor(private readonly customerRepository: ICustomerRepository) {}

  execute(documentNumber: string): ApiResponse<GetCustomerOutput> {
    if (!isValidDocumentNumber(documentNumber)) {
      return failure('El número de documento proporcionado no es válido o está vacío.');
    }

    const customer = this.customerRepository.findByDocumentNumber(documentNumber);

    if (!customer) {
      return {
        success: true,
        data: { customer: null },
        message: 'No se encontró el número de documento ingresado',
        error: null,
      };
    }

    if (!customer.isPhoneValid()) {
      return {
        success: true,
        data: { customer: null },
        message: 'No tiene un número de teléfono móvil válido',
        error: null,
      };
    }

    return success<GetCustomerOutput>({ customer: customer.toJSON() });
  }
}
