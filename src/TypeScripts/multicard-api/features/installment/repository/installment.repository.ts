/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Capa de infraestructura — adaptador de persistencia NetSuite para installment.
 * ÚNICO archivo del feature con imports de N/*. Implementa el puerto
 * IInstallmentRepository declarado en installment.usecase.ts.
 * Los identificadores de NetSuite del feature viven acá (RECORD + FIELDS + STATUS).
 */
import * as log from 'N/log';
import * as record from 'N/record';
import * as search from 'N/search';
import type {
  IInstallmentRepository,
  InstallmentSummaryResult,
} from '../usecase/installment.usecase';
import type { InstallmentRecord } from '../domain/installment.domain';

// --- Identificadores NetSuite (installment) ---
const RECORD_INSTALLMENT = 'customrecord_sdb_siscred_cuota';

const STATUS = {
  ACTIVE: 1,
  MORA: 4,
} as const;

const FIELDS = {
  INTERNAL_ID: 'internalid',
  IS_INACTIVE: 'isinactive',
  CLIENTE: 'custrecord_sdb_cliente',
  FACTURA: 'custrecord_sdb_factura',
  NUM: 'custrecord_sdb_siscredcuota_num',
  ESTADO: 'custrecord_sdb_siscred_estadocuota',
  FECHA_PAGO: 'custrecord_sdb_siscred_fechapago',
  MONTO_FINANC: 'custrecord_sdb_siscred_montofinanc',
  TOTAL_CAPITAL: 'custrecord_sdb_total_capital',
  TOTAL_CARGO_ADMIN: 'custrecord_sdb_total_cargoadministrativo',
  TOTAL_CARGO_SEGURO: 'custrecord_sdb_total_cargoseguro',
  TOTAL_CARGO_MORA: 'custrecord_sdb_total_cargomora',
  TOTAL_COBRANZA: 'custrecord_sdb_total_cobranza',
  TOTAL_TOTAL: 'custrecord_sdb_total_total',
  PAGO_CAPITAL: 'custrecord_sdb_pago_capital',
  PAGO_CARGO_ADMIN: 'custrecord_sdb_pago_cargoadministrativo',
  PAGO_CARGO_SEGURO: 'custrecord_sdb_pagado_cargoseguro',
  PAGO_CARGO_MORA: 'custrecord_sdb_pago_cargomora',
  PAGO_COBRANZA: 'custrecord_sdb_pago_cobranza',
  PAGO_TOTAL: 'custrecord_sdb_pago_total',
} as const;

const toNumber = (raw: unknown): number => {
  const n = Number.parseFloat(raw as string);
  return Number.isFinite(n) ? n : 0;
};

export class NetSuiteInstallmentRepository implements IInstallmentRepository {
  /**
   * Returns true if the customer has any installment in Mora status (estado=4).
   * On error: logs via N/log and returns false (frozen boolean contract).
   */
  hasMora(customerId: string): boolean {
    try {
      const results = search
        .create({
          type: RECORD_INSTALLMENT,
          filters: [
            [FIELDS.CLIENTE, 'is', customerId],
            'AND',
            [FIELDS.ESTADO, 'is', String(STATUS.MORA)],
            'AND',
            [FIELDS.IS_INACTIVE, 'is', 'F'],
          ] as unknown as search.Filter[],
          columns: [FIELDS.INTERNAL_ID],
        })
        .run()
        .getRange({ start: 0, end: 100 });

      return results.length > 0;
    } catch (err) {
      log.error({
        title: 'NetSuiteInstallmentRepository.hasMora',
        details: (err as Error).message,
      });
      return false;
    }
  }

  /**
   * Persists one installment row.
   * On error: logs via N/log and THROWS (so the use-case saga can compensate).
   * Returns the created record internalId as string.
   */
  save(installment: InstallmentRecord): string {
    try {
      const rec = record.create({ type: RECORD_INSTALLMENT, isDynamic: true });

      rec.setValue({ fieldId: FIELDS.CLIENTE, value: installment.customerId });
      rec.setValue({ fieldId: FIELDS.FACTURA, value: installment.invoiceId });
      rec.setValue({ fieldId: FIELDS.NUM, value: installment.nro });
      rec.setValue({ fieldId: FIELDS.ESTADO, value: STATUS.ACTIVE });
      rec.setValue({ fieldId: FIELDS.FECHA_PAGO, value: installment.paymentDate });
      rec.setValue({ fieldId: FIELDS.MONTO_FINANC, value: installment.financedAmount });
      rec.setValue({ fieldId: FIELDS.TOTAL_CAPITAL, value: installment.capital });
      rec.setValue({ fieldId: FIELDS.TOTAL_CARGO_ADMIN, value: installment.adminCharge ?? 0 });
      rec.setValue({ fieldId: FIELDS.TOTAL_CARGO_SEGURO, value: 0 });
      rec.setValue({ fieldId: FIELDS.TOTAL_CARGO_MORA, value: 0 });
      rec.setValue({ fieldId: FIELDS.TOTAL_COBRANZA, value: 0 });
      rec.setValue({ fieldId: FIELDS.TOTAL_TOTAL, value: installment.total });
      rec.setValue({ fieldId: FIELDS.PAGO_CAPITAL, value: 0 });
      rec.setValue({ fieldId: FIELDS.PAGO_CARGO_ADMIN, value: 0 });
      rec.setValue({ fieldId: FIELDS.PAGO_CARGO_SEGURO, value: 0 });
      rec.setValue({ fieldId: FIELDS.PAGO_CARGO_MORA, value: 0 });
      rec.setValue({ fieldId: FIELDS.PAGO_COBRANZA, value: 0 });
      rec.setValue({ fieldId: FIELDS.PAGO_TOTAL, value: 0 });

      const id = rec.save({ enableSourcing: true, ignoreMandatoryFields: true });
      return String(id);
    } catch (err) {
      log.error({
        title: 'NetSuiteInstallmentRepository.save',
        details: (err as Error).message,
      });
      throw err;
    }
  }

  /**
   * Compensating action: deletes a previously created installment by id.
   * Best-effort — logs on error but may rethrow (use-case compensate() swallows it).
   */
  delete(id: string): void {
    try {
      record.delete({ type: RECORD_INSTALLMENT, id: Number(id) });
    } catch (err) {
      log.error({
        title: 'NetSuiteInstallmentRepository.delete',
        details: (err as Error).message,
      });
      throw err;
    }
  }

  /**
   * Devuelve los invoiceIds únicos asociados a las cuotas activas de un cliente.
   * Usado por el filtro Multicard: customer → installments → invoiceIds → invoices → SO ids.
   * On error: logs via N/log and returns empty array.
   */
  findInvoiceIdsByCustomer(customerId: string): string[] {
    try {
      const results = search
        .create({
          type: RECORD_INSTALLMENT,
          filters: [
            [FIELDS.CLIENTE, 'is', customerId],
            'AND',
            [FIELDS.IS_INACTIVE, 'is', 'F'],
          ] as unknown as search.Filter[],
          columns: [FIELDS.FACTURA],
        })
        .run()
        .getRange({ start: 0, end: 1000 });

      const uniqueInvoiceIds = new Set<string>();
      for (const r of results) {
        const invoiceId = r.getValue(FIELDS.FACTURA) as string;
        if (invoiceId) uniqueInvoiceIds.add(invoiceId);
      }
      return Array.from(uniqueInvoiceIds);
    } catch (err) {
      log.error({
        title: `NetSuiteInstallmentRepository.findInvoiceIdsByCustomer customerId: ${customerId}`,
        details: (err as Error).message,
      });
      return [];
    }
  }

  /**
   * Devuelve las cuotas activas asociadas a una factura, en formato resumido
   * { id, nro, paymentDate, total } para alimentar el summary de venta Multicard.
   * On error: logs via N/log and returns empty array.
   */
  findInstallmentsByInvoiceId(invoiceId: string): InstallmentSummaryResult[] {
    try {
      const results = search
        .create({
          type: RECORD_INSTALLMENT,
          filters: [
            [FIELDS.FACTURA, 'is', invoiceId],
            'AND',
            [FIELDS.IS_INACTIVE, 'is', 'F'],
          ] as unknown as search.Filter[],
          columns: [FIELDS.INTERNAL_ID, FIELDS.NUM, FIELDS.FECHA_PAGO, FIELDS.TOTAL_TOTAL],
        })
        .run()
        .getRange({ start: 0, end: 1000 });

      return results.map((r) => ({
        id: r.getValue(FIELDS.INTERNAL_ID) as string,
        nro: toNumber(r.getValue(FIELDS.NUM)),
        paymentDate: (r.getValue(FIELDS.FECHA_PAGO) as string) ?? '',
        total: toNumber(r.getValue(FIELDS.TOTAL_TOTAL)),
      }));
    } catch (err) {
      log.error({
        title: `NetSuiteInstallmentRepository.findInstallmentsByInvoiceId invoiceId: ${invoiceId}`,
        details: (err as Error).message,
      });
      return [];
    }
  }
}
