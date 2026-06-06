/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Capa de dominio — invoice. Lógica pura. CERO imports de NetSuite.
 */

export interface InvoiceProps {
  id: string;
  date: string;
  time: string | undefined;
  location: string;
  invoiceNumber: string;
  customerNit: string;
  customerName: string;
  email: string;
  amount: string | number;
  cuf: string;
  customerId: string;
  cashRegister: number;
}

export interface InvoiceJSON {
  id: string;
  date: string;
  time: string | undefined;
  location: string;
  invoiceNumber: string;
  customerNit: string;
  customerName: string;
  email: string;
  amount: string | number;
  cuf: string;
  customerId: string;
  cashRegister: number;
}

export class Invoice {
  constructor(private readonly props: InvoiceProps) {}

  get id(): string {
    return this.props.id;
  }

  get customerId(): string {
    return this.props.customerId;
  }

  get date(): string {
    return this.props.date;
  }

  toJSON(): InvoiceJSON {
    return {
      id: this.props.id,
      date: this.props.date,
      time: this.props.time,
      location: this.props.location,
      invoiceNumber: this.props.invoiceNumber,
      customerNit: this.props.customerNit,
      customerName: this.props.customerName,
      email: this.props.email,
      amount: this.props.amount,
      cuf: this.props.cuf,
      customerId: this.props.customerId,
      cashRegister: this.props.cashRegister,
    };
  }
}

export const isValidInvoiceId = (id: string): boolean =>
  id.trim() !== '' && !Number.isNaN(Number.parseFloat(id)) && Number.isFinite(Number(id));
