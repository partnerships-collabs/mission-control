export const MONTHLY_REVENUE_SOURCES = ['close', 'impact', 'redventures', 'adsbymoney', 'msn', 'monday_affiliates'] as const
export type MonthlySource = typeof MONTHLY_REVENUE_SOURCES[number]
export type MonthlySources = Partial<Record<MonthlySource, number>>
export type MonthlyRevenue = {
  months: Array<{ month: string; sources: MonthlySources }>
  undatedSources: MonthlySources
}

// Every source must reconcile to the same lifetime snapshot. Never infer a
// monthly figure from the change between two cumulative daily snapshots.
export function validMonthlyRevenue(value: unknown, totals: MonthlySources, snapshotDate: string): value is MonthlyRevenue {
  if (!value || typeof value !== 'object') return false
  const data = value as MonthlyRevenue
  if (!Array.isArray(data.months) || !data.months.length || data.months.length > 1200) return false
  const cents: MonthlySources = {}
  function add(sources: MonthlySources): boolean {
    if (!sources || typeof sources !== 'object' || Array.isArray(sources)) return false
    for (const [key, amount] of Object.entries(sources)) {
      if (!MONTHLY_REVENUE_SOURCES.includes(key as MonthlySource) || totals[key as MonthlySource] === undefined
        || typeof amount !== 'number' || !Number.isFinite(amount) || !Number.isSafeInteger(Math.round(amount * 100))) return false
      const source = key as MonthlySource
      cents[source] = (cents[source] ?? 0) + Math.round(amount * 100)
    }
    return true
  }
  let previous = ''
  for (const row of data.months) {
    if (!row || !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.month) || row.month <= previous
      || row.month > snapshotDate.slice(0, 7) || !add(row.sources)) return false
    if (previous) {
      const [year, month] = previous.split('-').map(Number)
      const next = `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}`
      if (row.month !== next) return false
    }
    previous = row.month
  }
  if (previous !== snapshotDate.slice(0, 7) || !add(data.undatedSources)) return false
  return Object.entries(totals).every(([key, amount]) => amount !== undefined
    && Number.isSafeInteger(cents[key as MonthlySource])
    && Math.abs(cents[key as MonthlySource]! - Math.round(amount * 100)) <= 1)
}
