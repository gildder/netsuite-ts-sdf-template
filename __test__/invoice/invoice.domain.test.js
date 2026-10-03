/**
 * Domain unit tests for invoice.domain.
 * Characterization tests: document the CURRENT behavior of isValidInvoiceId.
 * Tests run against the compiled JS in src/FileCabinet via the SuiteScripts alias.
 */
import { isValidInvoiceId } from 'SuiteScripts/multicard-api/features/invoice/domain/invoice.domain';

describe('isValidInvoiceId', () => {
  it('accepts a numeric id', () => {
    expect(isValidInvoiceId('12345')).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(isValidInvoiceId('')).toBe(false);
  });

  it('rejects whitespace only', () => {
    expect(isValidInvoiceId('   ')).toBe(false);
  });

  it('rejects a non-numeric string', () => {
    expect(isValidInvoiceId('abc')).toBe(false);
  });

  it('rejects a numeric prefix followed by letters (Number() is NaN)', () => {
    expect(isValidInvoiceId('12abc')).toBe(false);
  });

  it('accepts surrounding whitespace (Number trims it)', () => {
    expect(isValidInvoiceId(' 12 ')).toBe(true);
  });
});
