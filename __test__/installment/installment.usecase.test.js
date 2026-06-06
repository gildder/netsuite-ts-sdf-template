/**
 * Use-case unit tests for GenerateInstallments.
 * Uses a literal fake IInstallmentRepository — no Jest mocks, no N/* imports.
 * Tests run against compiled JS in src/FileCabinet via the SuiteScripts alias.
 * Run: pnpm build && pnpm test
 */
import { GenerateInstallments } from 'SuiteScripts/multicard-api/features/installment/usecase/installment.usecase';

// ---------------------------------------------------------------------------
// Fake repository builder
// ---------------------------------------------------------------------------

/**
 * Creates a fake IInstallmentRepository.
 * @param {Object} overrides - method overrides { hasMora, save, delete }
 */
function makeFakeRepo(overrides = {}) {
  let callCount = 0;
  return {
    hasMora: (_customerId) => false,
    save: (_installment) => {
      callCount++;
      return `id-${callCount}`;
    },
    delete: (_id) => {
      // no-op by default
    },
    ...overrides,
    // expose for assertions
    _getCallCount: () => callCount,
  };
}

// ---------------------------------------------------------------------------
// Valid base input
// ---------------------------------------------------------------------------
const VALID_INPUT = {
  customerId: 'C001',
  invoiceId: 'INV001',
  amount: 1000,
  customerType: '1', // NORMAL
  nroInstallment: 3,
  paymentDay: 10,
};

// ---------------------------------------------------------------------------
// REQ-01: Input validation
// ---------------------------------------------------------------------------
describe('GenerateInstallments — validation (REQ-01)', () => {
  let useCase;

  beforeEach(() => {
    useCase = new GenerateInstallments(makeFakeRepo());
  });

  it('fails when amount is 0', () => {
    const result = useCase.execute({ ...VALID_INPUT, amount: 0 });
    expect(result.success).toBe(false);
    expect(result.message).toBeTruthy();
  });

  it('fails when amount is negative', () => {
    const result = useCase.execute({ ...VALID_INPUT, amount: -50 });
    expect(result.success).toBe(false);
  });

  it('fails when nroInstallment is 0', () => {
    const result = useCase.execute({ ...VALID_INPUT, nroInstallment: 0 });
    expect(result.success).toBe(false);
  });

  it('fails when nroInstallment is negative', () => {
    const result = useCase.execute({ ...VALID_INPUT, nroInstallment: -1 });
    expect(result.success).toBe(false);
  });

  it('fails when customerId is missing', () => {
    const result = useCase.execute({ ...VALID_INPUT, customerId: '' });
    expect(result.success).toBe(false);
  });

  it('fails when invoiceId is missing', () => {
    const result = useCase.execute({ ...VALID_INPUT, invoiceId: '' });
    expect(result.success).toBe(false);
  });

  it('fails when customerType is invalid', () => {
    const result = useCase.execute({ ...VALID_INPUT, customerType: '9' });
    expect(result.success).toBe(false);
  });

  it('fails when paymentDay is out of range (< 1 or > 31)', () => {
    expect(useCase.execute({ ...VALID_INPUT, paymentDay: 0 }).success).toBe(false);
    expect(useCase.execute({ ...VALID_INPUT, paymentDay: 32 }).success).toBe(false);
  });

  it('does NOT call repo.save on validation failure', () => {
    const saveCalls = [];
    const repo = makeFakeRepo({
      save: (inst) => {
        saveCalls.push(inst);
        return 'id-x';
      },
    });
    useCase = new GenerateInstallments(repo);
    useCase.execute({ ...VALID_INPUT, amount: 0 });
    expect(saveCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// REQ-02/REQ-03: Happy path — all saves succeed
// ---------------------------------------------------------------------------
describe('GenerateInstallments — happy path (REQ-02/REQ-06)', () => {
  it('returns success with 3 InstallmentResult entries for NORMAL type', () => {
    const repo = makeFakeRepo();
    const useCase = new GenerateInstallments(repo);
    const result = useCase.execute(VALID_INPUT);

    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data).toHaveLength(3);
  });

  it('each result entry has id, nro, paymentDate string, and total number > 0', () => {
    const useCase = new GenerateInstallments(makeFakeRepo());
    const result = useCase.execute(VALID_INPUT);

    result.data.forEach((entry, idx) => {
      expect(typeof entry.id).toBe('string');
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.nro).toBe(idx + 1);
      expect(typeof entry.paymentDate).toBe('string');
      expect(entry.total).toBeGreaterThan(0);
    });
  });

  it('total is rounded to 2 decimal places in the result', () => {
    const useCase = new GenerateInstallments(makeFakeRepo());
    const result = useCase.execute(VALID_INPUT);
    result.data.forEach((entry) => {
      // Check it's a number with at most 2 decimal places
      const asString = entry.total.toString();
      const decimalPart = asString.includes('.') ? asString.split('.')[1] : '';
      expect(decimalPart.length).toBeLessThanOrEqual(2);
    });
  });

  it('returns success for EMPLOYEE type (customerType=2) with 4 installments', () => {
    const useCase = new GenerateInstallments(makeFakeRepo());
    const result = useCase.execute({
      ...VALID_INPUT,
      customerType: '2',
      nroInstallment: 4,
    });
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(4);
  });

  it('returns success for CORPORATE type (customerType=3)', () => {
    const useCase = new GenerateInstallments(makeFakeRepo());
    const result = useCase.execute({ ...VALID_INPUT, customerType: '3' });
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(3);
  });

  it('save is called once per installment', () => {
    const saveCalls = [];
    const repo = makeFakeRepo({
      save: (inst) => {
        saveCalls.push(inst);
        return `id-${saveCalls.length}`;
      },
    });
    const useCase = new GenerateInstallments(repo);
    useCase.execute(VALID_INPUT);
    expect(saveCalls).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// REQ-06/REQ-08: Compensation — save throws mid-loop
// ---------------------------------------------------------------------------
describe('GenerateInstallments — saga compensation (REQ-06/REQ-08)', () => {
  it('save throws on row 2 → deletes row 1 id → returns failure', () => {
    const deletedIds = [];
    let saveCall = 0;

    const repo = makeFakeRepo({
      save: (_inst) => {
        saveCall++;
        if (saveCall === 2) throw new Error('DB error on row 2');
        return `id-${saveCall}`;
      },
      delete: (id) => {
        deletedIds.push(id);
      },
    });

    const useCase = new GenerateInstallments(repo);
    const result = useCase.execute(VALID_INPUT);

    expect(result.success).toBe(false);
    expect(deletedIds).toContain('id-1');
    expect(deletedIds).toHaveLength(1); // only 1 row was created before the throw
  });

  it('save throws on first row → no delete called → failure', () => {
    const deletedIds = [];

    const repo = makeFakeRepo({
      save: (_inst) => {
        throw new Error('DB error on row 1');
      },
      delete: (id) => {
        deletedIds.push(id);
      },
    });

    const useCase = new GenerateInstallments(repo);
    const result = useCase.execute(VALID_INPUT);

    expect(result.success).toBe(false);
    expect(deletedIds).toHaveLength(0);
  });

  it('save throws on row 3 of 3 → deletes rows 1 and 2 → failure', () => {
    const deletedIds = [];
    let saveCall = 0;

    const repo = makeFakeRepo({
      save: (_inst) => {
        saveCall++;
        if (saveCall === 3) throw new Error('DB error on row 3');
        return `id-${saveCall}`;
      },
      delete: (id) => {
        deletedIds.push(id);
      },
    });

    const useCase = new GenerateInstallments(repo);
    const result = useCase.execute(VALID_INPUT);

    expect(result.success).toBe(false);
    expect(deletedIds).toContain('id-1');
    expect(deletedIds).toContain('id-2');
    expect(deletedIds).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// REQ-06: Compensation when delete itself throws
// ---------------------------------------------------------------------------
describe('GenerateInstallments — compensation delete throws (REQ-06)', () => {
  it('delete throws during compensation → no exception escapes execute → still failure', () => {
    let saveCall = 0;
    const deleteAttempts = [];

    const repo = makeFakeRepo({
      save: (_inst) => {
        saveCall++;
        if (saveCall === 2) throw new Error('save error');
        return `id-${saveCall}`;
      },
      delete: (id) => {
        deleteAttempts.push(id);
        throw new Error(`delete error for ${id}`);
      },
    });

    const useCase = new GenerateInstallments(repo);

    // Must NOT throw
    let result;
    expect(() => {
      result = useCase.execute(VALID_INPUT);
    }).not.toThrow();

    expect(result.success).toBe(false);
    // delete was attempted for the one created id even though it threw
    expect(deleteAttempts).toHaveLength(1);
    expect(deleteAttempts[0]).toBe('id-1');
  });
});
