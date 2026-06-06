/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Puerto (driven side) — filtro Multicard para Sales Order.
 * Encapsula el camino customer → installments → invoices → SO ids.
 * Vive dentro del feature sales-order para mantener la lógica
 * de filtrado Multicard junto a su consumidor principal.
 */
export interface IMulticardSalesOrderFilter {
  /**
   * Devuelve los SO ids del cliente que tienen compras Multicard,
   * siguiendo la cadena: customerId → installments → invoiceIds → invoices → createdfrom (SO ids).
   * Devuelve un array vacío si el cliente no tiene cuotas.
   */
  findSalesOrderIdsByCustomer(customerId: string): string[];
}
