import { describe, it, expect, beforeEach } from 'vitest';
import { setContext, getContext, setConclusion, getConclusion, resetStore } from '../src/store.js';

describe('store', () => {
  beforeEach(() => {
    resetStore();
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
