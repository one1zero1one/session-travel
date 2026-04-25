import { describe, it, expect, beforeEach } from 'vitest';
import { setContext, getContext, setConclusion, getConclusion } from '../src/store.js';

describe('store', () => {
  beforeEach(() => {
    // Reset between tests by setting to null via empty string won't work —
    // we'll test that the module resets in isolation. Each test file gets
    // fresh module via vitest isolation.
  });

  it('returns null when context slot is empty', () => {
    expect(getContext()).toBeNull();
  });

  it('stores and retrieves context', () => {
    setContext('hello context');
    expect(getContext()).toBe('hello context');
  });

  it('overwrites context silently', () => {
    setContext('first');
    setContext('second');
    expect(getContext()).toBe('second');
  });

  it('throws when context exceeds 1 MB', () => {
    const big = 'x'.repeat(1_000_001);
    expect(() => setContext(big)).toThrow('exceeds 1 MB');
  });

  it('returns null when conclusion slot is empty', () => {
    expect(getConclusion()).toBeNull();
  });

  it('stores and retrieves conclusion', () => {
    setConclusion('# Decision\n- Do the thing');
    expect(getConclusion()).toBe('# Decision\n- Do the thing');
  });

  it('throws when conclusion exceeds 1 MB', () => {
    const big = 'x'.repeat(1_000_001);
    expect(() => setConclusion(big)).toThrow('exceeds 1 MB');
  });
});
