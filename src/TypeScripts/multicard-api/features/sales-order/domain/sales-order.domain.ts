/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Capa de dominio — sales-order. Tipos y funciones puras de proyección (read model).
 * CERO imports de NetSuite.
 */
import type { CustomerDetailJSON } from '../../customer/domain/customer.domain';
import type { InstallmentSummaryResult } from '../../installment/domain/installment.domain';
import type { InvoiceJSON } from '../../invoice/domain/invoice.domain';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SALES_ORDERS_PAGE_SIZE = 10 as const;

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface SalesOrder {
  id: string;
  tranId: string;
  entity: string;
  location: string;
  trandate: string;
  total: number;
  financedAmount: number;
}

export interface SalesOrderSearchCriteria {
  documentNumber: string;
  page: number;
  pageSize: number;
}

export interface SalesOrderSearchResult {
  salesOrders: SalesOrder[];
  page: number;
}

// ---------------------------------------------------------------------------
// Summary types (Multicard transaction response — mirrors legacy responseFormat)
// ---------------------------------------------------------------------------

export type InvoiceSummary = Omit<InvoiceJSON, 'time'>;

// El contrato legacy de respuesta renombra mobilePhone -> phone y envía paymentDay como string.
export type CustomerSummary = Omit<CustomerDetailJSON, 'mobilePhone' | 'paymentDay'> & {
  phone: string;
  paymentDay: string;
};

export interface SalesOrderSummaryResponse {
  salesOrderID: string;
  invoice: InvoiceSummary;
  customer: CustomerSummary;
  installments: InstallmentSummaryResult[];
}

// ---------------------------------------------------------------------------
// Pure functions — projections
// ---------------------------------------------------------------------------

export function toInvoiceSummary(invoice: InvoiceJSON): InvoiceSummary {
  const { time: _time, ...summary } = invoice;
  return summary;
}

export function toCustomerSummary(customer: CustomerDetailJSON): CustomerSummary {
  const { mobilePhone, paymentDay, ...rest } = customer;
  return { ...rest, phone: mobilePhone, paymentDay: String(paymentDay) };
}
