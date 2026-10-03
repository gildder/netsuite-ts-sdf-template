/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Puerto (driven side) del repositorio de Installment.
 */
import type { InstallmentRecord, InstallmentSummaryResult } from '../../domain/installment.domain';

export interface IInstallmentRepository {
  hasMora(customerId: string): boolean;
  save(installment: InstallmentRecord): string;
  delete(id: string): void;
  findInvoiceIdsByCustomer(customerId: string): string[];
  findInstallmentsByInvoiceId(invoiceId: string): InstallmentSummaryResult[];
  findFinancedAmountByInvoiceId(invoiceId: string): number;
}
