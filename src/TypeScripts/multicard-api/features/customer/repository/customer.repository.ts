/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Capa de infraestructura — adaptador de persistencia NetSuite.
 * ÚNICO archivo del feature con imports de N/*. Implementa el puerto
 * ICustomerRepository declarado en customer.usecase.ts.
 * Los identificadores de NetSuite del feature viven acá (RECORD + FIELDS).
 */
import * as log from 'N/log';
import * as record from 'N/record';
import * as search from 'N/search';
import { APPROVED_STATUS_NAME, Customer } from '../domain/customer.domain';
import type { ICustomerRepository } from '../usecase/ports/customer.repository.port';

// --- Identificadores NetSuite (customer) ---
const RECORD_CUSTOMER = 'customer';
const SUBSIDIARY_ID = 6;

const FIELDS = {
  INTERNAL_ID: 'internalid',
  IS_INACTIVE: 'isinactive',
  DOCUMENT_NUMBER: 'custentity_sdb_numero_documento',
  TYPE_DOCUMENT: 'custentity_sdb_tipo_documento',
  FIRST_NAME: 'custentity_sdb_primer_nombre',
  SECOND_NAME: 'custentity_sdb_segundo_nombre',
  FIRST_LAST_NAME: 'custentity_sdb_primer_apellido',
  SECOND_LAST_NAME: 'custentity_sdb_segundo_apellido',
  EMAIL: 'email',
  MOBILE_PHONE: 'mobilephone',
  SUBSIDIARY: 'subsidiary',
  MC_STATUS: 'custentity_sdb_mc_estado',
  CARD_STATUS: 'custentity_sdb_siscred_estadotarj',
  CUSTOMER_TYPE: 'custentity_sdb_siscred_tipocli',
  CONTRACT_SIGNED: 'custentity_sdb_contrato_is_firmado_mc',
  INSURANCE_SIGNED: 'custentity_sdb_seguro_is_firmado_mc',
  PAYMENT_DAY: 'custentity_sdb_siscred_cli_fechapago',
  CONTRACT_NUMBER: 'custentity_sdb_nro_contrato',
  CREDIT_GRANTED: 'custentity_sdb_mc_credito_otorgado',
  CREDIT_LIMIT: 'creditlimit',
  BALANCE: 'balance',
  COMPLEMENTO: 'custentity_sdb_pos_mc_complemento',
  DATE_FIRST_SALE_MULTICARD: 'custentity_mc_date_first_sale_multicard',
} as const;

// --- Helpers de mapeo ---
const formatPhoneNumber = (phone: string): string => {
  if (!phone) return '';
  const cleaned = phone.replace(/[\s()-]/g, '');
  return cleaned.startsWith('+') ? cleaned.replace(/^\+\d{3}/, '') : cleaned;
};

const toBoolean = (raw: unknown): boolean => raw === true || raw === 'T' || raw === 'true';

const toNumber = (raw: unknown): number => {
  const n = Number.parseFloat(raw as string);
  return Number.isFinite(n) ? n : 0;
};

const computeAvailableBalance = (creditLimit: number, balance: number): number => {
  if (creditLimit < 0) return 0;
  return (Math.round(creditLimit * 100) - Math.round(balance * 100)) / 100;
};

// Único mapper NetSuite → dominio. Campos no traídos por una query dada
// caen a sus defaults sin romper nada.
const toCustomer = (r: search.Result): Customer => {
  const creditLimit = toNumber(r.getValue(FIELDS.CREDIT_LIMIT));
  const balance = toNumber(r.getValue(FIELDS.BALANCE));
  return new Customer({
    id: r.getValue(FIELDS.INTERNAL_ID) as string,
    documentNumber: (r.getValue(FIELDS.DOCUMENT_NUMBER) as string) ?? '',
    typeDocument: (r.getValue(FIELDS.TYPE_DOCUMENT) as string) ?? '',
    firstName: (r.getValue(FIELDS.FIRST_NAME) as string) ?? '',
    secondName: (r.getValue(FIELDS.SECOND_NAME) as string) ?? '',
    firstLastName: (r.getValue(FIELDS.FIRST_LAST_NAME) as string) ?? '',
    secondLastName: (r.getValue(FIELDS.SECOND_LAST_NAME) as string) ?? '',
    email: (r.getValue(FIELDS.EMAIL) as string) ?? '',
    mobilePhone: formatPhoneNumber(r.getValue(FIELDS.MOBILE_PHONE) as string),
    subsidiary: toNumber(r.getValue(FIELDS.SUBSIDIARY)),
    type: r.getText(FIELDS.CUSTOMER_TYPE) as string,
    mcStatus: r.getText(FIELDS.MC_STATUS) as string,
    cardStatus: r.getValue(FIELDS.CARD_STATUS) as string,
    contractSigned: toBoolean(r.getValue(FIELDS.CONTRACT_SIGNED)),
    insuranceSigned: toBoolean(r.getValue(FIELDS.INSURANCE_SIGNED)),
    creditLimit,
    balance,
    availableBalance: computeAvailableBalance(creditLimit, balance),
    paymentDay: toNumber(r.getValue(FIELDS.PAYMENT_DAY)),
    contractNumber: (r.getValue(FIELDS.CONTRACT_NUMBER) as string) || '0',
    creditGranted: toNumber(r.getValue(FIELDS.CREDIT_GRANTED)),
    complemento: (r.getValue(FIELDS.COMPLEMENTO) as string) || '',
  });
};

export class NetSuiteCustomerRepository implements ICustomerRepository {
  findByDocumentNumber(documentNumber: string): Customer | null {
    return this.findOne(
      [
        [FIELDS.DOCUMENT_NUMBER, 'is', documentNumber],
        'AND',
        [FIELDS.SUBSIDIARY, 'is', SUBSIDIARY_ID],
        'AND',
        [FIELDS.IS_INACTIVE, 'is', 'false'],
      ],
      'NetSuiteCustomerRepository.findByDocumentNumber',
    );
  }

  findValidatedByDocument(documentNumber: string): Customer | null {
    return this.findOne(
      [
        [FIELDS.DOCUMENT_NUMBER, 'is', documentNumber],
        'AND',
        [FIELDS.SUBSIDIARY, 'is', SUBSIDIARY_ID],
        'AND',
        [FIELDS.IS_INACTIVE, 'is', 'false'],
        'AND',
        [FIELDS.MC_STATUS, 'is', APPROVED_STATUS_NAME],
        'AND',
        [FIELDS.CONTRACT_SIGNED, 'is', 'true'],
        'AND',
        [FIELDS.INSURANCE_SIGNED, 'is', 'true'],
      ],
      'NetSuiteCustomerRepository.findValidatedByDocument',
    );
  }

  findById(customerId: string): Customer | null {
    return this.findOne(
      [
        [FIELDS.INTERNAL_ID, 'is', customerId],
        'AND',
        [FIELDS.SUBSIDIARY, 'anyof', SUBSIDIARY_ID],
        'AND',
        [FIELDS.IS_INACTIVE, 'is', 'F'],
        'AND',
        [FIELDS.MC_STATUS, 'is', APPROVED_STATUS_NAME],
      ],
      'NetSuiteCustomerRepository.findById',
    );
  }

  setFirstSaleMulticardDateIfEmpty(customerId: string, date: Date): boolean {
    try {
      // Read current value of the date field
      const current = search.lookupFields({
        type: RECORD_CUSTOMER,
        id: customerId,
        columns: [FIELDS.DATE_FIRST_SALE_MULTICARD],
      }) as Record<string, string | null | undefined>;

      const currentValue = current[FIELDS.DATE_FIRST_SALE_MULTICARD];

      // If the field already has a value, do nothing
      if (currentValue !== null && currentValue !== undefined && currentValue !== '') {
        return false;
      }

      // Otherwise, write the date
      record.submitFields({
        type: RECORD_CUSTOMER,
        id: Number(customerId),
        values: { [FIELDS.DATE_FIRST_SALE_MULTICARD]: date },
        options: { ignoreMandatoryFields: true },
      });
      return true;
    } catch (err) {
      log.error({
        title: 'NetSuiteCustomerRepository.setFirstSaleMulticardDateIfEmpty',
        details: (err as Error).message,
      });
      return false;
    }
  }

  /** Runs a single-row customer search and maps it. Returns null on no-match or error. */
  private findOne(filters: unknown[], errorTitle: string): Customer | null {
    try {
      const results = search
        .create({
          type: RECORD_CUSTOMER,
          filters: filters as unknown as search.Filter[],
          columns: Object.values(FIELDS),
        })
        .run()
        .getRange({ start: 0, end: 1 });

      if (!results || results.length === 0) return null;
      return toCustomer(results[0]);
    } catch (err) {
      log.error({ title: errorTitle, details: (err as Error).message });
      return null;
    }
  }
}
