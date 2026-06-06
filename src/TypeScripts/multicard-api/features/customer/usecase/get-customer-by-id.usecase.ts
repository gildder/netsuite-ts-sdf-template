/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Use case: GetCustomerById — lookup by id.
 */
import { type ApiResponse, failure, success } from '../../../shared/response';
import type { CustomerDetailJSON } from '../domain/customer.domain';
import type { ICustomerRepository } from './ports/customer.repository.port';

interface GetCustomerByIdOutput {
  customer: CustomerDetailJSON | null;
}

export class GetCustomerById {
  constructor(private readonly customerRepo: ICustomerRepository) {}

  execute(customerId: string): ApiResponse<GetCustomerByIdOutput> {
    if (!customerId || customerId.trim() === '') {
      return failure('customerId es requerido.');
    }

    const customer = this.customerRepo.findById(customerId);

    if (!customer) {
      return {
        success: true,
        data: { customer: null },
        message: 'No se encontró el cliente',
        error: null,
      };
    }

    return success<GetCustomerByIdOutput>({ customer: customer.toDetailJSON() });
  }
}
