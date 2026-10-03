/**
 * Tests for sales-order use cases.
 * Imports from the compiled AMD output via the SuiteScripts moduleNameMapper alias.
 */
const { Customer } = require('SuiteScripts/multicard-api/features/customer/domain/customer.domain');
const {
  GetSalesOrdersByCustomerDocument,
} = require('SuiteScripts/multicard-api/features/sales-order/usecase/get-sales-orders-by-customer-document.usecase');
const {
  GetSalesOrderSummary,
} = require('SuiteScripts/multicard-api/features/sales-order/usecase/get-sales-order-summary.usecase');

describe('GetSalesOrdersByCustomerDocument', () => {
  const makeDomainCustomer = (overrides = {}) =>
    new Customer({
      id: '500',
      documentNumber: '1234567',
      firstName: 'Juan',
      secondName: '',
      firstLastName: 'Perez',
      secondLastName: '',
      email: '',
      mobilePhone: '71234567',
      subsidiary: 1,
      type: 'Titular',
      mcStatus: 'Aprobado',
      cardStatus: '1',
      contractSigned: true,
      insuranceSigned: true,
      creditLimit: 0,
      balance: 0,
      availableBalance: 0,
      paymentDay: 5,
      ...overrides,
    });

  const fakeSalesOrderRepo = {
    findByCriteria: jest.fn().mockReturnValue([]),
    findById: jest.fn().mockReturnValue(null),
  };
  const fakeCustomerRepo = {
    findByDocumentNumber: jest.fn().mockReturnValue(null),
  };
  const fakeInstallmentRepo = {
    hasMora: jest.fn().mockReturnValue(false),
    save: jest.fn().mockReturnValue('1'),
    delete: jest.fn(),
    findInvoiceIdsByCustomer: jest.fn().mockReturnValue([]),
    findInstallmentsByInvoiceId: jest.fn().mockReturnValue([]),
    findFinancedAmountByInvoiceId: jest.fn().mockReturnValue(0),
  };
  const fakeInvoiceRepo = {
    findById: jest.fn().mockReturnValue(null),
    findBySalesOrderId: jest.fn().mockReturnValue(null),
    findSalesOrderMapByIds: jest.fn().mockReturnValue(new Map()),
  };

  const buildUseCase = () =>
    new GetSalesOrdersByCustomerDocument(
      fakeSalesOrderRepo,
      fakeCustomerRepo,
      fakeInstallmentRepo,
      fakeInvoiceRepo,
    );

  // Configura la cadena cuota -> factura -> OV: soId -> { invoiceId, financedAmount }
  const givenMulticardPurchases = (entries) => {
    const map = new Map();
    for (const [soId, details] of entries) map.set(soId, details);
    fakeInstallmentRepo.findInvoiceIdsByCustomer.mockReturnValue(
      entries.map(([, details]) => details.invoiceId),
    );
    fakeInvoiceRepo.findSalesOrderMapByIds.mockReturnValue(map);
  };

  beforeEach(() => {
    fakeSalesOrderRepo.findByCriteria.mockReset().mockReturnValue([]);
    fakeCustomerRepo.findByDocumentNumber.mockReset().mockReturnValue(null);
    fakeInstallmentRepo.findInvoiceIdsByCustomer.mockReset().mockReturnValue([]);
    fakeInstallmentRepo.findFinancedAmountByInvoiceId.mockReset().mockReturnValue(0);
    fakeInvoiceRepo.findSalesOrderMapByIds.mockReset().mockReturnValue(new Map());
  });

  it('returns failure when documentNumber is empty', () => {
    const result = buildUseCase().execute({ documentNumber: '' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/documentNumber es requerido/);
  });

  it('returns failure when documentNumber is whitespace', () => {
    const result = buildUseCase().execute({ documentNumber: '   ' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/documentNumber es requerido/);
  });

  it('returns empty array when customer is not found', () => {
    fakeCustomerRepo.findByDocumentNumber.mockReturnValue(null);
    const result = buildUseCase().execute({ documentNumber: '99999' });
    expect(result.success).toBe(true);
    expect(result.data.salesOrders).toEqual([]);
    expect(result.data.page).toBe(0);
    expect(result.data.hasNextPage).toBe(false);
    expect(fakeInstallmentRepo.findInvoiceIdsByCustomer).not.toHaveBeenCalled();
  });

  it('returns empty array when customer has no Multicard purchases', () => {
    fakeCustomerRepo.findByDocumentNumber.mockReturnValue(makeDomainCustomer());
    // Without a soIds filter the repository would return other customers' sales orders.
    fakeSalesOrderRepo.findByCriteria.mockReturnValue([{ id: '999', tranId: 'SO-OTHER' }]);
    const result = buildUseCase().execute({ documentNumber: '1234567' });
    expect(result.success).toBe(true);
    expect(result.data.salesOrders).toEqual([]);
    expect(result.data.hasNextPage).toBe(false);
    expect(fakeInstallmentRepo.findInvoiceIdsByCustomer).toHaveBeenCalledWith('500');
    expect(fakeSalesOrderRepo.findByCriteria).not.toHaveBeenCalled();
  });

  it('does not query invoices when the customer has no invoice ids', () => {
    fakeCustomerRepo.findByDocumentNumber.mockReturnValue(makeDomainCustomer());
    fakeInstallmentRepo.findInvoiceIdsByCustomer.mockReturnValue([]);
    buildUseCase().execute({ documentNumber: '1234567' });
    expect(fakeInvoiceRepo.findSalesOrderMapByIds).not.toHaveBeenCalled();
  });

  it('clamps negative pages to 0', () => {
    fakeCustomerRepo.findByDocumentNumber.mockReturnValue(makeDomainCustomer());
    givenMulticardPurchases([['100', { invoiceId: 'I1', financedAmount: 1500 }]]);
    buildUseCase().execute({ documentNumber: '1234567', page: -5 });
    expect(fakeSalesOrderRepo.findByCriteria).toHaveBeenCalledWith(
      expect.objectContaining({ documentNumber: '1234567', page: 0 }),
      ['100'],
    );
  });

  it('forwards multicard soIds to findByCriteria without complemento', () => {
    fakeCustomerRepo.findByDocumentNumber.mockReturnValue(makeDomainCustomer({ complemento: '1' }));
    givenMulticardPurchases([
      ['100', { invoiceId: 'I1', financedAmount: 1500 }],
      ['101', { invoiceId: 'I2', financedAmount: 2000 }],
    ]);
    buildUseCase().execute({ documentNumber: '1234567', complemento: '1' });
    // El complemento se valida contra el customer, no se pasa a findByCriteria
    expect(fakeInvoiceRepo.findSalesOrderMapByIds).toHaveBeenCalledWith(['I1', 'I2']);
    expect(fakeSalesOrderRepo.findByCriteria).toHaveBeenCalledWith(
      { documentNumber: '1234567', page: 0, pageSize: 10, limit: 11 },
      ['100', '101'],
    );
  });

  it('injects the invoice financedAmount into each sales order', () => {
    fakeCustomerRepo.findByDocumentNumber.mockReturnValue(makeDomainCustomer());
    givenMulticardPurchases([['100', { invoiceId: 'I1', financedAmount: 1500 }]]);
    fakeSalesOrderRepo.findByCriteria.mockReturnValue([{ id: '100', financedAmount: 0 }]);
    const result = buildUseCase().execute({ documentNumber: '1234567' });
    expect(result.data.salesOrders).toEqual([{ id: '100', financedAmount: 1500 }]);
    expect(fakeInstallmentRepo.findFinancedAmountByInvoiceId).not.toHaveBeenCalled();
  });

  it('uses the installment fallback amount when the invoice financedAmount is 0', () => {
    fakeCustomerRepo.findByDocumentNumber.mockReturnValue(makeDomainCustomer());
    givenMulticardPurchases([['100', { invoiceId: 'I1', financedAmount: 0 }]]);
    fakeInstallmentRepo.findFinancedAmountByInvoiceId.mockReturnValue(750);
    fakeSalesOrderRepo.findByCriteria.mockReturnValue([{ id: '100', financedAmount: 0 }]);
    const result = buildUseCase().execute({ documentNumber: '1234567' });
    expect(fakeInstallmentRepo.findFinancedAmountByInvoiceId).toHaveBeenCalledWith('I1');
    expect(result.data.salesOrders).toEqual([{ id: '100', financedAmount: 750 }]);
  });

  it('returns failure when findInvoiceIdsByCustomer throws', () => {
    fakeCustomerRepo.findByDocumentNumber.mockReturnValue(makeDomainCustomer());
    fakeInstallmentRepo.findInvoiceIdsByCustomer.mockImplementation(() => {
      throw new Error('boom');
    });
    const result = buildUseCase().execute({ documentNumber: '1234567' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No se pudieron consultar las compras Multicard/);
    expect(fakeSalesOrderRepo.findByCriteria).not.toHaveBeenCalled();
  });

  it('returns failure when findSalesOrderMapByIds throws', () => {
    fakeCustomerRepo.findByDocumentNumber.mockReturnValue(makeDomainCustomer());
    fakeInstallmentRepo.findInvoiceIdsByCustomer.mockReturnValue(['I1']);
    fakeInvoiceRepo.findSalesOrderMapByIds.mockImplementation(() => {
      throw new Error('boom');
    });
    const result = buildUseCase().execute({ documentNumber: '1234567' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No se pudieron consultar las compras Multicard/);
  });

  it('returns empty array when complemento does not match customer', () => {
    fakeCustomerRepo.findByDocumentNumber.mockReturnValue(makeDomainCustomer({ complemento: '01' }));
    const result = buildUseCase().execute({ documentNumber: '1234567', complemento: '1' });
    expect(result.success).toBe(true);
    expect(result.data.salesOrders).toEqual([]);
    expect(result.data.hasNextPage).toBe(false);
    expect(fakeInstallmentRepo.findInvoiceIdsByCustomer).not.toHaveBeenCalled();
    expect(fakeSalesOrderRepo.findByCriteria).not.toHaveBeenCalled();
  });

  it('skips complemento validation when input complemento is empty', () => {
    fakeCustomerRepo.findByDocumentNumber.mockReturnValue(makeDomainCustomer({ complemento: '01' }));
    givenMulticardPurchases([['100', { invoiceId: 'I1', financedAmount: 1500 }]]);
    const result = buildUseCase().execute({ documentNumber: '1234567' });
    expect(result.data.salesOrders).toEqual([]);
    expect(fakeInstallmentRepo.findInvoiceIdsByCustomer).toHaveBeenCalled();
  });

  it('uses default pageSize of 10 if none provided', () => {
    fakeCustomerRepo.findByDocumentNumber.mockReturnValue(makeDomainCustomer());
    givenMulticardPurchases([['100', { invoiceId: 'I1', financedAmount: 1500 }]]);
    buildUseCase().execute({ documentNumber: '1234567' });
    expect(fakeSalesOrderRepo.findByCriteria).toHaveBeenCalledWith(
      { documentNumber: '1234567', page: 0, pageSize: 10, limit: 11 },
      ['100'],
    );
  });

  it('allows custom pageSize', () => {
    fakeCustomerRepo.findByDocumentNumber.mockReturnValue(makeDomainCustomer());
    givenMulticardPurchases([['100', { invoiceId: 'I1', financedAmount: 1500 }]]);
    buildUseCase().execute({ documentNumber: '1234567', pageSize: 25 });
    expect(fakeSalesOrderRepo.findByCriteria).toHaveBeenCalledWith(
      { documentNumber: '1234567', page: 0, pageSize: 25, limit: 26 },
      ['100'],
    );
  });

  it('asks the repository for pageSize + 1 rows (look-ahead)', () => {
    fakeCustomerRepo.findByDocumentNumber.mockReturnValue(makeDomainCustomer());
    givenMulticardPurchases([['100', { invoiceId: 'I1', financedAmount: 1500 }]]);
    buildUseCase().execute({ documentNumber: '1234567', page: 2, pageSize: 5 });
    expect(fakeSalesOrderRepo.findByCriteria).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, pageSize: 5, limit: 6 }),
      ['100'],
    );
  });

  it('returns hasNextPage true and only pageSize items when the repo returns pageSize + 1 rows', () => {
    fakeCustomerRepo.findByDocumentNumber.mockReturnValue(makeDomainCustomer());
    givenMulticardPurchases([['100', { invoiceId: 'I1', financedAmount: 1500 }]]);
    fakeSalesOrderRepo.findByCriteria.mockReturnValue([
      { id: '100', financedAmount: 0 },
      { id: '101', financedAmount: 0 },
      { id: '102', financedAmount: 0 },
    ]);
    const result = buildUseCase().execute({ documentNumber: '1234567', pageSize: 2 });
    expect(result.data.hasNextPage).toBe(true);
    expect(result.data.salesOrders.map((so) => so.id)).toEqual(['100', '101']);
  });

  it('returns hasNextPage false when the repo returns pageSize rows or fewer', () => {
    fakeCustomerRepo.findByDocumentNumber.mockReturnValue(makeDomainCustomer());
    givenMulticardPurchases([['100', { invoiceId: 'I1', financedAmount: 1500 }]]);
    fakeSalesOrderRepo.findByCriteria.mockReturnValue([
      { id: '100', financedAmount: 0 },
      { id: '101', financedAmount: 0 },
    ]);
    const result = buildUseCase().execute({ documentNumber: '1234567', pageSize: 2 });
    expect(result.data.hasNextPage).toBe(false);
    expect(result.data.salesOrders).toHaveLength(2);
  });
});

describe('GetSalesOrderSummary', () => {
  const fakeSalesOrderRepo = {
    findByCriteria: jest.fn().mockReturnValue([]),
    findById: jest.fn().mockReturnValue(null),
  };
  const fakeInvoiceRepo = {
    findById: jest.fn().mockReturnValue(null),
    findBySalesOrderId: jest.fn().mockReturnValue(null),
  };
  const fakeCustomerRepo = {
    findById: jest.fn().mockReturnValue(null),
  };
  const fakeInstallmentRepo = {
    hasMora: jest.fn().mockReturnValue(false),
    save: jest.fn().mockReturnValue('1'),
    delete: jest.fn(),
    findInvoiceIdsByCustomer: jest.fn().mockReturnValue([]),
    findInstallmentsByInvoiceId: jest.fn().mockReturnValue([]),
  };

  beforeEach(() => {
    fakeSalesOrderRepo.findById.mockClear();
    fakeInvoiceRepo.findBySalesOrderId.mockClear();
    fakeCustomerRepo.findById.mockClear();
    fakeInstallmentRepo.findInstallmentsByInvoiceId.mockClear();
  });

  it('returns failure when salesOrderId is empty', () => {
    const usecase = new GetSalesOrderSummary(
      fakeSalesOrderRepo,
      fakeInvoiceRepo,
      fakeCustomerRepo,
      fakeInstallmentRepo,
    );
    const result = usecase.execute('');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/salesOrderId es requerido/);
  });

  it('returns failure when the SO is not found', () => {
    fakeSalesOrderRepo.findById.mockReturnValue(null);
    const usecase = new GetSalesOrderSummary(
      fakeSalesOrderRepo,
      fakeInvoiceRepo,
      fakeCustomerRepo,
      fakeInstallmentRepo,
    );
    const result = usecase.execute('99999');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No se encontró la orden de venta/);
  });

  it('returns failure when the invoice is not found', () => {
    fakeSalesOrderRepo.findById.mockReturnValue({ id: '100' });
    fakeInvoiceRepo.findBySalesOrderId.mockReturnValue(null);
    const usecase = new GetSalesOrderSummary(
      fakeSalesOrderRepo,
      fakeInvoiceRepo,
      fakeCustomerRepo,
      fakeInstallmentRepo,
    );
    const result = usecase.execute('100');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No se encontró la factura/);
  });

  it('returns failure when the customer is not found', () => {
    fakeSalesOrderRepo.findById.mockReturnValue({ id: '100' });
    fakeInvoiceRepo.findBySalesOrderId.mockReturnValue({ id: '200', customerId: '500' });
    fakeCustomerRepo.findById.mockReturnValue(null);
    const usecase = new GetSalesOrderSummary(
      fakeSalesOrderRepo,
      fakeInvoiceRepo,
      fakeCustomerRepo,
      fakeInstallmentRepo,
    );
    const result = usecase.execute('100');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Cliente asociado a la OV no encontrado/);
  });

  it('returns success with full legacy response shape when all exist', () => {
    fakeSalesOrderRepo.findById.mockReturnValue({ id: '100' });
    fakeInvoiceRepo.findBySalesOrderId.mockReturnValue({
      id: '200',
      date: '2026-01-15',
      location: 'Sucursal Principal',
      invoiceNumber: 'F-001',
      customerNit: '1234567',
      customerName: 'Juan Perez',
      email: 'juan@example.com',
      amount: 1500,
      cuf: 'CUF-123',
      customerId: '500',
      cashRegister: 0,
    });
    fakeCustomerRepo.findById.mockReturnValue({
      toDetailJSON: () => ({
        id: '500',
        documentNumber: '1234567',
        typeDocument: 'CI',
        name: 'Juan Perez',
        email: 'juan@example.com',
        mobilePhone: '70123456',
        type: '1',
        creditLimit: 5000,
        balance: 1000,
        paymentDay: 15,
        contractNumber: 'C-001',
      }),
    });
    fakeInstallmentRepo.findInstallmentsByInvoiceId.mockReturnValue([
      { id: 'i1', nro: 1, paymentDate: '2026-02-15', total: 500 },
      { id: 'i2', nro: 2, paymentDate: '2026-03-15', total: 500 },
    ]);

    const usecase = new GetSalesOrderSummary(
      fakeSalesOrderRepo,
      fakeInvoiceRepo,
      fakeCustomerRepo,
      fakeInstallmentRepo,
    );
    const result = usecase.execute('100');

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      salesOrderID: '100',
      invoice: {
        id: '200',
        date: '2026-01-15',
        location: 'Sucursal Principal',
        invoiceNumber: 'F-001',
        customerNit: '1234567',
        customerName: 'Juan Perez',
        email: 'juan@example.com',
        amount: 1500,
        cuf: 'CUF-123',
        customerId: '500',
        cashRegister: 0,
      },
      customer: {
        id: '500',
        documentNumber: '1234567',
        typeDocument: 'CI',
        name: 'Juan Perez',
        email: 'juan@example.com',
        phone: '70123456',
        type: '1',
        creditLimit: 5000,
        balance: 1000,
        paymentDay: '15',
        contractNumber: 'C-001',
      },
      installments: [
        { id: 'i1', nro: 1, paymentDate: '2026-02-15', total: 500 },
        { id: 'i2', nro: 2, paymentDate: '2026-03-15', total: 500 },
      ],
    });
  });
});
