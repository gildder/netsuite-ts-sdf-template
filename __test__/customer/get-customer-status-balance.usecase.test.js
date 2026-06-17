/**
 * Unit tests — GetCustomerStatusBalance use case.
 * Tests run against compiled JS in src/FileCabinet via the SuiteScripts alias.
 * Run: pnpm build && pnpm test
 *
 * Strict TDD: tests written first (RED), implementation makes them GREEN.
 */
import { GetCustomerStatusBalance } from 'SuiteScripts/multicard-api/features/customer/usecase/get-customer-status-balance.usecase';

// ---------------------------------------------------------------------------
// Fake Customer object (mirrors Customer domain class shape)
// ---------------------------------------------------------------------------

/**
 * Creates a minimal Customer-like object for test assertions.
 * @param {Object} overrides
 * @returns {Object}
 */
function makeCustomer(overrides = {}) {
  return {
    id: 'cust-001',
    documentNumber: '12345678',
    availableBalance: 500,
    complemento: '',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Fake repository builders
// ---------------------------------------------------------------------------

function makeFakeCustomerRepo(overrides = {}) {
  return {
    findByDocumentNumber: (_doc) => null,
    findValidatedByDocument: (_doc) => null,
    findById: (_id) => null,
    setFirstSaleMulticardDateIfEmpty: (_id, _date) => false,
    ...overrides,
  };
}

function makeFakeInstallmentRepo(overrides = {}) {
  return {
    hasMora: (_customerId) => false,
    save: (_installment) => '',
    delete: (_id) => undefined,
    findInvoiceIdsByCustomer: (_customerId) => [],
    findInstallmentsByInvoiceId: (_invoiceId) => [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test: customer not found → failure; hasMora NOT called  (T-02)
// ---------------------------------------------------------------------------

describe('GetCustomerStatusBalance — customer not found', () => {
  it('returns failure when customer is not found', () => {
    const customerRepo = makeFakeCustomerRepo({ findByDocumentNumber: () => null });
    const hasMoraCalls = [];
    const installmentRepo = makeFakeInstallmentRepo({
      hasMora: (id) => {
        hasMoraCalls.push(id);
        return false;
      },
    });

    const useCase = new GetCustomerStatusBalance(customerRepo, installmentRepo);
    const result = useCase.execute({ documentNumber: '99999999' });

    expect(result.success).toBe(false);
    expect(result.message).toBeTruthy();
    expect(result.message.toLowerCase()).toContain('cliente');
    expect(hasMoraCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test: complemento mismatch → same not-found failure; hasMora NOT called  (T-03)
// ---------------------------------------------------------------------------

describe('GetCustomerStatusBalance — complemento mismatch', () => {
  it('returns failure when complemento does not match customer complemento', () => {
    const customer = makeCustomer({ complemento: 'A', availableBalance: 300 });
    const customerRepo = makeFakeCustomerRepo({ findByDocumentNumber: () => customer });
    const hasMoraCalls = [];
    const installmentRepo = makeFakeInstallmentRepo({
      hasMora: (id) => {
        hasMoraCalls.push(id);
        return false;
      },
    });

    const useCase = new GetCustomerStatusBalance(customerRepo, installmentRepo);
    const result = useCase.execute({ documentNumber: '12345678', complemento: 'B' });

    expect(result.success).toBe(false);
    expect(result.message).toBeTruthy();
    expect(result.message.toLowerCase()).toContain('cliente');
    expect(hasMoraCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test: no mora + complemento absent → success habilitado Sí  (T-04)
// ---------------------------------------------------------------------------

describe('GetCustomerStatusBalance — enabled, no mora, complemento absent', () => {
  it('returns success with habilitado Sí when customer has no mora and complemento is absent', () => {
    const customer = makeCustomer({ availableBalance: 500, complemento: 'X' });
    const customerRepo = makeFakeCustomerRepo({ findByDocumentNumber: () => customer });
    const installmentRepo = makeFakeInstallmentRepo({ hasMora: () => false });

    const useCase = new GetCustomerStatusBalance(customerRepo, installmentRepo);
    const result = useCase.execute({ documentNumber: '12345678' });

    expect(result.success).toBe(true);
    expect(result.message).toBe('');
    expect(result.data).not.toBeNull();
    expect(result.data.habilitado).toBe('Sí');
    expect(result.data.saldoDisponible).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Test: has mora + complemento matches → success habilitado No, con Mora  (T-05)
// ---------------------------------------------------------------------------

describe('GetCustomerStatusBalance — disabled, has mora, complemento matches', () => {
  it('returns success with habilitado No con Mora when customer has mora and complemento matches', () => {
    const customer = makeCustomer({ availableBalance: -50, complemento: 'AB' });
    const customerRepo = makeFakeCustomerRepo({ findByDocumentNumber: () => customer });
    const installmentRepo = makeFakeInstallmentRepo({ hasMora: () => true });

    const useCase = new GetCustomerStatusBalance(customerRepo, installmentRepo);
    const result = useCase.execute({ documentNumber: '12345678', complemento: 'AB' });

    expect(result.success).toBe(true);
    expect(result.data).not.toBeNull();
    expect(result.data.habilitado).toBe('No, con Mora');
    expect(result.data.saldoDisponible).toBe(-50);
  });
});

// ---------------------------------------------------------------------------
// Test: blank documentNumber → required failure; zero repo calls  (T-06)
// ---------------------------------------------------------------------------

describe('GetCustomerStatusBalance — blank documentNumber', () => {
  it('returns failure when documentNumber is blank without calling any repo', () => {
    const findCalls = [];
    const hasMoraCalls = [];
    const customerRepo = makeFakeCustomerRepo({
      findByDocumentNumber: (doc) => {
        findCalls.push(doc);
        return null;
      },
    });
    const installmentRepo = makeFakeInstallmentRepo({
      hasMora: (id) => {
        hasMoraCalls.push(id);
        return false;
      },
    });

    const useCase = new GetCustomerStatusBalance(customerRepo, installmentRepo);
    const result = useCase.execute({ documentNumber: '   ' });

    expect(result.success).toBe(false);
    expect(result.message).toBeTruthy();
    expect(findCalls).toHaveLength(0);
    expect(hasMoraCalls).toHaveLength(0);
  });
});
