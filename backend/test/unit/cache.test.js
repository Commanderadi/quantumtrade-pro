'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TtlCache } = require('../../src/utils/cache');

test('expires entries after their ttl', () => {
    let now = 0;
    const cache = new TtlCache({ now: () => now });
    cache.set('a', 1, 100);
    assert.equal(cache.get('a'), 1);
    now = 100;
    assert.equal(cache.get('a'), undefined);
});

test('wrap de-duplicates concurrent loads and caches the result', async () => {
    const cache = new TtlCache();
    let calls = 0;
    const loader = async () => { calls += 1; await new Promise((r) => setTimeout(r, 10)); return 'v'; };
    const results = await Promise.all([cache.wrap('k', 1000, loader), cache.wrap('k', 1000, loader)]);
    assert.deepEqual(results, ['v', 'v']);
    assert.equal(await cache.wrap('k', 1000, loader), 'v');
    assert.equal(calls, 1);
});

test('wrap does not cache failures', async () => {
    const cache = new TtlCache();
    await assert.rejects(cache.wrap('k', 1000, async () => { throw new Error('boom'); }));
    assert.equal(await cache.wrap('k', 1000, async () => 'ok'), 'ok');
});

test('evicts the oldest entry when full', () => {
    const cache = new TtlCache({ maxEntries: 2 });
    cache.set('a', 1, 1000);
    cache.set('b', 2, 1000);
    cache.set('c', 3, 1000);
    assert.equal(cache.get('a'), undefined);
    assert.equal(cache.get('c'), 3);
});
