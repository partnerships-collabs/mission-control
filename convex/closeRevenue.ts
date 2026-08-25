export async function fetchCloseWonTotal(
  apiKey: string,
  startDate: string,
  endDate: string,
  request: typeof fetch = fetch,
): Promise<number> {
  if (!apiKey) throw new Error("CLOSE_API_KEY not configured");

  const authorization = `Basic ${btoa(`${apiKey}:`)}`;
  const pageSize = 100;
  let skip = 0;
  let totalUsd = 0;

  while (true) {
    const url = new URL("https://api.close.com/api/v1/opportunity/");
    url.searchParams.set("status_type", "won");
    url.searchParams.set("date_won__gte", startDate);
    url.searchParams.set("date_won__lte", endDate);
    url.searchParams.set("_limit", String(pageSize));
    url.searchParams.set("_skip", String(skip));

    const response = await request(url, {
      headers: { Authorization: authorization },
    });
    if (!response.ok) {
      throw new Error(`Close API returned ${response.status}`);
    }

    const payload = (await response.json()) as {
      data?: Array<{ value?: number | null }>;
      has_more?: boolean;
    };
    for (const opportunity of payload.data ?? []) {
      totalUsd += Number(opportunity.value ?? 0) / 100;
    }

    if (!payload.has_more) break;
    skip += pageSize;
  }

  return totalUsd;
}
