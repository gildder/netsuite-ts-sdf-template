/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 *
 * Driving adapter + composition root: wires concrete dependencies,
 * injects them into the use case, and exposes the HTTP GET entry point.
 *
 * - GET ?customerId=X → GetCustomerById
 */
import * as log from 'N/log';
import type { EntryPoints } from 'N/types';
import { NetSuiteCustomerRepository } from '../../features/customer/repository/customer.repository';
import { GetCustomerById } from '../../features/customer/usecase/get-customer-by-id.usecase';
import { failure } from '../../shared/response';

const customerRepo = new NetSuiteCustomerRepository();

export const get: EntryPoints.RESTlet.get = (requestParams) => {
  log.audit({
    title: 'GET mc_rl_mcard_get_customer_by_id',
    details: JSON.stringify(requestParams),
  });

  const { customerId } = (requestParams ?? {}) as Record<string, string>;

  if (!customerId) {
    return JSON.stringify(failure('customerId es requerido.'));
  }

  const useCase = new GetCustomerById(customerRepo);
  return JSON.stringify(useCase.execute(customerId));
};
