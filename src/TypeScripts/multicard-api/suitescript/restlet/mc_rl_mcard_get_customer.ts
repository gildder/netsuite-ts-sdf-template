/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 *
 * Driving adapter + composition root: wires concrete dependencies,
 * injects them into the use case, and exposes the HTTP GET entry point.
 *
 * - GET ?documentNumber=X → GetCustomer
 */
import * as log from 'N/log';
import type { EntryPoints } from 'N/types';
import { NetSuiteCustomerRepository } from '../../features/customer/repository/customer.repository';
import { GetCustomer } from '../../features/customer/usecase/get-customer.usecase';
import { failure } from '../../shared/response';

const customerRepo = new NetSuiteCustomerRepository();

export const get: EntryPoints.RESTlet.get = (requestParams) => {
  log.audit({ title: 'GET mc_rl_mcard_get_customer', details: JSON.stringify(requestParams) });

  const { documentNumber } = (requestParams ?? {}) as Record<string, string>;

  if (!documentNumber) {
    return JSON.stringify(failure('documentNumber es requerido.'));
  }

  const useCase = new GetCustomer(customerRepo);
  return JSON.stringify(useCase.execute(documentNumber));
};
