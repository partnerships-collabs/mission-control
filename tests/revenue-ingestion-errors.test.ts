import test from 'node:test';
import assert from 'node:assert/strict';
import {ingestionError,ingestionIdentity} from '../convex/revenueIngestionErrors';

test('classifies failures without exposing exception text or embedded inputs',()=>{
  for(const [message,code] of [
    ['Function execution timed out PRIVATE','execution_limit'],
    ['Too many bytes read PRIVATE','read_limit'],
    ['ArgumentValidationError: PRIVATE','argument_validation'],
    ['Schema validation PRIVATE','schema_validation'],
    ['Conflicting run ID PRIVATE','conflicting_input'],
    ['Service temporarily unavailable PRIVATE','temporarily_unavailable'],
    ['unknown secret PRIVATE','internal_error'],
  ]){
    const detail=ingestionError(new Error(message));
    assert.equal(detail.code,code);assert.ok(!JSON.stringify(detail).includes('PRIVATE'));
    assert.equal(detail.retryable,code==='temporarily_unavailable');
  }
});
test('collection identity rejects malformed, stale and future clocks',()=>{
  const body={collectorRunId:crypto.randomUUID(),collectorStartedAt:new Date().toISOString()};
  assert.ok(ingestionIdentity(body));
  for(const value of [null,{}, {...body,collectorRunId:'private-input'},
    {...body,collectorStartedAt:'2026-02-30'},
    {...body,collectorStartedAt:new Date(Date.now()+120_000).toISOString()},
    {...body,collectorStartedAt:new Date(Date.now()-86_400_001).toISOString()}])assert.equal(ingestionIdentity(value),null);
});
