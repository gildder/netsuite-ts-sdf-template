/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 *
 * Driving adapter + composition root: wires concrete dependencies,
 * injects them into the use case, and exposes the HTTP GET entry point.
 *
 * - GET ?documentNumber=X&complemento=Y → GetCustomerStatusBalance
 */
import * as log from 'N/log';
import type { EntryPoints } from 'N/types';
import { NetSuiteCustomerRepository } from '../../features/customer/repository/customer.repository';
import { NetSuiteInstallmentRepository } from '../../features/installment/repository/installment.repository';
import { GetCustomerStatusBalance } from '../../features/customer/usecase/get-customer-status-balance.usecase';
import { failure } from '../../shared/response';

const customerRepo = new NetSuiteCustomerRepository();
const installmentRepo = new NetSuiteInstallmentRepository();

export const get: EntryPoints.RESTlet.get = (requestParams) => {
  log.audit({
    title: 'GET mc_rl_mcard_get_customer_status_balance',
    details: JSON.stringify(requestParams),
  });

  const params = (requestParams ?? {}) as Record<string, string>;
  const { documentNumber, complemento } = params;

  if (!documentNumber || documentNumber.trim() === '') {
    return JSON.stringify(failure('documentNumber es requerido.'));
  }

  const useCase = new GetCustomerStatusBalance(customerRepo, installmentRepo);
  return JSON.stringify(useCase.execute({ documentNumber, complemento }));
};
