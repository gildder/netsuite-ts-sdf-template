/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Capa de dominio — sales-order. Tipos puros. CERO imports de NetSuite.
 */

export const SALES_ORDERS_PAGE_SIZE = 100 as const;

export interface SalesOrder {
  id: string;
  tranId: string;
  entity: string;
  location: string;
  trandate: string;
  total: number;
}

export interface SalesOrderSearchCriteria {
  documentNumber: string;
  page: number;
}

export interface SalesOrderSearchResult {
  salesOrders: SalesOrder[];
  page: number;
}

// ---------------------------------------------------------------------------
// Summary types (Multicard transaction response — mirrors legacy responseFormat)
// ---------------------------------------------------------------------------

export interface InstallmentSummary {
  id: string;
  nro: number;
  paymentDate: string;
  total: number;
}

export interface InvoiceSummary {
  id: string;
  date: string;
  location: string;
  invoiceNumber: string;
  customerNit: string;
  customerName: string;
  email: string;
  amount: string | number;
  cuf: string;
  customerId: string;
  cashRegister: number;
}

export interface CustomerSummary {
  id: string;
  documentNumber: string;
  typeDocument: string;
  name: string;
  email: string;
  phone: string;
  type: string;
  creditLimit: string | number;
  balance: string | number;
  paymentDay: string | number;
  contractNumber: string | number;
}

export interface SalesOrderSummaryResponse {
  salesOrderID: string;
  invoice: InvoiceSummary;
  customer: CustomerSummary;
  installments: InstallmentSummary[];
}
