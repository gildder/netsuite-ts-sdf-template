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
import type { Invoice, SalesOrderFinancing } from '../domain/invoice.domain';
import type { IInvoiceRepository } from '../usecase/ports/invoice.repository.port';

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
  MONTO_FINANCIADO: 'custbody_mc_monto_financiado',
} as const;

// Shape of the object returned by search.lookupFields for an invoice.
interface InvoiceLookupResult {
  [FIELDS.INTERNAL_ID]: Array<{ value: string }>;
  [FIELDS.TRAN_DATE]: string;
  [FIELDS.LAST_MODIFIED]?: string;
  [FIELDS.LOCATION]: Array<{ text: string }>;
  [FIELDS.NUMERO_FACTURA]: string;
  [FIELDS.NIT_CLIENTE]: string;
  [FIELDS.ENTITY]: Array<{ value: string; text: string }>;
  [FIELDS.CSV_FA_CUSTOM_NAMES]: string;
  [FIELDS.BILL_TO_NIT]: string;
  [FIELDS.FA_CUSTOM_NAMES]: string;
  [FIELDS.CUF]: string;
  [FIELDS.EMAIL]: string;
  [FIELDS.TOTAL]: string | number;
}

const toInvoice = (result: InvoiceLookupResult): Invoice => ({
  id: result[FIELDS.INTERNAL_ID][0].value,
  date: result[FIELDS.TRAN_DATE],
  time: result[FIELDS.LAST_MODIFIED]?.split(' ')[1],
  location: result[FIELDS.LOCATION][0]?.text ?? '',
  invoiceNumber: result[FIELDS.NUMERO_FACTURA],
  customerNit: result[FIELDS.BILL_TO_NIT] || result[FIELDS.NIT_CLIENTE],
  customerName:
    result[FIELDS.FA_CUSTOM_NAMES] ||
    result[FIELDS.ENTITY][0]?.text.split(' ').slice(1).join(' ') ||
    '',
  email: result[FIELDS.EMAIL],
  amount: result[FIELDS.TOTAL],
  cuf: result[FIELDS.CUF],
  customerId: result[FIELDS.ENTITY][0]?.value ?? '',
  cashRegister: 0,
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
   * Devuelve un mapa de salesOrderId a financedAmount, leyendo
   * createdfrom y custbody_mc_monto_financiado de las facturas dadas.
   * On error: logs via N/log and THROWS (el use case decide la respuesta).
   */
  findSalesOrderMapByIds(invoiceIds: string[]): Map<string, SalesOrderFinancing> {
    if (!invoiceIds || invoiceIds.length === 0) return new Map();
    try {
      const results = search
        .create({
          type: record.Type.INVOICE,
          filters: [[FIELDS.INTERNAL_ID, 'anyof', invoiceIds]] as unknown as search.Filter[],
          columns: [FIELDS.CREATED_FROM, FIELDS.MONTO_FINANCIADO, FIELDS.INTERNAL_ID],
        })
        .run()
        .getRange({ start: 0, end: 1000 });

      const map = new Map<string, SalesOrderFinancing>();
      for (const r of results) {
        const soId = r.getValue(FIELDS.CREATED_FROM) as string;
        if (soId && !map.has(soId)) {
          const amountRaw = r.getValue(FIELDS.MONTO_FINANCIADO);
          const amount = Number.parseFloat(amountRaw as string);
          const currentInvoiceId = r.getValue(FIELDS.INTERNAL_ID) as string;
          map.set(soId, {
            financedAmount: Number.isFinite(amount) ? amount : 0,
            invoiceId: currentInvoiceId,
          });
        }
      }
      return map;
    } catch (err) {
      log.error({
        title: 'NetSuiteInvoiceRepository.findSalesOrderMapByIds',
        details: (err as Error).message,
      });
      throw err;
    }
  }
}
