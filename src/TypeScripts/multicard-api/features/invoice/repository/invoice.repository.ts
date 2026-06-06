/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Infrastructure layer — NetSuite persistence adapter for invoice.
 * The ONLY file in this feature with N/* imports. Implements the
 * IInvoiceRepository port declared in invoice.usecase.ts.
 * NetSuite identifiers for this feature live here (FIELDS).
 */
import * as log from 'N/log';
import * as record from 'N/record';
import * as search from 'N/search';
import { Invoice } from '../domain/invoice.domain';
import type { IInvoiceRepository } from '../usecase/invoice.usecase';

// --- Identificadores NetSuite (invoice) ---
const FIELDS = {
  INTERNAL_ID: 'internalid',
  TRAN_DATE: 'trandate',
  LAST_MODIFIED: 'lastmodifieddate',
  LOCATION: 'location',
  NUMERO_FACTURA: 'custbody_sdb_numero_factura',
  NIT_CLIENTE: 'custbody_sdb_nit_cliente',
  ENTITY: 'entity',
  CSV_FA_CUSTOM_NAMES: 'custbody_sdb_csv_fa_custom_names',
  BILL_TO_NIT: 'custbody_sdb_bill_to_nit',
  FA_CUSTOM_NAMES: 'custbody_sdb_fa_custom_names',
  CUF: 'custbody_sdb_cuf',
  EMAIL: 'email',
  TOTAL: 'total',
  CREATED_FROM: 'createdfrom',
} as const;

// Shape of the object returned by search.lookupFields for an invoice.
interface InvoiceLookupResult {
  internalid: Array<{ value: string }>;
  trandate: string;
  lastmodifieddate?: string;
  location: Array<{ text: string }>;
  custbody_sdb_numero_factura: string;
  custbody_sdb_nit_cliente: string;
  entity: Array<{ value: string; text: string }>;
  custbody_sdb_csv_fa_custom_names: string;
  custbody_sdb_bill_to_nit: string;
  custbody_sdb_fa_custom_names: string;
  custbody_sdb_cuf: string;
  email: string;
  total: string | number;
}

const toInvoice = (result: InvoiceLookupResult): Invoice =>
  new Invoice({
    id: result.internalid[0].value,
    date: result.trandate,
    cashRegister: 0,
    time: result.lastmodifieddate?.split(' ')[1],
    location: result.location[0]?.text ?? '',
    invoiceNumber: result.custbody_sdb_numero_factura,
    customerNit: result.custbody_sdb_bill_to_nit || result.custbody_sdb_nit_cliente,
    customerName:
      result.custbody_sdb_fa_custom_names ||
      result.entity[0]?.text.split(' ').slice(1).join(' ') ||
      '',
    email: result.email,
    amount: result.total,
    cuf: result.custbody_sdb_cuf,
    customerId: result.entity[0]?.value ?? '',
  });

export class NetSuiteInvoiceRepository implements IInvoiceRepository {
  findById(invoiceId: string): Invoice | null {
    try {
      const result = search.lookupFields({
        type: record.Type.INVOICE,
        id: invoiceId,
        columns: Object.values(FIELDS),
      }) as unknown as InvoiceLookupResult;

      if (!result || !result.internalid || result.internalid.length === 0) {
        return null;
      }

      return toInvoice(result);
    } catch (err) {
      log.error({
        title: `NetSuiteInvoiceRepository.findById invoiceId: ${invoiceId}`,
        details: (err as Error).message,
      });
      return null;
    }
  }

  /**
   * Busca la factura asociada a una Sales Order usando el campo `createdfrom`.
   * Una OV puede generar una sola factura Multicard (la usada como input de cuotas).
   * On error: logs via N/log and returns null.
   */
  findBySalesOrderId(salesOrderId: string): Invoice | null {
    try {
      const results = search
        .create({
          type: record.Type.INVOICE,
          filters: [[FIELDS.CREATED_FROM, 'is', salesOrderId]] as unknown as search.Filter[],
          columns: [FIELDS.INTERNAL_ID],
        })
        .run()
        .getRange({ start: 0, end: 1 });

      if (!results || results.length === 0) return null;
      const invoiceId = results[0].getValue(FIELDS.INTERNAL_ID) as string;
      return this.findById(invoiceId);
    } catch (err) {
      log.error({
        title: `NetSuiteInvoiceRepository.findBySalesOrderId salesOrderId: ${salesOrderId}`,
        details: (err as Error).message,
      });
      return null;
    }
  }

  /**
   * Devuelve los SO ids únicos asociados a las facturas recibidas,
   * leídos desde el campo `createdfrom`. Usado por el filtro Multicard.
   * Filtra valores vacíos/null. On error: logs via N/log and returns empty array.
   */
  findSalesOrderIdsByIds(invoiceIds: string[]): string[] {
    if (!invoiceIds || invoiceIds.length === 0) return [];
    try {
      const results = search
        .create({
          type: record.Type.INVOICE,
          filters: [[FIELDS.INTERNAL_ID, 'anyof', invoiceIds]] as unknown as search.Filter[],
          columns: [FIELDS.CREATED_FROM],
        })
        .run()
        .getRange({ start: 0, end: 1000 });

      const uniqueSoIds = new Set<string>();
      for (const r of results) {
        const soId = r.getValue(FIELDS.CREATED_FROM) as string;
        if (soId) uniqueSoIds.add(soId);
      }
      return Array.from(uniqueSoIds);
    } catch (err) {
      log.error({
        title: 'NetSuiteInvoiceRepository.findSalesOrderIdsByIds',
        details: (err as Error).message,
      });
      return [];
    }
  }
}
