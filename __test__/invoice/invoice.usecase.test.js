/**
 * Use-case unit tests for GetInvoice.
 * Uses a literal fake IInvoiceRepository — no Jest mocks, no N/* imports.
 * Tests run against compiled JS in src/FileCabinet via the SuiteScripts alias.
 * Run: pnpm build && pnpm test
 */
import { GetInvoice } from 'SuiteScripts/multicard-api/features/invoice/usecase/invoice.usecase';

// ---------------------------------------------------------------------------
// Fake repository builder
// ---------------------------------------------------------------------------

/**
 * Creates a fake IInvoiceRepository.
 * @param {Object} overrides - method overrides { findById }
 */
function makeFakeRepo(overrides = {}) {
  return {
    findById: (_invoiceId) => null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Fake invoice data
// ---------------------------------------------------------------------------

const FAKE_INVOICE = {
  id: '12345',
  date: '01/15/2025',
  time: '10:30:00',
  location: 'Sucursal Central',
  invoiceNumber: 'F-001-00001',
  customerNit: '12345678',
  customerName: 'JUAN PEREZ',
  email: 'juan@example.com',
  amount: '1500.00',
  cuf: 'CUF123456789',
  customerId: '987',
  cashRegister: 0,
};

// ---------------------------------------------------------------------------
// GetInvoice — validation
// ---------------------------------------------------------------------------

describe('GetInvoice — validation', () => {
  it('fails when invoiceId is empty string', () => {
    const useCase = new GetInvoice(makeFakeRepo());
    const result = useCase.execute('');
    expect(result.success).toBe(false);
    expect(result.message).toBeTruthy();
  });

  it('fails when invoiceId is non-numeric', () => {
    const useCase = new GetInvoice(makeFakeRepo());
    const result = useCase.execute('abc');
    expect(result.success).toBe(false);
    expect(result.message).toBeTruthy();
  });

  it('fails when invoiceId is whitespace only', () => {
    const useCase = new GetInvoice(makeFakeRepo());
    const result = useCase.execute('   ');
    expect(result.success).toBe(false);
  });

  it('does NOT call repo.findById on invalid id', () => {
    const calls = [];
    const repo = makeFakeRepo({
      findById: (id) => {
        calls.push(id);
        return null;
      },
    });
    new GetInvoice(repo).execute('');
    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// GetInvoice — not found
// ---------------------------------------------------------------------------

describe('GetInvoice — not found', () => {
  it('returns success with invoice:null when repo returns null', () => {
    const useCase = new GetInvoice(makeFakeRepo({ findById: () => null }));
    const result = useCase.execute('999');
    expect(result.success).toBe(true);
    expect(result.data.invoice).toBeNull();
    expect(result.message).toBeTruthy();
  });

  it('not-found message mentions factura', () => {
    const useCase = new GetInvoice(makeFakeRepo({ findById: () => null }));
    const result = useCase.execute('999');
    expect(result.message.toLowerCase()).toContain('factura');
  });
});

// ---------------------------------------------------------------------------
// GetInvoice — happy path
// ---------------------------------------------------------------------------

describe('GetInvoice — happy path', () => {
  it('returns success with invoice JSON when repo finds the record', () => {
    const fakeInvoiceObj = {
      toJSON: () => ({ ...FAKE_INVOICE }),
    };
    const useCase = new GetInvoice(makeFakeRepo({ findById: () => fakeInvoiceObj }));
    const result = useCase.execute('12345');

    expect(result.success).toBe(true);
    expect(result.data.invoice).not.toBeNull();
    expect(result.data.invoice.id).toBe('12345');
  });

  it('invoice JSON has all expected fields', () => {
    const fakeInvoiceObj = {
      toJSON: () => ({ ...FAKE_INVOICE }),
    };
    const useCase = new GetInvoice(makeFakeRepo({ findById: () => fakeInvoiceObj }));
    const result = useCase.execute('12345');
    const inv = result.data.invoice;

    expect(inv).toHaveProperty('id');
    expect(inv).toHaveProperty('date');
    expect(inv).toHaveProperty('time');
    expect(inv).toHaveProperty('location');
    expect(inv).toHaveProperty('invoiceNumber');
    expect(inv).toHaveProperty('customerNit');
    expect(inv).toHaveProperty('customerName');
    expect(inv).toHaveProperty('email');
    expect(inv).toHaveProperty('amount');
    expect(inv).toHaveProperty('cuf');
    expect(inv).toHaveProperty('customerId');
    expect(inv).toHaveProperty('cashRegister');
  });

  it('calls repo.findById with the provided invoiceId', () => {
    const calledWith = [];
    const fakeInvoiceObj = { toJSON: () => ({ ...FAKE_INVOICE }) };
    const repo = makeFakeRepo({
      findById: (id) => {
        calledWith.push(id);
        return fakeInvoiceObj;
      },
    });
    new GetInvoice(repo).execute('12345');
    expect(calledWith).toContain('12345');
  });
});
