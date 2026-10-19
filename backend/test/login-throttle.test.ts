import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LoginThrottle } from '../src/login-throttle.js';

function makeThrottle() {
  let now = 1_000_000;
  const throttle = new LoginThrottle({
    maxFailures: 3,
    windowMs: 60_000,
    baseBlockMs: 1_000,
    maxBlockMs: 5_000,
    now: () => now,
  });
  return { throttle, advance: (ms: number) => { now += ms; } };
}

test('blocks after maxFailures and the block grows exponentially up to the cap', () => {
  const { throttle, advance } = makeThrottle();
  const key = LoginThrottle.keyFor('Owner@Example.com ', '203.0.113.9');
  assert.equal(key, 'owner@example.com|203.0.113.9');
  throttle.recordFailure(key);
  throttle.recordFailure(key);
  assert.equal(throttle.retryAfterMs(key), 0);
  throttle.recordFailure(key);
  assert.equal(throttle.retryAfterMs(key), 1_000);
  throttle.recordFailure(key);
  assert.equal(throttle.retryAfterMs(key), 2_000);
  throttle.recordFailure(key);
  assert.equal(throttle.retryAfterMs(key), 4_000);
  throttle.recordFailure(key);
  assert.equal(throttle.retryAfterMs(key), 5_000, 'capped at maxBlockMs');
  advance(5_001);
  assert.equal(throttle.retryAfterMs(key), 0, 'block expires');
});

test('success clears the record; other accounts and networks are unaffected', () => {
  const { throttle } = makeThrottle();
  const a = LoginThrottle.keyFor('a@example.com', '203.0.113.9');
  const b = LoginThrottle.keyFor('b@example.com', '203.0.113.9');
  const aOtherNetwork = LoginThrottle.keyFor('a@example.com', '198.51.100.2');
  for (let i = 0; i < 3; i += 1) throttle.recordFailure(a);
  assert.ok(throttle.retryAfterMs(a) > 0);
  assert.equal(throttle.retryAfterMs(b), 0, 'different account on same IP not blocked');
  assert.equal(throttle.retryAfterMs(aOtherNetwork), 0, 'same account on other network not blocked');
  throttle.recordSuccess(a);
  assert.equal(throttle.retryAfterMs(a), 0, 'success clears the block');
});

test('failures outside the window stop counting', () => {
  const { throttle, advance } = makeThrottle();
  const key = LoginThrottle.keyFor('a@example.com', '203.0.113.9');
  throttle.recordFailure(key);
  throttle.recordFailure(key);
  advance(61_000);
  throttle.recordFailure(key);
  throttle.recordFailure(key);
  assert.equal(throttle.retryAfterMs(key), 0, 'only two failures inside the window');
});
