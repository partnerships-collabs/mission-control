export type RevenueSources = {
  close?: number;
  copper?: number;
  impact?: number;
  adsbymoney?: number;
  redventures?: number;
  msn?: number;
};

export function mergeCloseSource(
  current: RevenueSources,
  closeYtdUsd: number,
): RevenueSources {
  const merged = { ...current, close: closeYtdUsd };
  delete merged.copper;
  return merged;
}

export function sumRevenueSources(sources: RevenueSources): number {
  return Object.values(sources).reduce(
    (sum, value) => sum + (typeof value === "number" ? value : 0),
    0,
  );
}

export function estimateLast30DayRevenue(
  totalYtdUsd: number,
  closeYtdUsd: number,
  closeLast30DayUsd: number,
  dayOfYear: number,
): number {
  if (closeYtdUsd > 0) {
    const nonCloseYtdUsd = totalYtdUsd - closeYtdUsd;
    return closeLast30DayUsd + nonCloseYtdUsd * (closeLast30DayUsd / closeYtdUsd);
  }
  return dayOfYear > 0 ? (totalYtdUsd / dayOfYear) * 30 : 0;
}

export function chicagoDateString(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function shiftDate(dateString: string, days: number): string {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dayOfYearForDate(dateString: string): number {
  const yearStart = Date.parse(`${dateString.slice(0, 4)}-01-01T00:00:00Z`);
  const date = Date.parse(`${dateString}T00:00:00Z`);
  return Math.floor((date - yearStart) / 86_400_000) + 1;
}

export function isSameRevenueYear(leftDate: string, rightDate: string): boolean {
  return leftDate.slice(0, 4) === rightDate.slice(0, 4);
}
