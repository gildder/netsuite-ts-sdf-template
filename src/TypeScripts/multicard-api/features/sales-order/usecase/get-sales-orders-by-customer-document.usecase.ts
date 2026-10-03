/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Use case: GetSalesOrdersByCustomerDocument — paginated list of SOs by customer document number.
 * Solo devuelve OVs que tienen compras Multicard (relación cuota → factura → OV).
 */
import { type ApiResponse, failure, success } from '../../../shared/response';
import type { ICustomerRepository } from '../../customer/usecase/ports/customer.repository.port';
import type { IInstallmentRepository } from '../../installment/usecase/ports/installment.repository.port';
import type { IInvoiceRepository } from '../../invoice/usecase/ports/invoice.repository.port';
import {
  normalizePaging,
  resolveFinancedAmount,
  type SalesOrderSearchResult,
  toPage,
  withFinancedAmounts,
} from '../domain/sales-order.domain';
import type { ISalesOrderRepository } from './ports/sales-order.repository.port';

interface GetSalesOrdersByCustomerDocumentInput {
  documentNumber: string;
  complemento?: string;
  page?: number;
  pageSize?: number;
}

export class GetSalesOrdersByCustomerDocument {
  constructor(
    private readonly salesOrderRepo: ISalesOrderRepository,
    private readonly customerRepo: ICustomerRepository,
    private readonly installmentRepo: IInstallmentRepository,
    private readonly invoiceRepo: IInvoiceRepository,
  ) {}

  execute(input: GetSalesOrdersByCustomerDocumentInput): ApiResponse<SalesOrderSearchResult> {
    const documentNumber = input.documentNumber?.trim() ?? '';
    if (documentNumber === '') {
      return failure('documentNumber es requerido.');
    }

    const { page, pageSize } = normalizePaging(input.page, input.pageSize);

    // 1. Buscar el cliente por número de documento
    const customer = this.customerRepo.findByDocumentNumber(documentNumber);
    if (!customer) {
      return success<SalesOrderSearchResult>({ salesOrders: [], page, hasNextPage: false });
    }

    // 2. Validar el complemento a nivel de customer (no se puede filtrar sales
    // orders por custom fields del customer joined en NetSuite).
    if (!customer.matchesComplemento(input.complemento)) {
      return success<SalesOrderSearchResult>({ salesOrders: [], page, hasNextPage: false });
    }

    // 3. Obtener los IDs de las OVs que tienen compras Multicard (y su monto financiado).
    // Si la consulta falla se devuelve un error, no una lista vacía.
    let soMap: Map<string, number>;
    try {
      soMap = this.findFinancedAmountsBySalesOrder(customer.id);
    } catch {
      return failure('No se pudieron consultar las compras Multicard del cliente.');
    }
    const soIds = Array.from(soMap.keys());

    // 4. Buscar las OVs filtradas (pageSize + 1 filas: look-ahead para hasNextPage)
    const salesOrders = this.salesOrderRepo.findByCriteria(
      {
        documentNumber,
        page,
        pageSize,
        limit: pageSize + 1,
      },
      soIds,
    );

    // 5. Recortar a la página y detectar si hay una siguiente
    const { items, hasNextPage } = toPage(salesOrders, pageSize);

    // 6. Inyectar el financedAmount y retornar el listado paginado
    return success<SalesOrderSearchResult>({
      salesOrders: withFinancedAmounts(items, soMap),
      page,
      hasNextPage,
    });
  }

  /**
   * Recorre cliente → cuotas → facturas → OV y devuelve soId → monto financiado.
   * El monto de la factura tiene prioridad; el de las cuotas es el fallback.
   * Propaga los errores de los repositorios.
   */
  private findFinancedAmountsBySalesOrder(customerId: string): Map<string, number> {
    const amounts = new Map<string, number>();

    const invoiceIds = this.installmentRepo.findInvoiceIdsByCustomer(customerId);
    if (invoiceIds.length === 0) return amounts;

    const invoiceMap = this.invoiceRepo.findSalesOrderMapByIds(invoiceIds);
    for (const [soId, details] of invoiceMap.entries()) {
      amounts.set(
        soId,
        resolveFinancedAmount(details.financedAmount, () =>
          this.installmentRepo.findFinancedAmountByInvoiceId(details.invoiceId),
        ),
      );
    }
    return amounts;
  }
}
