/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Cross-cutting customer type. Single source of truth for customer and installment.
 */

export const CUSTOMER_TYPE = {
  NORMAL: '1',
  EMPLOYEE: '2',
  CORPORATE: '3',
} as const;

export type CustomerType = (typeof CUSTOMER_TYPE)[keyof typeof CUSTOMER_TYPE];
