import { describe, it, expect } from 'vitest';
import { addBillingCycle, addDays } from '@/lib/billing/cycle';

describe('addBillingCycle', () => {
  it('MONTHLY adds one month', () => {
    expect(addBillingCycle(new Date('2026-01-15T00:00:00.000Z'), 'MONTHLY').toISOString()).toBe(
      '2026-02-15T00:00:00.000Z'
    );
  });

  it('QUARTERLY adds three months', () => {
    expect(addBillingCycle(new Date('2026-01-15T00:00:00.000Z'), 'QUARTERLY').toISOString()).toBe(
      '2026-04-15T00:00:00.000Z'
    );
  });

  it('FOUR_MONTHS adds four months', () => {
    expect(addBillingCycle(new Date('2026-01-15T00:00:00.000Z'), 'FOUR_MONTHS').toISOString()).toBe(
      '2026-05-15T00:00:00.000Z'
    );
  });

  it('SEMI_ANNUAL adds six months', () => {
    expect(addBillingCycle(new Date('2026-01-15T00:00:00.000Z'), 'SEMI_ANNUAL').toISOString()).toBe(
      '2026-07-15T00:00:00.000Z'
    );
  });

  it('YEARLY adds one year', () => {
    expect(addBillingCycle(new Date('2026-01-15T00:00:00.000Z'), 'YEARLY').toISOString()).toBe(
      '2027-01-15T00:00:00.000Z'
    );
  });

  it('CUSTOM falls back to one month, matching the documented safe default', () => {
    expect(addBillingCycle(new Date('2026-01-15T00:00:00.000Z'), 'CUSTOM').toISOString()).toBe(
      '2026-02-15T00:00:00.000Z'
    );
  });
});

describe('addDays', () => {
  it('adds the given number of days', () => {
    expect(addDays(new Date('2026-01-15T00:00:00.000Z'), 5).toISOString()).toBe('2026-01-20T00:00:00.000Z');
  });
});
