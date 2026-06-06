/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 *
 * Driving adapter + composition root: wires concrete dependencies,
 * injects them into the use case, and exposes the HTTP GET entry point.
 *
 * - GET ?documentNumber=X&complemento=Y&page=0 → GetSalesOrdersByCustomerDocument (paginated, Multicard-filtered)
 */
import * as log from 'N/log';
import type { EntryPoints } from 'N/types';
import { NetSuiteCustomerRepository } from '../../features/customer/repository/customer.repository';
import { NetSuiteInvoiceRepository } from '../../features/invoice/repository/invoice.repository';
import { NetSuiteInstallmentRepository } from '../../features/installment/repository/installment.repository';
import { NetSuiteMulticardSalesOrderFilter } from '../../features/sales-order/repository/multicard-sales-order-filter.repository';
import { NetSuiteSalesOrderRepository } from '../../features/sales-order/repository/sales-order.repository';
import { GetSalesOrdersByCustomerDocument } from '../../features/sales-order/usecase/get-sales-orders-by-customer-document.usecase';
import { failure } from '../../shared/response';

const customerRepo = new NetSuiteCustomerRepository();
const invoiceRepo = new NetSuiteInvoiceRepository();
const installmentRepo = new NetSuiteInstallmentRepository();
const salesOrderRepo = new NetSuiteSalesOrderRepository();
const multicardFilter = new NetSuiteMulticardSalesOrderFilter(installmentRepo, invoiceRepo);

export const get: EntryPoints.RESTlet.get = (requestParams) => {
  log.audit({
    title: 'GET mc_rl_mcard_get_sales_orders_by_customer_document',
    details: JSON.stringify(requestParams),
  });

  const params = (requestParams ?? {}) as Record<string, string>;
  const { documentNumber, complemento, page } = params;

  if (!documentNumber || documentNumber.trim() === '') {
    return JSON.stringify(failure('documentNumber es requerido.'));
  }

  // page es 0-based: page=0 → primera página, page=1 → segunda, etc.
  const parsedPage = Number.parseInt(page ?? '0', 10);

  const useCase = new GetSalesOrdersByCustomerDocument(
    salesOrderRepo,
    customerRepo,
    multicardFilter,
  );
  return JSON.stringify(
    useCase.execute({
      documentNumber,
      complemento,
      page: Number.isFinite(parsedPage) ? parsedPage : 0,
    }),
  );
};
