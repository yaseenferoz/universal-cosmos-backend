import { describe, expect, it } from 'vitest';
import { convertLength, METERS_PER_PARSEC, METERS_PER_LIGHT_YEAR } from '../src/utils/units.js';
import { TtlCache } from '../src/utils/cache.js';

describe('explicit scientific unit conversion', () => {
  it('uses exact IAU au and metric scaling', () => {
    expect(convertLength(1, 'au', 'km')).toBe(149_597_870.7);
    expect(convertLength(1000, 'm', 'km')).toBe(1);
    expect(convertLength(1, 'pc', 'm')).toBe(METERS_PER_PARSEC);
    expect(convertLength(1, 'ly', 'm')).toBe(METERS_PER_LIGHT_YEAR);
    expect(convertLength(convertLength(3.2, 'pc', 'ly'), 'ly', 'pc')).toBeCloseTo(3.2, 12);
  });
  it('rejects nonfinite and unsupported inputs and overflow', () => {
    expect(() => convertLength(NaN, 'km', 'm')).toThrow();
    expect(() => convertLength(1, 'invalid' as 'km', 'm')).toThrow();
    expect(() => convertLength(Number.MAX_VALUE, 'ly', 'm')).toThrow();
  });
});

describe('bounded TTL cache', () => {
  it('expires and evicts least recently used values', () => {
    let time = 0;
    const cache = new TtlCache<number>(2, 10, () => time);
    cache.set('a', 1); cache.set('b', 2); cache.get('a'); cache.set('c', 3);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    time = 10;
    expect(cache.get('a')).toBeUndefined();
  });
  it('does not cache rejected loads', async () => {
    const cache = new TtlCache<number>();
    await expect(cache.getOrLoad('a', async () => { throw new Error('temporary'); })).rejects.toThrow('temporary');
    expect(await cache.getOrLoad('a', async () => 5)).toBe(5);
  });
});
