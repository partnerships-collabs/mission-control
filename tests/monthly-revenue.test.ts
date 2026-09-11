import test from 'node:test'
import assert from 'node:assert/strict'
import { validMonthlyRevenue, type MonthlyRevenue } from '../convex/monthlyRevenueMath'
const totals = { close: 150, impact: 20, redventures: 0, adsbymoney: 10, msn: 25, monday_affiliates: 4 }
const history = (): MonthlyRevenue => ({ months: [
  { month: '2025-12', sources: { close: 100, impact: 20, redventures: 0, adsbymoney: 0, monday_affiliates: 5 } },
  { month: '2026-01', sources: { close: 50, impact: 0, redventures: 0, adsbymoney: 10, monday_affiliates: -1 } },
], undatedSources: { msn: 25 } })
test('monthly history reconciles each source including refunds and undated MSN across year boundaries', () => {
  assert.equal(validMonthlyRevenue(history(), totals, '2026-01-15'), true)
})
test('rejects duplicate, missing, future, invalid and out-of-order months', () => {
  for (const month of ['2025-12', '2026-00', '2026-13', '2026-02', '2025-10']) {
    const value = history(); value.months[1].month = month
    assert.equal(validMonthlyRevenue(value, totals, '2026-01-15'), false)
  }
  const gap = history(); gap.months[0].month = '2025-11'
  assert.equal(validMonthlyRevenue(gap, totals, '2026-01-15'), false)
})
test('rejects nonnumeric amounts and totals that hide a per-source mismatch', () => {
  for (const amount of [NaN, Infinity, '100', null, 1e20]) {
    const value = history(); Object.assign(value.months[0].sources, { close: amount })
    assert.equal(validMonthlyRevenue(value, totals, '2026-01-15'), false)
  }
  const value = history(); value.months[0].sources.close = 110; value.months[0].sources.impact = 10
  assert.equal(validMonthlyRevenue(value, totals, '2026-01-15'), false)
})
test('rejects unknown sources, missing undated balance and stale final month', () => {
  const value = history(); Object.assign(value.months[0].sources, { surprise: 0 })
  assert.equal(validMonthlyRevenue(value, totals, '2026-01-15'), false)
  assert.equal(validMonthlyRevenue({ ...history(), undatedSources: {} }, totals, '2026-01-15'), false)
  assert.equal(validMonthlyRevenue(history(), totals, '2026-02-01'), false)
})
