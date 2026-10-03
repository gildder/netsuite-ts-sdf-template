/**
 * Domain unit tests for sales-order.domain (read-model projections).
 * Tests run against the compiled JS in src/FileCabinet via the SuiteScripts alias.
 * Run: pnpm build && pnpm test
 */
import {
  resolveFinancedAmount,
  toCustomerSummary,
  toInvoiceSummary,
} from 'SuiteScripts/multicard-api/features/sales-order/domain/sales-order.domain';

// ---------------------------------------------------------------------------
// toInvoiceSummary
// ---------------------------------------------------------------------------
describe('toInvoiceSummary', () => {
  const base = {
    id: 'INV-1',
    date: '2026-01-15',
    location: 'Loc A',
    invoiceNumber: '000123',
    customerNit: '1234567',
    customerName: 'Juan Perez',
    email: 'juan@example.com',
    amount: 1500.5,
    cuf: 'CUF-ABC',
    customerId: 'CUST-9',
    cashRegister: 3,
  };

  it('drops time when it is a string', () => {
    const result = toInvoiceSummary({ ...base, time: '10:30:00' });
    expect(result).not.toHaveProperty('time');
    expect(result).toEqual(base);
  });

  it('drops time when it is undefined', () => {
    const result = toInvoiceSummary({ ...base, time: undefined });
    expect(result).not.toHaveProperty('time');
    expect(result).toEqual(base);
  });
});

// ---------------------------------------------------------------------------
// toCustomerSummary
// ---------------------------------------------------------------------------
describe('toCustomerSummary', () => {
  const detail = {
    id: 'C-1',
    documentNumber: '1234567',
    typeDocument: 'CI',
    name: 'Juan Perez',
    email: 'juan@example.com',
    mobilePhone: '70000000',
    type: '1',
    creditLimit: 5000,
    balance: 1200,
    paymentDay: 15,
    contractNumber: 'CT-77',
  };

  it('maps mobilePhone to phone and paymentDay to string, keeping the rest', () => {
    const result = toCustomerSummary(detail);
    expect(result).toEqual({
      id: 'C-1',
      documentNumber: '1234567',
      typeDocument: 'CI',
      name: 'Juan Perez',
      email: 'juan@example.com',
      phone: '70000000',
      type: '1',
      creditLimit: 5000,
      balance: 1200,
      paymentDay: '15',
      contractNumber: 'CT-77',
    });
    expect(result).not.toHaveProperty('mobilePhone');
    expect(typeof result.paymentDay).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// resolveFinancedAmount
// ---------------------------------------------------------------------------
describe('resolveFinancedAmount', () => {
  it('returns the invoice amount when greater than 0 without calling the fallback', () => {
    const fallback = jest.fn().mockReturnValue(999);
    expect(resolveFinancedAmount(1500, fallback)).toBe(1500);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('calls the fallback and returns its value when the invoice amount is 0', () => {
    const fallback = jest.fn().mockReturnValue(800);
    expect(resolveFinancedAmount(0, fallback)).toBe(800);
    expect(fallback).toHaveBeenCalledTimes(1);
  });
});
