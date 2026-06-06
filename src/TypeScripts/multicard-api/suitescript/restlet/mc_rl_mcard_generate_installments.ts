/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 *
 * Driving adapter + composition root: wires concrete dependencies,
 * injects them into the use case, and exposes the HTTP POST entry point.
 *
 * - POST body { IInstallmentInput } → GenerateInstallments
 */
import * as log from 'N/log';
import type { EntryPoints } from 'N/types';
import { NetSuiteInstallmentRepository } from '../../features/installment/repository/installment.repository';
import { NetSuiteCustomerRepository } from '../../features/customer/repository/customer.repository';
import { NetSuiteInvoiceRepository } from '../../features/invoice/repository/invoice.repository';
import { GenerateInstallments } from '../../features/installment/usecase/installment.usecase';
import type { IInstallmentInput } from '../../features/installment/usecase/installment.usecase';
import { failure } from '../../shared/response';

const installmentRepo = new NetSuiteInstallmentRepository();
const customerRepo = new NetSuiteCustomerRepository();
const invoiceRepo = new NetSuiteInvoiceRepository();

export const post: EntryPoints.RESTlet.post = (requestBody) => {
  log.audit({
    title: 'POST mc_rl_mcard_generate_installments',
    details: JSON.stringify(requestBody),
  });

  try {
    const input = (
      typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody
    ) as IInstallmentInput;

    const useCase = new GenerateInstallments(installmentRepo, customerRepo, invoiceRepo);
    const result = useCase.execute(input);

    return JSON.stringify(result);
  } catch (err) {
    return JSON.stringify(failure(String(err)));
  }
};
