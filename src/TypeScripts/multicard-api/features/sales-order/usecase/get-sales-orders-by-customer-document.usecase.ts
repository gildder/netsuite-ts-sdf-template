/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Use case: GetSalesOrdersByCustomerDocument — paginated list of SOs by customer document number.
 * Solo devuelve OVs que tienen compras Multicard (relación cuota → factura → OV).
 */
import { type ApiResponse, failure, success } from '../../../shared/response';
import type { ICustomerRepository } from '../../customer/usecase/ports/customer.repository.port';
import type { SalesOrderSearchResult } from '../domain/sales-order.domain';
import type { IMulticardSalesOrderFilter } from './ports/multicard-sales-order-filter.port';
import type { ISalesOrderRepository } from './ports/sales-order.repository.port';

interface GetSalesOrdersByCustomerDocumentInput {
  documentNumber: string;
  complemento?: string;
  page?: number;
}

export class GetSalesOrdersByCustomerDocument {
  constructor(
    private readonly salesOrderRepo: ISalesOrderRepository,
    private readonly customerRepo: ICustomerRepository,
    private readonly multicardFilter: IMulticardSalesOrderFilter,
  ) {}

  execute(input: GetSalesOrdersByCustomerDocumentInput): ApiResponse<SalesOrderSearchResult> {
    const documentNumber = input.documentNumber?.trim() ?? '';
    if (documentNumber === '') {
      return failure('documentNumber es requerido.');
    }

    const page = Math.max(0, Math.floor(input.page ?? 0));

    // 1. Buscar el cliente por número de documento
    const customer = this.customerRepo.findByDocumentNumber(documentNumber);
    if (!customer) {
      return success<SalesOrderSearchResult>({ salesOrders: [], page });
    }

    // 2. Validar el complemento a nivel de customer (no se puede filtrar sales
    // orders por custom fields del customer joined en NetSuite).
    const complemento = input.complemento?.trim() ?? '';
    if (complemento !== '' && customer.complemento !== complemento) {
      return success<SalesOrderSearchResult>({ salesOrders: [], page });
    }

    // 3. Filtrar las OVs que tienen compras Multicard
    const soIds = this.multicardFilter.findSalesOrderIdsByCustomer(customer.id);

    // 4. Buscar las OVs filtradas
    const salesOrders = this.salesOrderRepo.findByCriteria(
      {
        documentNumber,
        page,
      },
      soIds,
    );

    return success<SalesOrderSearchResult>({ salesOrders, page });
  }
}
