/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 *
 * Driving adapter + composition root: wires concrete dependencies,
 * injects them into the use case, and exposes the HTTP GET entry point.
 *
 * - GET ?documentNumber=X → ValidateCustomerForPurchase
 */
import * as log from 'N/log';
import type { EntryPoints } from 'N/types';
import { NetSuiteCustomerRepository } from '../../features/customer/repository/customer.repository';
import { NetSuiteInstallmentRepository } from '../../features/installment/repository/installment.repository';
import { ValidateCustomerForPurchase } from '../../features/customer/usecase/validate-customer-for-purchase.usecase';
import { failure } from '../../shared/response';

const customerRepo = new NetSuiteCustomerRepository();
const installmentRepo = new NetSuiteInstallmentRepository();

export const get: EntryPoints.RESTlet.get = (requestParams) => {
  log.audit({
    title: 'GET mc_rl_mcard_validate_customer_for_purchase',
    details: JSON.stringify(requestParams),
  });

  const { documentNumber } = (requestParams ?? {}) as Record<string, string>;

  if (!documentNumber) {
    return JSON.stringify(failure('documentNumber es requerido.'));
  }

  const useCase = new ValidateCustomerForPurchase(customerRepo, installmentRepo);
  return JSON.stringify(useCase.execute(documentNumber));
};
