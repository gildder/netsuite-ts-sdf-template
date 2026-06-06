/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * Capa de dominio — installment. Lógica pura de amortización y fechas.
 * CERO imports de NetSuite. Totalmente unit-testeable sin stubs.
 */
import type { CustomerType } from '../../../shared/customer-type';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ANNUAL_INTEREST_RATE = 34.92 as const;
export const DAYS_VALID_DATE_PAY = 20 as const;

export const INSTALLMENT_STATUS = {
  ACTIVE: '1',
  MORA: '4',
} as const;

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface AmortizationRow {
  nro: number;
  fixedInstallment: number;
  interest: number;
  capital: number;
  remainingDebt: number;
}

export interface IInstallmentInput {
  customerId: string;
  invoiceId: string;
  amount: number;
  customerType: CustomerType;
  nroInstallment: number;
  paymentDay: number;
}

export interface IInstallmentCalculated {
  nro: number;
  fixedInstallment: number;
  interest: number;
  capital: number;
  remainingDebt: number;
}

export interface IInstallmentResult {
  id: string;
  nro: number;
  paymentDate: string;
  total: number;
}

/**
 * Shape used for persistence (passed to IInstallmentRepository.save).
 * Mirrors the createInstallment params from the legacy, adapted to clean arch.
 */
export interface InstallmentRecord {
  customerId: string;
  invoiceId: string;
  nro: number;
  paymentDate: Date;
  /** Full loan amount (MONTO_FINANC in NetSuite) */
  financedAmount: number;
  /** Capital portion of the installment (TOTAL_CAPITAL) */
  capital: number;
  /** Interest portion — stored as adminCharge (TOTAL_CARGO_ADMIN) in legacy */
  adminCharge: number;
  /** 4-decimal fixed installment (TOTAL_TOTAL in NetSuite) */
  total: number;
}

// ---------------------------------------------------------------------------
// Pure functions — amortization
// ---------------------------------------------------------------------------

/**
 * French (declining-balance) amortization.
 * Used for NORMAL ('1') and CORPORATE ('3') customer types.
 *
 * Rules (from legacy mc_multicard_lib_v1.0.js):
 * - r = ANNUAL_INTEREST_RATE / 100 / 12
 * - fixedInstallment computed ONCE at full precision
 * - Loop: interest = remainingDebt * r; capital = fixed - interest; remainingDebt -= capital
 * - Output rounded to 4 decimals via Number.parseFloat(x.toFixed(4)); remainingDebt clamped to >= 0
 * - NO last-row residual absorption
 *
 * @throws if amount <= 0 or nroInstallment <= 0
 */
export function buildAmortizationTable(amount: number, nroInstallment: number): AmortizationRow[] {
  if (amount <= 0) throw new Error('amount must be greater than 0');
  if (nroInstallment <= 0) throw new Error('nroInstallment must be greater than 0');

  const r = ANNUAL_INTEREST_RATE / 100 / 12;
  const fixedInstallment = (amount * r) / (1 - (1 + r) ** -nroInstallment);

  const rows: AmortizationRow[] = [];
  let remainingDebt = amount;

  for (let i = 1; i <= nroInstallment; i++) {
    const interest = remainingDebt * r;
    const capital = fixedInstallment - interest;
    remainingDebt -= capital;

    rows.push({
      nro: i,
      fixedInstallment: Number.parseFloat(fixedInstallment.toFixed(4)),
      interest: Number.parseFloat(interest.toFixed(4)),
      capital: Number.parseFloat(capital.toFixed(4)),
      remainingDebt: Number.parseFloat(Math.max(remainingDebt, 0).toFixed(4)),
    });
  }

  return rows;
}

/**
 * Flat (no-interest) amortization.
 * Used for EMPLOYEE ('2') customer type.
 *
 * Rules (from legacy):
 * - fixedAmount = Number.parseFloat((amount / n).toFixed(2))  — 2 decimal places
 * - Each row: fixedInstallment = capital = fixedAmount, interest = 0
 * - remainingDebt = max(amount - fixedAmount * (i + 1), 0)  — where i is 0-based loop index
 *
 * @throws if amount <= 0 or nroInstallment <= 0
 */
export function buildSimpleAmortization(amount: number, nroInstallment: number): AmortizationRow[] {
  if (amount <= 0) throw new Error('amount must be greater than 0');
  if (nroInstallment <= 0) throw new Error('nroInstallment must be greater than 0');

  const fixedAmount = Number.parseFloat((amount / nroInstallment).toFixed(2));
  const rows: AmortizationRow[] = [];

  for (let i = 0; i < nroInstallment; i++) {
    rows.push({
      nro: i + 1,
      fixedInstallment: fixedAmount,
      interest: 0,
      capital: fixedAmount,
      remainingDebt: Number.parseFloat(Math.max(amount - fixedAmount * (i + 1), 0).toFixed(4)),
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Pure functions — date scheduling
// ---------------------------------------------------------------------------

/**
 * Returns the date for a given day in a future month.
 *
 * Replicates legacy getNextMonthDate exactly:
 * - Clamps day to the last day of the target month using Math.min
 * - If the clamped date differs from the requested day → THROWS (not silently clamped)
 *
 * @param dayOfMonth - Desired day of month (1–31)
 * @param monthsToAdd - How many months ahead from refDate
 * @param refDate - Reference date (default: today). Inject for deterministic tests.
 * @throws if dayOfMonth does not exist in the target month
 */
export function getNextMonthDate(dayOfMonth: number, monthsToAdd: number, refDate?: Date): Date {
  const currentDate = refDate ?? new Date();
  const targetMonth = currentDate.getMonth() + monthsToAdd;
  const targetYear = currentDate.getFullYear() + Math.floor(targetMonth / 12);
  const adjustedMonth = targetMonth % 12;

  const lastDayOfMonth = new Date(targetYear, adjustedMonth + 1, 0).getDate();
  const clampedDay = Math.min(dayOfMonth, lastDayOfMonth);

  const resultDate = new Date(targetYear, adjustedMonth, clampedDay);

  if (resultDate.getDate() !== dayOfMonth) {
    throw new Error(`El día ${dayOfMonth} no es válido para el mes ${adjustedMonth + 1}.`);
  }

  return resultDate;
}

/**
 * Returns true if the payment date (dayOfMonth in next month from refDate) is
 * within DAYS_VALID_DATE_PAY (20) days from refDate.
 *
 * Replicates legacy isMinorDayLimit exactly.
 *
 * @param dayOfMonth - Payment day to evaluate
 * @param refDate - Reference date (default: today). Inject for deterministic tests.
 */
export function isMinorDayLimit(dayOfMonth: number, refDate?: Date): boolean {
  const currentDate = refDate ?? new Date();
  const targetMonth = currentDate.getMonth() + 1;
  const targetYear = currentDate.getFullYear() + Math.floor(targetMonth / 12);
  const adjustedMonth = targetMonth % 12;

  const resultDate = new Date(targetYear, adjustedMonth, dayOfMonth);
  const differenceInDays = (resultDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24);

  return differenceInDays <= DAYS_VALID_DATE_PAY;
}
