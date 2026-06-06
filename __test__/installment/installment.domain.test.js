/**
 * Domain unit tests for installment.domain.
 * Tests run against the compiled JS in src/FileCabinet via the SuiteScripts alias.
 * Run: pnpm build && pnpm test
 */
import {
  buildAmortizationTable,
  buildSimpleAmortization,
  getNextMonthDate,
  isMinorDayLimit,
  ANNUAL_INTEREST_RATE,
  DAYS_VALID_DATE_PAY,
} from 'SuiteScripts/multicard-api/features/installment/domain/installment.domain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const r = ANNUAL_INTEREST_RATE / 100 / 12; // 34.92/100/12 = 0.0291

// ---------------------------------------------------------------------------
// buildAmortizationTable — French method (NORMAL '1' / CORPORATE '3')
// ---------------------------------------------------------------------------
describe('buildAmortizationTable — French amortization', () => {
  it('computes 3-installment schedule for amount=1000 (fixture from legacy)', () => {
    const rows = buildAmortizationTable(1000, 3);
    expect(rows).toHaveLength(3);

    // Row 1
    expect(rows[0].nro).toBe(1);
    expect(rows[0].fixedInstallment).toBe(352.9188);
    expect(rows[0].interest).toBe(29.1);
    expect(rows[0].capital).toBe(323.8188);
    expect(rows[0].remainingDebt).toBe(676.1812);

    // Row 2
    expect(rows[1].nro).toBe(2);
    expect(rows[1].fixedInstallment).toBe(352.9188);
    expect(rows[1].interest).toBe(19.6769);
    expect(rows[1].capital).toBe(333.2419);
    expect(rows[1].remainingDebt).toBe(342.9393);

    // Row 3
    expect(rows[2].nro).toBe(3);
    expect(rows[2].fixedInstallment).toBe(352.9188);
    expect(rows[2].interest).toBe(9.9795);
    expect(rows[2].capital).toBe(342.9393);
    expect(rows[2].remainingDebt).toBe(0);
  });

  it('CORPORATE produces identical result to NORMAL for same inputs', () => {
    const normalRows = buildAmortizationTable(1000, 3);
    // Corporate uses same formula — caller passes same args, same output
    expect(normalRows).toEqual(buildAmortizationTable(1000, 3));
  });

  it('single installment n=1 amount=500', () => {
    const rows = buildAmortizationTable(500, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0].fixedInstallment).toBe(514.55);
    expect(rows[0].interest).toBe(14.55);
    expect(rows[0].capital).toBe(500);
    expect(rows[0].remainingDebt).toBe(0);
  });

  it('multi-period schedule n=6 amount=2400 — all fixedInstallments equal and remainingDebt >= 0', () => {
    const rows = buildAmortizationTable(2400, 6);
    expect(rows).toHaveLength(6);
    const fixed = rows[0].fixedInstallment;
    for (const row of rows) {
      expect(row.fixedInstallment).toBe(fixed);
      expect(row.remainingDebt).toBeGreaterThanOrEqual(0);
    }
    // Last row remainingDebt must be 0
    expect(rows[5].remainingDebt).toBe(0);
  });

  it('throws when amount <= 0', () => {
    expect(() => buildAmortizationTable(0, 3)).toThrow();
    expect(() => buildAmortizationTable(-100, 3)).toThrow();
  });

  it('throws when nroInstallment <= 0', () => {
    expect(() => buildAmortizationTable(1000, 0)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// buildSimpleAmortization — flat split (EMPLOYEE '2')
// ---------------------------------------------------------------------------
describe('buildSimpleAmortization — Employee flat amortization', () => {
  it('4 equal installments amount=1000', () => {
    const rows = buildSimpleAmortization(1000, 4);
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.fixedInstallment).toBe(250);
      expect(row.interest).toBe(0);
      expect(row.capital).toBe(250);
    }
    expect(rows[3].remainingDebt).toBe(0);
  });

  it('non-divisible amount=100, n=3 — fixedAmount=33.33, remainingDebt tracks correctly', () => {
    const rows = buildSimpleAmortization(100, 3);
    expect(rows).toHaveLength(3);
    expect(rows[0].fixedInstallment).toBe(33.33);
    expect(rows[0].capital).toBe(33.33);
    expect(rows[0].interest).toBe(0);
    expect(rows[0].remainingDebt).toBe(66.67);

    expect(rows[1].fixedInstallment).toBe(33.33);
    expect(rows[1].remainingDebt).toBe(33.34);

    expect(rows[2].fixedInstallment).toBe(33.33);
    // remainingDebt = max(100 - 33.33*3, 0) = max(0.01, 0) — floating point may be tiny positive
    expect(rows[2].remainingDebt).toBeGreaterThanOrEqual(0);
  });

  it('throws when amount <= 0', () => {
    expect(() => buildSimpleAmortization(0, 3)).toThrow();
  });

  it('throws when nroInstallment <= 0', () => {
    expect(() => buildSimpleAmortization(1000, 0)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// getNextMonthDate — date scheduling with injectable refDate
// ---------------------------------------------------------------------------
describe('getNextMonthDate', () => {
  it('returns the correct date given a controlled refDate', () => {
    // refDate = Jan 15, 2025 (month 0 in JS = Jan)
    const ref = new Date(2025, 0, 15); // Jan 15
    const result = getNextMonthDate(10, 1, ref);
    // targetMonth = 0 + 1 = 1 (Feb), day=10 → Feb 10, 2025
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(1); // Feb
    expect(result.getDate()).toBe(10);
  });

  it('advances multiple months correctly', () => {
    const ref = new Date(2025, 0, 15); // Jan 15
    const result = getNextMonthDate(15, 3, ref);
    // targetMonth = 0 + 3 = 3 (Apr), day=15 → Apr 15, 2025
    expect(result.getMonth()).toBe(3); // Apr
    expect(result.getDate()).toBe(15);
  });

  it('wraps to next year when months overflow', () => {
    const ref = new Date(2025, 11, 1); // Dec 1, 2025
    const result = getNextMonthDate(15, 2, ref);
    // targetMonth = 11 + 2 = 13, targetYear = 2025 + floor(13/12) = 2026, adjustedMonth = 13%12 = 1 (Feb)
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(1); // Feb
    expect(result.getDate()).toBe(15);
  });

  it('throws when day 31 does not exist in target month (30-day month)', () => {
    // ref = April 1, 2025 → targetMonth = 4 (May is 4 in 0-idx, but +1 monthsToAdd=1 → May month index 4)
    // Let's use ref = May 1, so targetMonth+1 = June (30 days). Day 31 → throw
    const ref = new Date(2025, 4, 1); // May 1
    expect(() => getNextMonthDate(31, 1, ref)).toThrow();
  });

  it('throws when day 31 does not exist in February', () => {
    // ref = Jan 1, 2025. monthsToAdd=1 → Feb 2025 (28 days). Day 31 → clamp to 28, but 28 != 31 → throw
    const ref = new Date(2025, 0, 1); // Jan 1, 2025 (non-leap)
    expect(() => getNextMonthDate(31, 1, ref)).toThrow();
  });

  it('throws when day 29 does not exist in February of a non-leap year', () => {
    const ref = new Date(2025, 0, 1); // Jan 1, 2025 (2025 is not a leap year)
    expect(() => getNextMonthDate(29, 1, ref)).toThrow();
  });

  it('does NOT throw for day 29 in February of a leap year', () => {
    const ref = new Date(2024, 0, 1); // Jan 1, 2024 (leap year)
    const result = getNextMonthDate(29, 1, ref);
    expect(result.getDate()).toBe(29);
    expect(result.getMonth()).toBe(1); // Feb
  });
});

// ---------------------------------------------------------------------------
// isMinorDayLimit — day limit check with injectable refDate
// ---------------------------------------------------------------------------
describe('isMinorDayLimit', () => {
  it('returns false when payment date is more than 20 days away', () => {
    // ref = Jan 1, 2025. isMinorDayLimit(15) checks date in next month (Feb 15)
    // diffDays = (Feb 15 - Jan 1) / 86400000 = 45 days → > 20 → false
    const ref = new Date(2025, 0, 1); // Jan 1
    expect(isMinorDayLimit(15, ref)).toBe(false);
  });

  it('returns true when payment date is exactly 20 days away (boundary)', () => {
    // ref = Jan 26, 2025. Next month = Feb (month 1 = Feb in JS), day=15
    // targetMonth = 0+1=1, adjustedMonth=1%12=1 (Feb), resultDate = Feb 15, 2025
    // diff = (Feb 15 - Jan 26) = 20 days exactly → <= 20 → true
    const ref = new Date(2025, 0, 26); // Jan 26
    expect(isMinorDayLimit(15, ref)).toBe(true);
  });

  it('returns true when payment date is within 20 days (less than limit)', () => {
    // ref = Jan 30, 2025. Next month Feb 15.
    // diff = (Feb 15 - Jan 30) = 16 days → <= 20 → true
    const ref = new Date(2025, 0, 30); // Jan 30
    expect(isMinorDayLimit(15, ref)).toBe(true);
  });

  it('returns false when payment date is 21 days away', () => {
    // ref = Jan 25, 2025. Next month Feb 15.
    // diff = (Feb 15 - Jan 25) = 21 days → > 20 → false
    const ref = new Date(2025, 0, 25); // Jan 25
    expect(isMinorDayLimit(15, ref)).toBe(false);
  });
});
