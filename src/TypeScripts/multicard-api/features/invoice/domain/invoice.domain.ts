/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Capa de dominio — invoice. Lógica pura. CERO imports de NetSuite.
 */

export interface Invoice {
  id: string;
  date: string;
  time: string | undefined;
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

export type InvoiceJSON = Invoice;

/** Factura y monto financiado asociados a una OV. */
export interface SalesOrderFinancing {
  invoiceId: string;
  financedAmount: number;
}

export const isValidInvoiceId = (id: string): boolean =>
  id.trim() !== '' && !Number.isNaN(Number.parseFloat(id)) && Number.isFinite(Number(id));
