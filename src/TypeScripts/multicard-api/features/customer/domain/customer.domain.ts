/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Capa de dominio — lógica de negocio pura. CERO imports de NetSuite.
 */
import type { CustomerType } from '../../../shared/customer-type';

export const PHONE_LENGTH = 8 as const;
export const VALID_CARD_STATUS = '1' as const;
export const APPROVED_STATUS_NAME = 'Aprobado' as const;

export interface CustomerProps {
  id: string;
  documentNumber: string;
  firstName: string;
  secondName: string;
  firstLastName: string;
  secondLastName: string;
  email: string;
  mobilePhone: string;
  subsidiary: number;
  type: CustomerType | string;
  mcStatus: string;
  cardStatus: string;
  contractSigned: boolean;
  insuranceSigned: boolean;
  creditLimit: number;
  balance: number;
  availableBalance: number;
  paymentDay: number;
  typeDocument?: string;
  contractNumber?: string;
  creditGranted?: number;
  complemento?: string;
}

export interface CustomerJSON {
  id: string;
  documentNumber: string;
  name: string;
  mobilePhone: string;
  type: string;
  mcStatus: string;
  cardStatus: string;
  availableBalance: number;
}

export interface CustomerDetailJSON {
  id: string;
  documentNumber: string;
  typeDocument: string;
  name: string;
  email: string;
  mobilePhone: string;
  type: string;
  creditLimit: number;
  balance: number;
  paymentDay: number;
  contractNumber: string;
}

export class Customer {
  constructor(private readonly props: CustomerProps) {}

  get id(): string {
    return this.props.id;
  }

  get documentNumber(): string {
    return this.props.documentNumber;
  }

  get mobilePhone(): string {
    return this.props.mobilePhone;
  }

  get type(): string {
    return this.props.type;
  }

  get availableBalance(): number {
    return this.props.availableBalance;
  }

  get creditLimit(): number {
    return this.props.creditLimit;
  }

  get balance(): number {
    return this.props.balance;
  }

  get email(): string {
    return this.props.email ?? '';
  }

  get paymentDay(): number {
    return this.props.paymentDay;
  }

  get typeDocument(): string {
    return this.props.typeDocument ?? '';
  }

  get complemento(): string {
    return this.props.complemento ?? '';
  }

  get contractNumber(): string {
    return this.props.contractNumber ?? '0';
  }

  get fullName(): string {
    return [
      this.props.firstName,
      this.props.secondName,
      this.props.firstLastName,
      this.props.secondLastName,
    ]
      .map((n) => n?.trim().toUpperCase() ?? '')
      .filter((n) => n.length > 0)
      .join(' ');
  }

  isCardValid(): boolean {
    return this.props.cardStatus === VALID_CARD_STATUS;
  }

  isPhoneValid(): boolean {
    return !!this.props.mobilePhone && this.props.mobilePhone.length >= PHONE_LENGTH;
  }

  isApproved(): boolean {
    return this.props.mcStatus === APPROVED_STATUS_NAME;
  }

  hasBalance(): boolean {
    return this.props.availableBalance > 0;
  }

  belongsToSubsidiary(subsidiaryId: number): boolean {
    return this.props.subsidiary === subsidiaryId;
  }

  toJSON(): CustomerJSON {
    return {
      id: this.props.id,
      documentNumber: this.props.documentNumber,
      name: this.fullName,
      mobilePhone: this.props.mobilePhone,
      type: this.props.type,
      mcStatus: this.props.mcStatus,
      cardStatus: this.props.cardStatus,
      availableBalance: this.props.availableBalance,
    };
  }

  toDetailJSON(): CustomerDetailJSON {
    return {
      id: this.props.id,
      documentNumber: this.props.documentNumber,
      typeDocument: this.props.typeDocument ?? '',
      name: this.fullName,
      email: this.props.email ?? '',
      mobilePhone: this.props.mobilePhone,
      type: this.props.type,
      creditLimit: this.props.creditLimit,
      balance: this.props.balance,
      paymentDay: this.props.paymentDay,
      contractNumber: this.props.contractNumber ?? '0',
    };
  }
}

export const isValidDocumentNumber = (document: string): boolean =>
  !Number.isNaN(Number.parseFloat(document)) &&
  Number.isFinite(Number(document)) &&
  document.trim() !== '';
