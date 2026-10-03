/**
 * Tests for the shared ApiResponse helpers.
 * Imports from the compiled AMD output via the SuiteScripts moduleNameMapper alias.
 */
const { success, failure } = require('SuiteScripts/multicard-api/shared/response');

describe('success', () => {
  it('returns data with an empty message by default', () => {
    expect(success({ id: '1' })).toEqual({
      success: true,
      data: { id: '1' },
      message: '',
      error: null,
    });
  });

  it('returns the given message alongside the data', () => {
    expect(success({ customer: null }, 'No se encontró el cliente')).toEqual({
      success: true,
      data: { customer: null },
      message: 'No se encontró el cliente',
      error: null,
    });
  });
});

describe('failure', () => {
  it('returns the message as both message and error, with no data', () => {
    expect(failure('documentNumber es requerido.')).toEqual({
      success: false,
      data: null,
      message: 'documentNumber es requerido.',
      error: 'documentNumber es requerido.',
    });
  });
});
