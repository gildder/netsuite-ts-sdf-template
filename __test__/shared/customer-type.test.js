/**
 * Unit tests for shared/customer-type.
 * Run: pnpm build && pnpm test
 */
import { isValidCustomerType } from 'SuiteScripts/multicard-api/shared/customer-type';

describe('isValidCustomerType', () => {
  it.each(['1', '2', '3'])('accepts %s', (value) => {
    expect(isValidCustomerType(value)).toBe(true);
  });

  it.each(['', '0', '4', 'abc', ' 1', '1 '])('rejects %p', (value) => {
    expect(isValidCustomerType(value)).toBe(false);
  });
});
