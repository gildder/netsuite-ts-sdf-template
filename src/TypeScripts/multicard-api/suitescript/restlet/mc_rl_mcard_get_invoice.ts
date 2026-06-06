/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 *
 * Driving adapter + composition root: wires concrete dependencies,
 * injects them into the use case, and exposes the HTTP GET entry point.
 *
 * - GET ?invoiceId=X → GetInvoice
 */
import * as log from 'N/log';
import type { EntryPoints } from 'N/types';
import { NetSuiteInvoiceRepository } from '../../features/invoice/repository/invoice.repository';
import { GetInvoice } from '../../features/invoice/usecase/invoice.usecase';
import { failure } from '../../shared/response';

const invoiceRepo = new NetSuiteInvoiceRepository();

export const get: EntryPoints.RESTlet.get = (requestParams) => {
  log.audit({ title: 'GET mc_rl_mcard_get_invoice', details: JSON.stringify(requestParams) });

  const { invoiceId } = (requestParams ?? {}) as Record<string, string>;

  if (!invoiceId) {
    return JSON.stringify(failure('invoiceId es requerido.'));
  }

  const useCase = new GetInvoice(invoiceRepo);
  return JSON.stringify(useCase.execute(invoiceId));
};
