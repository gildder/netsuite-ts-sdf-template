/**
 * Domain unit tests for customer.domain (entity rules and status derivation).
 * Tests run against the compiled JS in src/FileCabinet via the SuiteScripts alias.
 * Run: pnpm build && pnpm test
 */
import {
  Customer,
  ENABLED_STATUS,
  isValidDocumentNumber,
  STATUS_DISABLED,
  STATUS_MORA,
  STATUS_NOBALANCE,
  STATUS_NOPHONE,
  STATUS_SUCCESS,
} from 'SuiteScripts/multicard-api/features/customer/domain/customer.domain';

const makeCustomer = (overrides = {}) =>
  new Customer({
    id: 'C-1',
    documentNumber: '1234567',
    firstName: 'Juan',
    secondName: '',
    firstLastName: 'Perez',
    secondLastName: '',
    email: 'juan@example.com',
    mobilePhone: '71234567',
    subsidiary: 1,
    type: 'Titular',
    mcStatus: 'Aprobado',
    cardStatus: '1',
    contractSigned: true,
    insuranceSigned: true,
    creditLimit: 1000,
    balance: 200,
    availableBalance: 800,
    paymentDay: 5,
    ...overrides,
  });

// ---------------------------------------------------------------------------
// matchesComplemento
// ---------------------------------------------------------------------------
describe('Customer.matchesComplemento', () => {
  const customer = makeCustomer({ complemento: '1A' });

  it('matches when complemento is undefined', () => {
    expect(customer.matchesComplemento(undefined)).toBe(true);
  });

  it('matches when complemento is empty', () => {
    expect(customer.matchesComplemento('')).toBe(true);
  });

  it('matches when complemento is only whitespace', () => {
    expect(customer.matchesComplemento('   ')).toBe(true);
  });

  it('matches when complemento is equal', () => {
    expect(customer.matchesComplemento('1A')).toBe(true);
  });

  it('matches when complemento is equal after trimming', () => {
    expect(customer.matchesComplemento('  1A  ')).toBe(true);
  });

  it('does not match a different complemento', () => {
    expect(customer.matchesComplemento('2B')).toBe(false);
  });

  it('does not match a complemento when the customer has none', () => {
    expect(makeCustomer().matchesComplemento('1A')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// purchaseStatus
// ---------------------------------------------------------------------------
describe('Customer.purchaseStatus', () => {
  it('returns DISABLED without evaluating mora when the card is invalid', () => {
    const hasMora = jest.fn(() => true);
    const status = makeCustomer({ cardStatus: '2' }).purchaseStatus(hasMora);
    expect(status).toBe(STATUS_DISABLED);
    expect(hasMora).not.toHaveBeenCalled();
  });

  it('returns MORA when the card is valid and there is mora', () => {
    const hasMora = jest.fn(() => true);
    expect(makeCustomer().purchaseStatus(hasMora)).toBe(STATUS_MORA);
    expect(hasMora).toHaveBeenCalledTimes(1);
  });

  it('returns NOPHONE when the phone is invalid and there is no mora', () => {
    const hasMora = jest.fn(() => false);
    expect(makeCustomer({ mobilePhone: '123' }).purchaseStatus(hasMora)).toBe(STATUS_NOPHONE);
    expect(hasMora).toHaveBeenCalledTimes(1);
  });

  it('returns NOBALANCE when there is no available balance', () => {
    const hasMora = jest.fn(() => false);
    expect(makeCustomer({ availableBalance: 0 }).purchaseStatus(hasMora)).toBe(STATUS_NOBALANCE);
    expect(hasMora).toHaveBeenCalledTimes(1);
  });

  it('returns SUCCESS when every rule passes', () => {
    const hasMora = jest.fn(() => false);
    expect(makeCustomer().purchaseStatus(hasMora)).toBe(STATUS_SUCCESS);
    expect(hasMora).toHaveBeenCalledTimes(1);
  });

  it('keeps the status name and description unchanged', () => {
    expect(STATUS_SUCCESS).toEqual({ name: 'SUCCESS', description: 'Cliente habilitado' });
    expect(STATUS_MORA).toEqual({ name: 'MORA', description: 'Cliente tiene cuotas con Mora' });
  });
});

// ---------------------------------------------------------------------------
// enabledStatus
// ---------------------------------------------------------------------------
describe('Customer.enabledStatus', () => {
  it('returns NO_MULTICARD without evaluating mora when the contract is unsigned', () => {
    const hasMora = jest.fn(() => true);
    const customer = makeCustomer({ contractSigned: false });
    expect(customer.enabledStatus(hasMora)).toBe(ENABLED_STATUS.NO_MULTICARD);
    expect(hasMora).not.toHaveBeenCalled();
  });

  it('returns NO_MULTICARD without evaluating mora when the insurance is unsigned', () => {
    const hasMora = jest.fn(() => true);
    const customer = makeCustomer({ insuranceSigned: false });
    expect(customer.enabledStatus(hasMora)).toBe(ENABLED_STATUS.NO_MULTICARD);
    expect(hasMora).not.toHaveBeenCalled();
  });

  it('returns NO_MORA when there is mora', () => {
    const hasMora = jest.fn(() => true);
    expect(makeCustomer().enabledStatus(hasMora)).toBe(ENABLED_STATUS.NO_MORA);
    expect(hasMora).toHaveBeenCalledTimes(1);
  });

  it('returns SI when there is a multicard and no mora', () => {
    const hasMora = jest.fn(() => false);
    expect(makeCustomer().enabledStatus(hasMora)).toBe(ENABLED_STATUS.SI);
    expect(hasMora).toHaveBeenCalledTimes(1);
  });

  it('keeps the label strings unchanged', () => {
    expect(ENABLED_STATUS).toEqual({
      SI: 'Sí',
      NO_MORA: 'No, con Mora',
      NO_MULTICARD: 'No, sin Multicard',
    });
  });
});

// ---------------------------------------------------------------------------
// isPhoneValid
// ---------------------------------------------------------------------------
describe('Customer.isPhoneValid', () => {
  it('accepts a phone with 8 digits', () => {
    expect(makeCustomer({ mobilePhone: '71234567' }).isPhoneValid()).toBe(true);
  });

  it('accepts a phone longer than 8 digits', () => {
    expect(makeCustomer({ mobilePhone: '5917123456' }).isPhoneValid()).toBe(true);
  });

  it('rejects a phone shorter than 8 digits', () => {
    expect(makeCustomer({ mobilePhone: '7123456' }).isPhoneValid()).toBe(false);
  });

  it('rejects an empty phone', () => {
    expect(makeCustomer({ mobilePhone: '' }).isPhoneValid()).toBe(false);
  });

  it('rejects an undefined phone', () => {
    expect(makeCustomer({ mobilePhone: undefined }).isPhoneValid()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isValidDocumentNumber
// ---------------------------------------------------------------------------
describe('isValidDocumentNumber', () => {
  it('accepts a numeric document', () => {
    expect(isValidDocumentNumber('1234567')).toBe(true);
  });

  it('accepts a numeric document with surrounding spaces', () => {
    expect(isValidDocumentNumber(' 1234567 ')).toBe(true);
  });

  it('rejects an empty document', () => {
    expect(isValidDocumentNumber('')).toBe(false);
  });

  it('rejects a whitespace-only document', () => {
    expect(isValidDocumentNumber('   ')).toBe(false);
  });

  it('rejects a non-numeric document', () => {
    expect(isValidDocumentNumber('abc')).toBe(false);
  });

  it('rejects a partially numeric document', () => {
    expect(isValidDocumentNumber('123abc')).toBe(false);
  });

  it('rejects Infinity', () => {
    expect(isValidDocumentNumber('Infinity')).toBe(false);
  });
});
