/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 *
 * Driving adapter + composition root: wires concrete dependencies,
 * injects them into the use case, and exposes the HTTP GET entry point.
 *
 * - GET ?salesOrderId=X → GetSalesOrderSummary (formato legacy responseFormat)
 */
import * as log from 'N/log';
import type { EntryPoints } from 'N/types';
import { NetSuiteCustomerRepository } from '../../features/customer/repository/customer.repository';
import { NetSuiteInstallmentRepository } from '../../features/installment/repository/installment.repository';
import { NetSuiteInvoiceRepository } from '../../features/invoice/repository/invoice.repository';
import { NetSuiteSalesOrderRepository } from '../../features/sales-order/repository/sales-order.repository';
import { GetSalesOrderSummary } from '../../features/sales-order/usecase/get-sales-order-summary.usecase';
import { failure } from '../../shared/response';

const customerRepo = new NetSuiteCustomerRepository();
const invoiceRepo = new NetSuiteInvoiceRepository();
const installmentRepo = new NetSuiteInstallmentRepository();
const salesOrderRepo = new NetSuiteSalesOrderRepository();

export const get: EntryPoints.RESTlet.get = (requestParams) => {
  log.audit({
    title: 'GET mc_rl_mcard_get_sales_order_summary',
    details: JSON.stringify(requestParams),
  });

  const { salesOrderId } = (requestParams ?? {}) as Record<string, string>;

  if (!salesOrderId || salesOrderId.trim() === '') {
    return JSON.stringify(failure('salesOrderId es requerido.'));
  }

  const useCase = new GetSalesOrderSummary(
    salesOrderRepo,
    invoiceRepo,
    customerRepo,
    installmentRepo,
  );
  return JSON.stringify(useCase.execute(salesOrderId));
};
