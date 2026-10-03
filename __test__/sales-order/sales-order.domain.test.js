/**
 * Domain unit tests for sales-order.domain (read-model projections).
 * Tests run against the compiled JS in src/FileCabinet via the SuiteScripts alias.
 * Run: pnpm build && pnpm test
 */
import {
  normalizePaging,
  resolveFinancedAmount,
  toCustomerSummary,
  toInvoiceSummary,
  toPage,
  withFinancedAmounts,
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

// ---------------------------------------------------------------------------
// normalizePaging
// ---------------------------------------------------------------------------
describe('normalizePaging', () => {
  it('defaults to page 0 and pageSize 10 when undefined', () => {
    expect(normalizePaging(undefined, undefined)).toEqual({ page: 0, pageSize: 10 });
  });

  it('clamps negative pages to 0', () => {
    expect(normalizePaging(-5, 10).page).toBe(0);
  });

  it('floors fractional page and pageSize', () => {
    expect(normalizePaging(2.9, 7.8)).toEqual({ page: 2, pageSize: 7 });
  });

  it('falls back to 10 when pageSize is 0, negative or undefined', () => {
    expect(normalizePaging(0, 0).pageSize).toBe(10);
    expect(normalizePaging(0, -3).pageSize).toBe(10);
    expect(normalizePaging(0, undefined).pageSize).toBe(10);
  });

  it('keeps a custom pageSize', () => {
    expect(normalizePaging(1, 25)).toEqual({ page: 1, pageSize: 25 });
  });
});

// ---------------------------------------------------------------------------
// toPage
// ---------------------------------------------------------------------------
describe('toPage', () => {
  it('returns all rows and no next page when there are fewer than pageSize', () => {
    expect(toPage([1, 2], 3)).toEqual({ items: [1, 2], hasNextPage: false });
  });

  it('returns no next page when rows equal pageSize', () => {
    expect(toPage([1, 2, 3], 3)).toEqual({ items: [1, 2, 3], hasNextPage: false });
  });

  it('trims the look-ahead row and flags a next page when rows exceed pageSize', () => {
    expect(toPage([1, 2, 3, 4], 3)).toEqual({ items: [1, 2, 3], hasNextPage: true });
  });
});

// ---------------------------------------------------------------------------
// withFinancedAmounts
// ---------------------------------------------------------------------------
describe('withFinancedAmounts', () => {
  it('injects the financed amount by sales order id and defaults to 0 when missing', () => {
    const amounts = new Map([['100', 1500]]);
    const result = withFinancedAmounts(
      [
        { id: '100', financedAmount: 0 },
        { id: '101', financedAmount: 9 },
      ],
      amounts,
    );
    expect(result).toEqual([
      { id: '100', financedAmount: 1500 },
      { id: '101', financedAmount: 0 },
    ]);
  });
});
