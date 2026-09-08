export async function fetchCloseWonTotal(
  apiKey: string,
  startDate: string,
  endDate: string,
  request: typeof fetch = fetch,
  requireRows = true,
): Promise<number> {
  if (!apiKey) throw new Error("CLOSE_API_KEY not configured");

  const authorization = `Basic ${btoa(`${apiKey}:`)}`;
  const pageSize = 100;
  let skip = 0;
  let totalUsd = 0;
  let opportunityCount = 0;
  let invalidCurrencyCount = 0;
  let invalidValuePeriodCount = 0;
  const seenIds = new Set<string>();

  while (true) {
    const url = new URL("https://api.close.com/api/v1/opportunity/");
    url.searchParams.set("status_type", "won");
    url.searchParams.set("date_won__gte", startDate);
    url.searchParams.set("date_won__lte", endDate);
    url.searchParams.set("_limit", String(pageSize));
    url.searchParams.set("_skip", String(skip));
    url.searchParams.set("_fields", "id,value,value_currency,value_period");

    const response = await request(url, {
      headers: { Authorization: authorization },
    });
    if (!response.ok) {
      throw new Error(`Close API returned ${response.status}`);
    }

    const payload = (await response.json()) as {
      data?: unknown;
      has_more?: unknown;
    };
    if (!Array.isArray(payload.data)) {
      throw new Error("Close API response is missing its opportunity list");
    }
    for (const value of payload.data) {
      if (!value || typeof value !== "object") {
        throw new Error("Close API returned a malformed opportunity");
      }
      const opportunity = value as Record<string, unknown>;
      const id = opportunity.id;
      if (typeof id !== "string" || !id) {
        throw new Error("Close API opportunity is missing its id");
      }
      if (seenIds.has(id)) {
        throw new Error("Close API pagination returned a duplicate opportunity");
      }
      seenIds.add(id);
      if (opportunity.value_currency !== "USD") invalidCurrencyCount += 1;
      if (opportunity.value_period !== "one_time") invalidValuePeriodCount += 1;
      const amountInCents = opportunity.value ?? 0;
      if (
        typeof amountInCents !== "number" ||
        !Number.isFinite(amountInCents) ||
        amountInCents < 0
      ) {
        throw new Error("Close API returned an invalid opportunity amount");
      }
      totalUsd += amountInCents / 100;
      opportunityCount += 1;
    }

    const hasMore = payload.has_more ?? false;
    if (typeof hasMore !== "boolean") {
      throw new Error("Close API returned invalid pagination metadata");
    }
    if (!hasMore) break;
    if (payload.data.length === 0) {
      throw new Error("Close API pagination stalled on an empty page");
    }
    skip += pageSize;
  }

  if (requireRows && opportunityCount === 0) {
    throw new Error("Close API returned no won opportunities for the requested period");
  }
  if (invalidCurrencyCount || invalidValuePeriodCount) {
    throw new Error(
      "Close API validation failed " +
        `(opportunities=${opportunityCount}, invalidCurrency=${invalidCurrencyCount}, ` +
        `invalidValuePeriod=${invalidValuePeriodCount})`,
    );
  }

  return totalUsd;
}
