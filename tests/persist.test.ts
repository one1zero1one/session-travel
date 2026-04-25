import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

// Use a temp dir per test run
const TEST_DIR = join(tmpdir(), `st-test-${randomUUID()}`);

// Override DATA_DIR before importing
process.env.DATA_DIR = TEST_DIR;

const { loadTokens, saveTokens, _resetCache } = await import('../src/persist.js');

describe('persist', () => {
  beforeEach(() => {
    _resetCache();
    mkdirSync(TEST_DIR, { recursive: true });
    const tokenFile = join(TEST_DIR, 'tokens.json');
    if (existsSync(tokenFile)) rmSync(tokenFile);
  });

  it('returns empty store when file does not exist', () => {
    const tokens = loadTokens();
    expect(tokens.accessTokens).toEqual({});
    expect(tokens.refreshTokens).toEqual({});
    expect(tokens.clients).toEqual({});
    expect(tokens.authCodes).toEqual({});
  });

  it('saves and loads tokens', () => {
    const tokens = loadTokens();
    tokens.clients['client-1'] = { redirectUris: ['https://example.com/cb'] };
    saveTokens(tokens);

    const loaded = loadTokens();
    expect(loaded.clients['client-1']).toEqual({ redirectUris: ['https://example.com/cb'] });
  });

  it('atomic write: file is valid JSON after save', async () => {
    const tokens = loadTokens();
    tokens.accessTokens['tok'] = { clientId: 'c1', expiresAt: 9999999999999, resource: 'https://x.com' };
    saveTokens(tokens);

    const { readFileSync } = await import('fs');
    const raw = readFileSync(join(TEST_DIR, 'tokens.json'), 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});
