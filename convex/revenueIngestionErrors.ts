// Only these controlled codes may leave the server. Convex exceptions can
// contain entire documents, so never log/return the original exception text.
export function ingestionError(error: unknown) {
  const text = error instanceof Error ? error.message : '';
  const rules: Array<[RegExp, string, number, boolean]> = [
    [/execution timed out|execution time|function timed out|maximum.*time/i, 'execution_limit', 503, false],
    [/too many.*(?:read|scanned)|read.*limit|bytes.*read/i, 'read_limit', 503, false],
    [/too many.*writ|write.*limit/i, 'write_limit', 503, false],
    [/document.*(?:large|size)|value.*too large|exceeds.*size/i, 'document_size_limit', 422, false],
    [/ArgumentValidationError|argument validation/i, 'argument_validation', 422, false],
    [/schema|validator/i, 'schema_validation', 422, false],
    [/Conflicting run ID|conflicting_evidence|conflicting_manifest|sealed_evidence/i, 'conflicting_input', 409, false],
    [/too many concurrent|overloaded|temporarily unavailable|optimistic concurrency|OCC/i, 'temporarily_unavailable', 503, true],
  ];
  const match = rules.find(([pattern]) => pattern.test(text));
  return match ? {code: match[1], status: match[2], retryable: match[3]}
    : {code: 'internal_error', status: 500, retryable: false};
}

export function ingestionIdentity(body: unknown) {
  if (!body || typeof body !== 'object') return null;
  const {collectorRunId, collectorStartedAt} = body as Record<string, unknown>;
  if (typeof collectorRunId !== 'string' || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(collectorRunId)
      || typeof collectorStartedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(collectorStartedAt)) return null;
  const startedAt = Date.parse(collectorStartedAt);
  if (!Number.isFinite(startedAt) || startedAt > Date.now() + 60_000 || startedAt < Date.now() - 86_400_000) return null;
  return {collectorRunId, startedAt};
}
