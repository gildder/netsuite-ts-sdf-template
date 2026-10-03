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
  /**
   * Cantidad de filas a traer a partir de page * pageSize. El caso de uso pide
   * pageSize + 1 para saber si existe una página siguiente.
   */
  limit: number;
}

export interface SalesOrderSearchResult {
  salesOrders: SalesOrder[];
  page: number;
  hasNextPage: boolean;
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

/**
 * El monto financiado de la factura tiene prioridad; si es 0 se usa el de las cuotas.
 * El fallback es perezoso: solo se evalúa cuando hace falta.
 */
export function resolveFinancedAmount(
  invoiceFinancedAmount: number,
  getInstallmentFinancedAmount: () => number,
): number {
  return invoiceFinancedAmount > 0 ? invoiceFinancedAmount : getInstallmentFinancedAmount();
}

export function toInvoiceSummary(invoice: InvoiceJSON): InvoiceSummary {
  const { time: _time, ...summary } = invoice;
  return summary;
}

export function toCustomerSummary(customer: CustomerDetailJSON): CustomerSummary {
  const { mobilePhone, paymentDay, ...rest } = customer;
  return { ...rest, phone: mobilePhone, paymentDay: String(paymentDay) };
}

/**
 * Normaliza la paginación: page >= 0 (base 0) y pageSize > 0, con
 * SALES_ORDERS_PAGE_SIZE como valor por defecto.
 */
export function normalizePaging(
  page?: number,
  pageSize?: number,
): { page: number; pageSize: number } {
  const normalizedPage = Math.max(0, Math.floor(page ?? 0));
  const pageSizeInput = pageSize !== undefined ? Math.floor(pageSize) : 0;
  return {
    page: normalizedPage,
    pageSize: pageSizeInput > 0 ? pageSizeInput : SALES_ORDERS_PAGE_SIZE,
  };
}

/**
 * Recorta las filas a pageSize. Si llegaron más filas que pageSize (la fila extra
 * del look-ahead), existe una página siguiente.
 */
export function toPage<T>(rows: T[], pageSize: number): { items: T[]; hasNextPage: boolean } {
  return { items: rows.slice(0, pageSize), hasNextPage: rows.length > pageSize };
}

/** Inyecta el monto financiado (por id de OV) en cada OV; 0 si no hay monto. */
export function withFinancedAmounts(
  salesOrders: SalesOrder[],
  amounts: Map<string, number>,
): SalesOrder[] {
  return salesOrders.map((so) => ({ ...so, financedAmount: amounts.get(so.id) ?? 0 }));
}
