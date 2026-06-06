/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Puerto (driven side) del repositorio de Customer.
 */
import type { Customer } from '../../domain/customer.domain';

export interface ICustomerRepository {
  findByDocumentNumber(documentNumber: string): Customer | null;
  findValidatedByDocument(documentNumber: string): Customer | null;
  findById(customerId: string): Customer | null;
  setFirstSaleMulticardDateIfEmpty(customerId: string, date: Date): boolean;
}
