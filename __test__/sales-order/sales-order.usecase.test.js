/**
 * Tests for sales-order use cases.
 * Imports from the compiled AMD output via the SuiteScripts moduleNameMapper alias.
 */
const {
  GetSalesOrdersByCustomerDocument,
} = require('SuiteScripts/multicard-api/features/sales-order/usecase/get-sales-orders-by-customer-document.usecase');
const {
  GetSalesOrderSummary,
} = require('SuiteScripts/multicard-api/features/sales-order/usecase/get-sales-order-summary.usecase');

describe('GetSalesOrdersByCustomerDocument', () => {
  const fakeSalesOrderRepo = {
    findByCriteria: jest.fn().mockReturnValue([]),
    findById: jest.fn().mockReturnValue(null),
  };
  const fakeCustomerRepo = {
    findByDocumentNumber: jest.fn().mockReturnValue(null),
  };
  const fakeMulticardFilter = {
    findSalesOrderIdsByCustomer: jest.fn().mockReturnValue([]),
  };

  beforeEach(() => {
    fakeSalesOrderRepo.findByCriteria.mockClear();
    fakeCustomerRepo.findByDocumentNumber.mockClear();
    fakeMulticardFilter.findSalesOrderIdsByCustomer.mockClear();
  });

  it('returns failure when documentNumber is empty', () => {
    const usecase = new GetSalesOrdersByCustomerDocument(
      fakeSalesOrderRepo,
      fakeCustomerRepo,
      fakeMulticardFilter,
    );
    const result = usecase.execute({ documentNumber: '' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/documentNumber es requerido/);
  });

  it('returns failure when documentNumber is whitespace', () => {
    const usecase = new GetSalesOrdersByCustomerDocument(
      fakeSalesOrderRepo,
      fakeCustomerRepo,
      fakeMulticardFilter,
    );
    const result = usecase.execute({ documentNumber: '   ' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/documentNumber es requerido/);
  });

  it('returns empty array when customer is not found', () => {
    fakeCustomerRepo.findByDocumentNumber.mockReturnValue(null);
    const usecase = new GetSalesOrdersByCustomerDocument(
      fakeSalesOrderRepo,
      fakeCustomerRepo,
      fakeMulticardFilter,
    );
    const result = usecase.execute({ documentNumber: '99999' });
    expect(result.success).toBe(true);
    expect(result.data.salesOrders).toEqual([]);
    expect(result.data.page).toBe(0);
    expect(fakeMulticardFilter.findSalesOrderIdsByCustomer).not.toHaveBeenCalled();
  });

  it('returns empty array when customer has no Multicard purchases', () => {
    fakeCustomerRepo.findByDocumentNumber.mockReturnValue({ id: '500' });
    fakeMulticardFilter.findSalesOrderIdsByCustomer.mockReturnValue([]);
    const usecase = new GetSalesOrdersByCustomerDocument(
      fakeSalesOrderRepo,
      fakeCustomerRepo,
      fakeMulticardFilter,
    );
    const result = usecase.execute({ documentNumber: '1234567' });
    expect(result.success).toBe(true);
    expect(result.data.salesOrders).toEqual([]);
    expect(fakeMulticardFilter.findSalesOrderIdsByCustomer).toHaveBeenCalledWith('500');
  });

  it('clamps negative pages to 0', () => {
    fakeCustomerRepo.findByDocumentNumber.mockReturnValue({ id: '500' });
    fakeMulticardFilter.findSalesOrderIdsByCustomer.mockReturnValue(['100']);
    const usecase = new GetSalesOrdersByCustomerDocument(
      fakeSalesOrderRepo,
      fakeCustomerRepo,
      fakeMulticardFilter,
    );
    usecase.execute({ documentNumber: '1234567', page: -5 });
    expect(fakeSalesOrderRepo.findByCriteria).toHaveBeenCalledWith(
      expect.objectContaining({ documentNumber: '1234567', page: 0 }),
      ['100'],
    );
  });

  it('forwards multicard soIds to findByCriteria without complemento', () => {
    fakeCustomerRepo.findByDocumentNumber.mockReturnValue({ id: '500', complemento: '1' });
    fakeMulticardFilter.findSalesOrderIdsByCustomer.mockReturnValue(['100', '101']);
    const usecase = new GetSalesOrdersByCustomerDocument(
      fakeSalesOrderRepo,
      fakeCustomerRepo,
      fakeMulticardFilter,
    );
    usecase.execute({ documentNumber: '1234567', complemento: '1' });
    // El complemento se valida contra el customer, no se pasa a findByCriteria
    expect(fakeSalesOrderRepo.findByCriteria).toHaveBeenCalledWith(
      { documentNumber: '1234567', page: 0 },
      ['100', '101'],
    );
  });

  it('returns empty array when complemento does not match customer', () => {
    fakeCustomerRepo.findByDocumentNumber.mockReturnValue({ id: '500', complemento: '01' });
    const usecase = new GetSalesOrdersByCustomerDocument(
      fakeSalesOrderRepo,
      fakeCustomerRepo,
      fakeMulticardFilter,
    );
    const result = usecase.execute({ documentNumber: '1234567', complemento: '1' });
    expect(result.success).toBe(true);
    expect(result.data.salesOrders).toEqual([]);
    expect(fakeMulticardFilter.findSalesOrderIdsByCustomer).not.toHaveBeenCalled();
    expect(fakeSalesOrderRepo.findByCriteria).not.toHaveBeenCalled();
  });

  it('skips complemento validation when input complemento is empty', () => {
    fakeCustomerRepo.findByDocumentNumber.mockReturnValue({ id: '500', complemento: '01' });
    fakeMulticardFilter.findSalesOrderIdsByCustomer.mockReturnValue(['100']);
    const usecase = new GetSalesOrdersByCustomerDocument(
      fakeSalesOrderRepo,
      fakeCustomerRepo,
      fakeMulticardFilter,
    );
    const result = usecase.execute({ documentNumber: '1234567' });
    expect(result.data.salesOrders).toEqual([]);
    expect(fakeMulticardFilter.findSalesOrderIdsByCustomer).toHaveBeenCalled();
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
    findSalesOrderIdsByIds: jest.fn().mockReturnValue([]),
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
      toJSON: () => ({
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
      }),
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
