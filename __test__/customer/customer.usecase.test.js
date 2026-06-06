/**
 * Use-case unit tests for GetCustomerById.
 * Uses a literal fake ICustomerRepository — no Jest mocks, no N/* imports.
 * Tests run against compiled JS in src/FileCabinet via the SuiteScripts alias.
 * Run: pnpm build && pnpm test
 */
import { GetCustomerById } from 'SuiteScripts/multicard-api/features/customer/usecase/get-customer-by-id.usecase';

// ---------------------------------------------------------------------------
// Fake repository builder
// ---------------------------------------------------------------------------

/**
 * Creates a fake ICustomerRepository for GetCustomerById.
 * @param {Object} overrides - method overrides
 */
function makeFakeCustomerRepo(overrides = {}) {
  return {
    findByDocumentNumber: (_doc) => null,
    findValidatedByDocument: (_doc) => null,
    findById: (_id) => null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Fake customer detail JSON
// ---------------------------------------------------------------------------

const FAKE_CUSTOMER_DETAIL = {
  id: '789',
  documentNumber: '12345678',
  typeDocument: 'CI',
  name: 'JUAN CARLOS PEREZ LOPEZ',
  email: 'juan@example.com',
  mobilePhone: '71234567',
  type: 'NORMAL',
  creditLimit: 5000,
  balance: 1000,
  paymentDay: 15,
  contractNumber: 'MC-2025-001',
};

// ---------------------------------------------------------------------------
// GetCustomerById — validation
// ---------------------------------------------------------------------------

describe('GetCustomerById — validation', () => {
  it('fails when customerId is empty string', () => {
    const useCase = new GetCustomerById(makeFakeCustomerRepo());
    const result = useCase.execute('');
    expect(result.success).toBe(false);
    expect(result.message).toBeTruthy();
  });

  it('fails when customerId is whitespace only', () => {
    const useCase = new GetCustomerById(makeFakeCustomerRepo());
    const result = useCase.execute('   ');
    expect(result.success).toBe(false);
  });

  it('does NOT call repo.findById on invalid id', () => {
    const calls = [];
    const repo = makeFakeCustomerRepo({
      findById: (id) => {
        calls.push(id);
        return null;
      },
    });
    new GetCustomerById(repo).execute('');
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// GetCustomerById — not found
// ---------------------------------------------------------------------------

describe('GetCustomerById — not found', () => {
  it('returns success with customer:null when repo returns null', () => {
    const useCase = new GetCustomerById(makeFakeCustomerRepo({ findById: () => null }));
    const result = useCase.execute('999');
    expect(result.success).toBe(true);
    expect(result.data.customer).toBeNull();
    expect(result.message).toBeTruthy();
  });

  it('not-found message mentions cliente', () => {
    const useCase = new GetCustomerById(makeFakeCustomerRepo({ findById: () => null }));
    const result = useCase.execute('999');
    expect(result.message.toLowerCase()).toContain('cliente');
  });
});

// ---------------------------------------------------------------------------
// GetCustomerById — happy path
// ---------------------------------------------------------------------------

describe('GetCustomerById — happy path', () => {
  it('returns success with customer detail JSON when repo finds the record', () => {
    const fakeCustomerObj = {
      toDetailJSON: () => ({ ...FAKE_CUSTOMER_DETAIL }),
    };
    const useCase = new GetCustomerById(makeFakeCustomerRepo({ findById: () => fakeCustomerObj }));
    const result = useCase.execute('789');

    expect(result.success).toBe(true);
    expect(result.data.customer).not.toBeNull();
    expect(result.data.customer.id).toBe('789');
  });

  it('customer detail JSON has all expected fields', () => {
    const fakeCustomerObj = {
      toDetailJSON: () => ({ ...FAKE_CUSTOMER_DETAIL }),
    };
    const useCase = new GetCustomerById(makeFakeCustomerRepo({ findById: () => fakeCustomerObj }));
    const result = useCase.execute('789');
    const customer = result.data.customer;

    expect(customer).toHaveProperty('id');
    expect(customer).toHaveProperty('documentNumber');
    expect(customer).toHaveProperty('typeDocument');
    expect(customer).toHaveProperty('name');
    expect(customer).toHaveProperty('email');
    expect(customer).toHaveProperty('mobilePhone');
    expect(customer).toHaveProperty('type');
    expect(customer).toHaveProperty('creditLimit');
    expect(customer).toHaveProperty('balance');
    expect(customer).toHaveProperty('paymentDay');
    expect(customer).toHaveProperty('contractNumber');
  });

  it('calls repo.findById with the provided customerId', () => {
    const calledWith = [];
    const fakeCustomerObj = { toDetailJSON: () => ({ ...FAKE_CUSTOMER_DETAIL }) };
    const repo = makeFakeCustomerRepo({
      findById: (id) => {
        calledWith.push(id);
        return fakeCustomerObj;
      },
    });
    new GetCustomerById(repo).execute('789');
    expect(calledWith).toContain('789');
  });
});
